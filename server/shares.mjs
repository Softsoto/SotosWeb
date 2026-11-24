/* ============================================================
   Sotos OS — compartir: enlaces públicos y "compartido conmigo"
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { db, now, rid, secret } from "./db.mjs";
import { fail, json, readJson, rateLimit, clientIp, jwtSign, jwtVerify } from "./http.mjs";
import { requireUser, currentUser, hashPassword, checkPassword } from "./auth.mjs";
import { loadState, blobPath, applyOps } from "./fs.mjs";
import { guardLocked, lockedFolder } from "./candados.mjs";
import { typeOf, newId, quotaOf, MAX_FILE } from "./dav.mjs";

// enlaces con contraseña, límite de descargas, contadores y carpetas «solo subir» (pedir archivos)
for (const c of ["pass_hash TEXT", "max_downloads INTEGER", "downloads INTEGER NOT NULL DEFAULT 0", "views INTEGER NOT NULL DEFAULT 0", "uploads INTEGER NOT NULL DEFAULT 0"])
  if (!db.prepare("PRAGMA table_info(shares)").all().some(x => x.name === c.split(" ")[0])) db.exec(`ALTER TABLE shares ADD COLUMN ${c}`);
const keyFor = (token) => jwtSign({ t: token, k: "share" }, secret("share"), 12 * 3600);
const unlocked = (s, req) => { const url = new URL(req.url, "http://x"); const k = req.headers["x-share-key"] || url.searchParams.get("k"); if (!k) return false; try { const p = jwtVerify(String(k), secret("share")); return p.k === "share" && p.t === s.token; } catch { return false; } };
import { addNotification } from "./social.mjs";
import { index, findNode, ROOT } from "../web/src/os/tree-ops.js";

// tipos que se pueden mostrar en línea sin riesgo (nunca HTML/SVG/JS en el origen de Sotos)
const INLINE = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp",
  pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", txt: "text/plain; charset=utf-8" };
const extOf = (n) => (/\.([^.]+)$/.exec(n) || [])[1]?.toLowerCase() || "";

export function sendBlob(res, userId, node, { download = false } = {}) {
  const p = blobPath(userId, node.id);
  if (!fs.existsSync(p)) {
    if (node.url) { res.writeHead(302, { location: node.url }); return res.end(); }
    fail(404, "Contenido no disponible");
  }
  const ext = extOf(node.name); const type = INLINE[ext];
  const disp = `${download || !type ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(node.name)}`;
  res.writeHead(200, {
    "content-type": type || "application/octet-stream", "content-length": fs.statSync(p).size, "content-disposition": disp,
    "x-content-type-options": "nosniff", "cache-control": "private, max-age=300",
    // Chrome no muestra PDF dentro de un sandbox; el resto de tipos sí se aíslan
    ...(ext === "pdf" ? {} : { "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" }),
  });
  return pipeline(fs.createReadStream(p), res);
}

function shareRow(token) {
  const s = db.prepare("SELECT s.*, u.name AS owner FROM shares s JOIN users u ON u.id = s.user_id WHERE s.token = ?").get(token);
  if (!s || (s.expires && s.expires < now())) fail(404, "Este enlace no existe o ha caducado");
  const node = findNode({ root: loadState(s.user_id).state.root, trash: [] }, s.node_id);
  if (!node) fail(404, "El archivo compartido ya no existe");
  return { s, node };
}
/** lo que está en una carpeta con contraseña no se entrega por enlace mientras esa carpeta esté cerrada */
function notLocked(s, nodeId, req) {
  const f = lockedFolder(s.user_id, nodeId, req);
  if (f) fail(403, "Este contenido está en una carpeta con contraseña");
}
/** acceso a un recurso compartido: público por enlace, o restringido a destinatarios */
function canSee(s, req) {
  const me = currentUser(req); if (me && me.id === s.user_id) return true; // el dueño siempre entra
  if (s.pass_hash && !unlocked(s, req)) fail(423, "Este enlace tiene contraseña");
  const restricted = db.prepare("SELECT COUNT(*) n FROM share_users WHERE token = ?").get(s.token).n > 0;
  if (!restricted) return true;
  const u = currentUser(req); if (!u) fail(401, "Inicia sesión para ver este elemento");
  if (u.id === s.user_id) return true;
  if (!db.prepare("SELECT 1 FROM share_users WHERE token = ? AND user_id = ?").get(s.token, u.id)) fail(403, "No tienes acceso a este elemento");
  return true;
}
export function resolveShare(token, req) { const r = shareRow(token); canSee(r.s, req); notLocked(r.s, r.s.node_id, req); return r; }

export async function handleShares(req, res, parts) {
  const u = requireUser(req);
  const [a] = parts;
  if (!a && req.method === "GET") {
    const st = loadState(u.id).state; const map = index(st.root);
    const rows = db.prepare("SELECT * FROM shares WHERE user_id = ? ORDER BY created DESC").all(u.id);
    return json(res, 200, { shares: rows.map(r => ({ token: r.token, nodeId: r.node_id, perm: r.perm, created: r.created, expires: r.expires, hasPassword: !!r.pass_hash, maxDownloads: r.max_downloads, downloads: r.downloads, views: r.views, uploads: r.uploads, name: map.get(r.node_id)?.node.name || "(eliminado)",
      people: db.prepare("SELECT u.email, u.name FROM share_users su JOIN users u ON u.id = su.user_id WHERE su.token = ?").all(r.token) })) });
  }
  if (!a && req.method === "POST") {
    const { nodeId, perm, days, emails, password, maxDownloads } = await readJson(req, 16384);
    if (nodeId === ROOT) fail(400, "No se puede compartir todo el Drive");
    const target = findNode({ root: loadState(u.id).state.root, trash: [] }, nodeId); if (!target) fail(404, "No existe");
    guardLocked(u.id, target.id, req);
    const p = perm === "edit" ? "edit" : perm === "upload" ? "upload" : "view";
    if (p === "upload" && !target.children) fail(400, "Solo se pueden pedir archivos en una carpeta");
    const exp = Number(days) > 0 ? now() + Math.min(365, Number(days)) * 86400_000 : null;
    const pw = String(password || ""); if (pw && pw.length < 4) fail(400, "La contraseña del enlace debe tener al menos 4 caracteres");
    const maxDl = Number(maxDownloads) > 0 ? Math.min(100000, Math.round(Number(maxDownloads))) : null;
    const token = rid(16);
    db.prepare("INSERT INTO shares(token,user_id,node_id,perm,created,expires,pass_hash,max_downloads) VALUES(?,?,?,?,?,?,?,?)").run(token, u.id, nodeId, p, now(), exp, pw ? await hashPassword(pw) : null, p === "upload" ? null : maxDl);
    const missing = [];
    for (const e of (Array.isArray(emails) ? emails : []).slice(0, 50)) {
      const em = String(e).trim().toLowerCase(); if (!em) continue;
      const t = db.prepare("SELECT id FROM users WHERE email = ?").get(em);
      if (t && t.id !== u.id) {
        db.prepare("INSERT OR IGNORE INTO share_users(token,user_id) VALUES(?,?)").run(token, t.id);
        const n = findNode({ root: loadState(u.id).state.root, trash: [] }, nodeId);
        addNotification(t.id, { kind: "share", title: `${u.name} compartió “${n?.name}” contigo`, body: p === "edit" ? "Puedes editarlo" : "Puedes verlo y descargarlo", link: { share: token, node: n && { id: n.id, name: n.name, type: n.type } }, actor: u.id });
      } else if (!t) missing.push(em);
    }
    return json(res, 201, { token, perm: p, expires: exp, missing });
  }
  if (a === "with-me" && req.method === "GET") {
    const rows = db.prepare("SELECT s.*, o.name AS owner FROM share_users su JOIN shares s ON s.token = su.token JOIN users o ON o.id = s.user_id WHERE su.user_id = ? AND (s.expires IS NULL OR s.expires > ?) ORDER BY s.created DESC").all(u.id, now());
    return json(res, 200, { items: rows.map(r => { const n = findNode({ root: loadState(r.user_id).state.root, trash: [] }, r.node_id); return n && { token: r.token, perm: r.perm, owner: r.owner, created: r.created, node: { id: n.id, name: n.name, type: n.type, size: n.size, mtime: n.mtime } }; }).filter(Boolean) });
  }
  if (a && req.method === "DELETE") {
    const r = db.prepare("DELETE FROM shares WHERE token = ? AND user_id = ?").run(a, u.id);
    if (!r.changes) fail(404, "No encontrado");
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}

/* -------- público: /api/s/:token[/blob/:id] -------- */
export async function handlePublicShare(req, res, parts) {
  const [token, kind, id] = parts;
  if (!/^[a-f0-9]{32}$/.test(token || "")) fail(404, "Enlace no válido");
  if (kind === "unlock" && req.method === "POST") { // contraseña del enlace → llave de 12 horas
    const { s } = shareRow(token); rateLimit("share-pw:" + clientIp(req) + token, 10, 900_000);
    const { password } = await readJson(req, 4096);
    if (!s.pass_hash || !(await checkPassword(String(password || ""), s.pass_hash))) fail(403, "Contraseña incorrecta");
    return json(res, 200, { key: keyFor(token) });
  }
  const { s, node } = resolveShare(token, req);
  const me = currentUser(req), owner = me && me.id === s.user_id;
  const left = s.max_downloads ? Math.max(0, s.max_downloads - s.downloads) : null;
  if (!kind && req.method === "GET") {
    if (!owner) db.prepare("UPDATE shares SET views = views + 1 WHERE token = ?").run(token);
    if (s.perm === "upload") return json(res, 200, { owner: s.owner, perm: "upload", expires: s.expires, node: { id: node.id, name: node.name, type: "folder" }, maxFile: MAX_FILE });
    const strip = (n) => n.children ? { id: n.id, name: n.name, type: n.type, mtime: n.mtime, children: n.children.map(strip) } : { id: n.id, name: n.name, type: n.type, size: n.size, mtime: n.mtime, online: !!n.url };
    return json(res, 200, { owner: s.owner, perm: s.perm, expires: s.expires, limited: !!s.max_downloads, left, node: strip(node) });
  }
  if (kind === "blob" && id && req.method === "GET") {
    if (s.perm === "upload") fail(403, "Esta carpeta solo recibe archivos");
    const inner = index(node).get(id)?.node; // solo archivos dentro de lo compartido
    if (!inner || inner.children) fail(404, "No encontrado");
    notLocked(s, inner.id, req); // una subcarpeta con contraseña dentro de lo compartido
    const dl =new URL(req.url, "http://x").searchParams.has("dl");
    if (s.max_downloads && !owner) { // con límite: nada de vistas previas, y cada descarga cuenta
      if (!dl) fail(403, "Este enlace solo permite descargar");
      const r = db.prepare("UPDATE shares SET downloads = downloads + 1 WHERE token = ? AND downloads < max_downloads").run(token);
      if (!r.changes) fail(410, "Se alcanzó el límite de descargas de este enlace");
    } else if (dl && !owner) db.prepare("UPDATE shares SET downloads = downloads + 1 WHERE token = ?").run(token);
    return sendBlob(res, s.user_id, inner, { download: dl });
  }
  if (kind === "upload" && req.method === "POST") { // pedir archivos: suben sin ver el contenido
    if (s.perm !== "upload") fail(403, "Este enlace no permite subir archivos");
    rateLimit("share-up:" + clientIp(req), 200, 3600_000);
    const url = new URL(req.url, "http://x");
    let name = String(url.searchParams.get("name") || "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 180);
    const who = String(url.searchParams.get("by") || "").replace(/[\x00-\x1f<>]/g, "").trim().slice(0, 60);
    if (!name || name === "." || name === "..") fail(400, "Nombre no válido");
    const len = Number(req.headers["content-length"] || 0); const { quota, used } = quotaOf(s.user_id);
    if (len > MAX_FILE) fail(413, "El archivo es demasiado grande");
    if (quota && used + len > quota) fail(507, "La carpeta no tiene espacio para más archivos");
    const folder = findNode({ root: loadState(s.user_id).state.root, trash: [] }, s.node_id); if (!folder?.children) fail(404, "La carpeta ya no existe");
    const taken = new Set(folder.children.map(c => c.name.toLowerCase())); const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    const nid = newId(), dest = blobPath(s.user_id, nid), tmp = dest + ".part"; let n = 0;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try { await pipeline(req, async function* (src) { for await (const ch of src) { n += ch.length; if (n > MAX_FILE || (quota && used + n > quota)) throw Object.assign(new Error("Sin espacio"), { status: 507 }); yield ch; } }, fs.createWriteStream(tmp)); }
    catch (e) { fs.rmSync(tmp, { force: true }); fail(e.status || 500, e.status === 507 ? "La carpeta no tiene espacio para más archivos" : "La subida se interrumpió"); }
    fs.renameSync(tmp, dest); const t = Date.now();
    applyOps(s.user_id, [{ t: "create", parent: folder.id, node: { id: nid, name, type: typeOf(name), size: n, ctime: t, mtime: t } }], "share-upload");
    db.prepare("UPDATE shares SET uploads = uploads + 1 WHERE token = ?").run(token);
    addNotification(s.user_id, { kind: "share", title: `${who || "Alguien"} subió “${name}” a ${folder.name}`, body: "Por tu enlace para pedir archivos", link: { app: "files", folder: folder.id } });
    return json(res, 201, { ok: true, name });
  }
  fail(404, "No encontrado");
}
