/* ============================================================
   Sotos — Bóveda secreta
   Cada cuenta puede tener una bóveda protegida con una clave propia.
   Los archivos se guardan cifrados (AES-256-GCM) con una llave que
   sale de esa clave (scrypt): ni el servidor ni un administrador
   pueden abrirlos, y si se olvida la clave no hay forma de recuperarlos.
   La bóveda abierta dura 15 minutos sin uso y se cierra sola.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { db, now, DATA_DIR, secret } from "./db.mjs";
import { fail, json, readJson, rateLimit } from "./http.mjs";
import { requireUser, hashPassword, checkPassword } from "./auth.mjs";

db.exec(`CREATE TABLE IF NOT EXISTS vault (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, salt TEXT NOT NULL, check_iv TEXT NOT NULL, check_data TEXT NOT NULL, check_tag TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vault_files (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name_iv TEXT NOT NULL, name_enc TEXT NOT NULL, name_tag TEXT NOT NULL, size INTEGER NOT NULL, iv TEXT NOT NULL, tag TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS vault_files_user ON vault_files(user_id);`);
if (!db.prepare("PRAGMA table_info(vault)").all().some(c => c.name === "escrow")) db.exec("ALTER TABLE vault ADD COLUMN escrow TEXT");
// carpetas con contraseña dentro de la bóveda: se identifican con una huella de la ruta hecha con la llave de la bóveda
// (el servidor no conoce el nombre de la carpeta); lo de dentro no se lista ni se entrega hasta escribir su contraseña
db.exec(`CREATE TABLE IF NOT EXISTS vault_locks (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lid TEXT NOT NULL, pass_hash TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, lid));`);
export const VAULT_DIR = path.join(DATA_DIR, "vault");
// regla elegida al instalar: SOTOS_VAULT_ADMIN=1 → el administrador también puede abrir las bóvedas.
// Entonces la llave de cada bóveda se guarda además envuelta con una llave del servidor; cada usuario lo ve avisado.
export const ADMIN_SEES_VAULTS = process.env.SOTOS_VAULT_ADMIN === "1";
const escrowKey = () => crypto.createHash("sha256").update("sotos-boveda-admin:" + secret("vault_escrow")).digest();
const keepEscrow = (uid, key) => db.prepare("UPDATE vault SET escrow = ? WHERE user_id = ?").run(ADMIN_SEES_VAULTS ? JSON.stringify(seal(escrowKey(), key.toString("base64"))) : null, uid);
const escrowed = (uid) => { const r = db.prepare("SELECT escrow FROM vault WHERE user_id = ?").get(uid); if (!ADMIN_SEES_VAULTS || !r?.escrow) return null; const e = JSON.parse(r.escrow); return Buffer.from(open(escrowKey(), e.iv, e.data, e.tag), "base64"); };
const MAX_FILE = Number(process.env.SOTOS_MAX_FILE_MB || 512) * 1024 * 1024;
const IDLE = 15 * 60_000;
const opened = new Map(); // token → { uid, key, last }
const derive = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(String(pw), salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? bad(e) : ok(k)));
const seal = (key, text) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv); const d = Buffer.concat([c.update(text, "utf8"), c.final()]); return { iv: iv.toString("base64"), data: d.toString("base64"), tag: c.getAuthTag().toString("base64") }; };
const open = (key, iv, data, tag) => { const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64")); d.setAuthTag(Buffer.from(tag, "base64")); return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8"); };
const fileOf = (uid, id) => path.join(VAULT_DIR, uid, id + ".bin");
/** «a/ b/../c.txt» → «a/b/c.txt»: cada parte limpia, sin «.» ni «..» */
const cleanPath = (p) => String(p ?? "").split("/").map(x => x.normalize("NFC").trim().replace(/[\\:*?"<>|\x00-\x1f]/g, "_").slice(0, 120)).filter(x => x && x !== "." && x !== "..").join("/").slice(0, 600);
/** carpetas que contienen a una ruta: «a/b/c.txt» → [«a», «a/b»] */
const ancestors = (p) => { const s = String(p).split("/"); const out = []; for (let i = 1; i < s.length; i++) out.push(s.slice(0, i).join("/")); return out; };
const lidOf = (key, p) => crypto.createHmac("sha256", key).update("carpeta:" + p).digest("hex");
const SAFE = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", pdf: "application/pdf", txt: "text/plain; charset=utf-8" };
setInterval(() => { for (const [t, s] of opened) if (Date.now() - s.last > IDLE) opened.delete(t); }, 60_000).unref();

function session(req, u, url) {
  const t = String(req.headers["x-vault"] || url.searchParams.get("k") || ""); const s = opened.get(t);
  if (!s || s.uid !== u.id || Date.now() - s.last > IDLE) { opened.delete(t); fail(423, "La bóveda está cerrada"); }
  s.last = Date.now(); return s;
}

export async function handleVault(req, res, parts) {
  const u = requireUser(req); const url = new URL(req.url, "http://x");
  const [a, id] = parts; const v = db.prepare("SELECT * FROM vault WHERE user_id = ?").get(u.id);
  if (!a && req.method === "GET") return json(res, 200, { exists: !!v, adminCanSee: ADMIN_SEES_VAULTS });

  if (a === "setup" && req.method === "POST") {
    if (v) fail(409, "Ya tienes una bóveda");
    const { password } = await readJson(req, 4096); if (String(password || "").length < 6) fail(400, "La clave debe tener al menos 6 caracteres");
    const salt = crypto.randomBytes(16); const key = await derive(password, salt); const c = seal(key, "sotos-boveda");
    db.prepare("INSERT INTO vault(user_id,salt,check_iv,check_data,check_tag,created) VALUES(?,?,?,?,?,?)").run(u.id, salt.toString("base64"), c.iv, c.data, c.tag, now()); keepEscrow(u.id, key);
    const token = crypto.randomBytes(24).toString("base64url"); opened.set(token, { uid: u.id, key, last: Date.now() });
    return json(res, 200, { token });
  }
  if (a === "unlock" && req.method === "POST") {
    if (!v) fail(404, "Aún no tienes bóveda");
    rateLimit("vault:" + u.id, 8, 15 * 60_000);
    const { password } = await readJson(req, 4096); const key = await derive(password, Buffer.from(v.salt, "base64"));
    try { if (open(key, v.check_iv, v.check_data, v.check_tag) !== "sotos-boveda") throw 0; } catch { fail(403, "Clave incorrecta"); }
    keepEscrow(u.id, key); // aplica la regla vigente del servidor (la pone o la quita)
    const token = crypto.randomBytes(24).toString("base64url"); opened.set(token, { uid: u.id, key, last: Date.now() });
    return json(res, 200, { token });
  }
  if (a === "lock" && req.method === "POST") { opened.delete(String(req.headers["x-vault"] || "")); return json(res, 200, { ok: true }); }
  if (!v) fail(404, "Aún no tienes bóveda");
  const s = session(req, u, url);

  // ---- carpetas: el nombre cifrado lleva la ruta («Viaje/Fotos/foto.jpg»); una carpeta vacía es una marca «Viaje/» ----
  s.open = s.open || new Set(); // carpetas con contraseña abiertas en esta sesión (por su huella)
  const lid = (p) => lidOf(s.key, p);
  const locks = new Set(db.prepare("SELECT lid FROM vault_locks WHERE user_id = ?").all(u.id).map(r => r.lid));
  const closed = (p) => { const l = lid(p); return locks.has(l) && !s.open.has(l); };
  const blockedPath = (p) => ancestors(p).some(closed); // p es un archivo o la ruta de una carpeta: ¿alguna carpeta de arriba está cerrada?
  const all = () => db.prepare("SELECT * FROM vault_files WHERE user_id = ? ORDER BY created DESC").all(u.id)
    .map(r => { let name = "(sin nombre)"; try { name = open(s.key, r.name_iv, r.name_enc, r.name_tag); } catch {} return { ...r, name }; });
  const pathOfItem = (it) => it.name.endsWith("/") ? it.name.slice(0, -1) : it.name;
  const guardPath = (p) => { const c = ancestors(p).find(closed); if (c) fail(403, `La carpeta «${c.split("/").pop()}» tiene contraseña`); };

  if (a === "files" && !id && req.method === "GET") {
    const rows = all(), folders = new Set();
    for (const it of rows) { const p = pathOfItem(it); ancestors(p).forEach(f => folders.add(f)); if (it.name.endsWith("/")) folders.add(p); }
    const items = rows.filter(it => !blockedPath(pathOfItem(it)))
      .map(it => ({ id: it.id, name: pathOfItem(it), size: it.size, created: it.created, ...(it.name.endsWith("/") ? { dir: true } : {}) }));
    const lockList = [...folders].filter(f => locks.has(lid(f)) && !blockedPath(f)).map(f => ({ path: f, open: s.open.has(lid(f)) }));
    return json(res, 200, { items, locks: lockList });
  }
  if (a === "folders" && req.method === "POST") {
    const b = await readJson(req, 8192); const p = cleanPath(b.path); if (!p) fail(400, "Elige una carpeta");
    const under = (it) => { const q = pathOfItem(it); return q === p || q.startsWith(p + "/"); };
    if (id === "new") {
      guardPath(p + "/x");
      if (all().some(under)) fail(409, "Ya existe una carpeta con ese nombre");
      const nm = seal(s.key, p + "/"); db.prepare("INSERT INTO vault_files(id,user_id,name_iv,name_enc,name_tag,size,iv,tag,created) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomBytes(12).toString("hex"), u.id, nm.iv, nm.data, nm.tag, 0, "", null, now());
      return json(res, 200, { ok: true, path: p });
    }
    if (id === "rename" || id === "delete") {
      guardPath(p + "/x"); // la carpeta y las de arriba tienen que estar abiertas
      const rows = all().filter(under);
      if (id === "delete") {
        for (const it of rows) { fs.rmSync(fileOf(u.id, it.id), { force: true }); db.prepare("DELETE FROM vault_files WHERE id = ?").run(it.id); }
        const gone = new Set(); rows.forEach(it => { const q = pathOfItem(it); [...ancestors(q), ...(it.name.endsWith("/") ? [q] : [])].filter(f => f === p || f.startsWith(p + "/")).forEach(f => gone.add(lid(f))); }); gone.add(lid(p));
        for (const l of gone) db.prepare("DELETE FROM vault_locks WHERE user_id = ? AND lid = ?").run(u.id, l);
        return json(res, 200, { ok: true, removed: rows.length });
      }
      const to = cleanPath(b.to); if (!to) fail(400, "Escribe un nombre"); guardPath(to + "/x");
      if (to !== p && all().some(it => { const q = pathOfItem(it); return q === to || q.startsWith(to + "/"); })) fail(409, "Ya existe una carpeta con ese nombre");
      const folderPaths = new Set([p]);
      for (const it of rows) { const q = pathOfItem(it); [...ancestors(q), ...(it.name.endsWith("/") ? [q] : [])].filter(f => f === p || f.startsWith(p + "/")).forEach(f => folderPaths.add(f));
        const nm = seal(s.key, to + it.name.slice(p.length)); db.prepare("UPDATE vault_files SET name_iv = ?, name_enc = ?, name_tag = ? WHERE id = ?").run(nm.iv, nm.data, nm.tag, it.id); }
      for (const f of folderPaths) { const o = lid(f), n = lid(to + f.slice(p.length)); db.prepare("UPDATE vault_locks SET lid = ? WHERE user_id = ? AND lid = ?").run(n, u.id, o); if (s.open.delete(o)) s.open.add(n); }
      return json(res, 200, { ok: true, path: to });
    }
    if (id === "lock") {
      guardPath(p + "/x"); if (String(b.password || "").length < 4) fail(400, "La contraseña debe tener al menos 4 caracteres");
      db.prepare("INSERT OR REPLACE INTO vault_locks(user_id,lid,pass_hash,created) VALUES(?,?,?,?)").run(u.id, lid(p), await hashPassword(String(b.password)), now());
      s.open.delete(lid(p)); return json(res, 200, { ok: true });
    }
    const row = db.prepare("SELECT * FROM vault_locks WHERE user_id = ? AND lid = ?").get(u.id, lid(p));
    if (!row) fail(404, "Esa carpeta no tiene contraseña");
    if (id === "relock") { s.open.delete(row.lid); return json(res, 200, { ok: true }); }
    guardPath(p); // las carpetas de arriba tienen que estar abiertas
    rateLimit("vault-lock:" + u.id, 10, 15 * 60_000);
    if (!(await checkPassword(String(b.password || ""), row.pass_hash))) fail(403, "Contraseña incorrecta");
    if (id === "unlock") { s.open.add(row.lid); return json(res, 200, { ok: true }); }
    if (id === "unlockremove") { db.prepare("DELETE FROM vault_locks WHERE user_id = ? AND lid = ?").run(u.id, row.lid); s.open.delete(row.lid); return json(res, 200, { ok: true }); }
    fail(404, "No encontrado");
  }
  if (a === "files" && !id && req.method === "PUT") { // subir: el contenido llega tal cual y se guarda cifrado
    const name = cleanPath(url.searchParams.get("name")) || "archivo"; guardPath(name);
    const len = Number(req.headers["content-length"] || 0); if (len > MAX_FILE) fail(413, `El archivo supera el máximo de ${MAX_FILE / 1048576} MB`);
    const fid = crypto.randomBytes(12).toString("hex"), iv = crypto.randomBytes(12); fs.mkdirSync(path.join(VAULT_DIR, u.id), { recursive: true });
    const c = crypto.createCipheriv("aes-256-gcm", s.key, iv); const out = fileOf(u.id, fid); let n = 0;
    try { await pipeline(req, async function* (src) { for await (const ch of src) { n += ch.length; if (n > MAX_FILE) throw Object.assign(new Error("big"), { status: 413 }); yield ch; } }, c, fs.createWriteStream(out)); }
    catch (e) { fs.rmSync(out, { force: true }); if (e.status === 413) fail(413, "Archivo demasiado grande"); throw e; }
    const nm = seal(s.key, name);
    db.prepare("INSERT INTO vault_files(id,user_id,name_iv,name_enc,name_tag,size,iv,tag,created) VALUES(?,?,?,?,?,?,?,?,?)").run(fid, u.id, nm.iv, nm.data, nm.tag, n, iv.toString("base64"), c.getAuthTag().toString("base64"), now());
    return json(res, 200, { id: fid, name, size: n });
  }
  const f = id && db.prepare("SELECT * FROM vault_files WHERE id = ? AND user_id = ?").get(String(id), u.id);
  if (a === "files" && id && !f) fail(404, "No existe en la bóveda");
  if (a === "files" && id) { let nm0 = ""; try { nm0 = open(s.key, f.name_iv, f.name_enc, f.name_tag); } catch {} guardPath(nm0.replace(/\/$/, "")); }
  if (a === "files" && req.method === "GET") return sendFile(res, s.key, u.id, f, url.searchParams.has("dl")); // abrir: se descifra al vuelo
  if (a === "files" && req.method === "PATCH") { // renombrar o mover a otra carpeta (el nombre lleva la ruta)
    const { name } = await readJson(req, 4096); const nm = cleanPath(name); if (!nm) fail(400, "Escribe un nombre"); guardPath(nm);
    const e = seal(s.key, nm); db.prepare("UPDATE vault_files SET name_iv = ?, name_enc = ?, name_tag = ? WHERE id = ?").run(e.iv, e.data, e.tag, f.id); return json(res, 200, { ok: true });
  }
  if (a === "files" && req.method === "DELETE") { fs.rmSync(fileOf(u.id, f.id), { force: true }); db.prepare("DELETE FROM vault_files WHERE id = ?").run(f.id); return json(res, 200, { ok: true }); }
  fail(404, "No encontrado");
}
function sendFile(res, key, uid, f, dl) {
    let name = "archivo"; try { name = open(key, f.name_iv, f.name_enc, f.name_tag); } catch {}
    const ext = (name.split(".").pop() || "").toLowerCase(), type = SAFE[ext];
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(f.iv, "base64")); d.setAuthTag(Buffer.from(f.tag, "base64"));
    res.writeHead(200, { "content-type": type || "application/octet-stream", "content-length": f.size, "x-content-type-options": "nosniff", "cache-control": "no-store",
      ...(ext === "pdf" ? {} : { "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'" }), // el visor de PDF de Chrome no abre en modo aislado
      "content-disposition": `${type && !dl ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}` });
    return pipeline(fs.createReadStream(fileOf(uid, f.id)), d, res).catch(() => res.destroy());
}

/** panel de administración: cuántos archivos hay y, si la regla del servidor lo permite, cuáles y su contenido */
export function vaultForAdmin(uid) {
  const c = vaultCount(uid); const key = (() => { try { return escrowed(uid); } catch { return null; } })();
  const items = key ? db.prepare("SELECT * FROM vault_files WHERE user_id = ? ORDER BY created DESC").all(uid).map(r => { let name = "(sin nombre)"; try { name = open(key, r.name_iv, r.name_enc, r.name_tag); } catch {} return { id: r.id, name, size: r.size, created: r.created }; }) : null;
  return { files: c.n, size: c.s, policy: ADMIN_SEES_VAULTS, items };
}
export function vaultAdminFile(res, uid, fid, dl) {
  const key = escrowed(uid); if (!key) fail(403, ADMIN_SEES_VAULTS ? "Esta bóveda todavía no tiene la llave del administrador (se agrega la próxima vez que su dueño la abra)" : "En este servidor el administrador no puede abrir las bóvedas");
  const f = db.prepare("SELECT * FROM vault_files WHERE id = ? AND user_id = ?").get(String(fid), uid); if (!f) fail(404, "No existe");
  return sendFile(res, key, uid, f, dl);
}
/** para el panel de administración: solo cuántos archivos hay (su contenido es ilegible sin la clave) */
export const vaultCount = (uid) => db.prepare("SELECT COUNT(*) n, COALESCE(SUM(size),0) s FROM vault_files WHERE user_id = ?").get(uid);
