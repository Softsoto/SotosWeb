/* ============================================================
   Sotos — panel de administración (solo cuentas con rol "admin")
   Usuarios, cuotas, roles, cuentas desactivadas, apps visibles por
   usuario, registro abierto/cerrado y estado del servidor.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { db, now, rid, BLOB_DIR, DATA_DIR, getSetting, setSetting } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser, hashPassword, registration, defaultQuota, verifyPassword, AVATARS } from "./auth.mjs";
import { loadState, applyOps, blobPath } from "./fs.mjs";
import { addNotification } from "./social.mjs";
import { VAULT_DIR, vaultForAdmin, vaultAdminFile } from "./vault.mjs";
import { backupStatus, runBackup } from "./backup.mjs";
import { totpDisable } from "./totp.mjs";
import { checkUpdate, applyUpdate, currentVersion, restart } from "./updates.mjs";

// registro de lo que hace cada administrador (transparencia: quién vio, borró o cambió qué)
db.exec(`CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT, user_id TEXT, action TEXT NOT NULL, detail TEXT, created INTEGER NOT NULL)`);
const audit = (me, userId, action, detail) => db.prepare("INSERT INTO admin_log(admin_id,user_id,action,detail,created) VALUES(?,?,?,?,?)").run(me.id, userId, action, detail || null, now());
const SAFE_INLINE = { mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf" };
function filesOf(userId) {
  const { state } = loadState(userId); const out = [];
  const walk = (n, p, trashed) => { if (n.children) n.children.forEach(c => walk(c, p + "/" + c.name, trashed)); else out.push({ id: n.id, name: n.name, path: p, size: n.size || 0, type: n.type, mtime: n.mtime || n.ctime || 0, trashed }); };
  (state.root?.children || []).forEach(c => walk(c, "/" + c.name, false));
  (state.trash || []).forEach(t => walk(t.node, "Papelera/" + t.node.name, true));
  return out;
}

const MB = 1024 * 1024;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
function requireAdmin(req) { const u = requireUser(req); if (u.role !== "admin") fail(403, "Solo para administradores"); return u; }
const admins = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND disabled = 0").get().n;
const userRow = (u) => ({ twoFactor: !!u.totp_on,
  id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar || null, disabled: !!u.disabled, quota: u.quota, created: u.created, lastSeen: u.last_seen || null,
  used: db.prepare("SELECT used FROM fs_state WHERE user_id = ?").get(u.id)?.used || 0,
  sessions: db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires > ?").get(u.id, now()).n,
  hiddenApps: (() => { try { return JSON.parse(u.hidden_apps || "[]"); } catch { return []; } })(),
});

export async function handleAdmin(req, res, parts) {
  const me = requireAdmin(req);
  const [a, id, sub] = parts;

  if (a === "stats" && req.method === "GET") {
    let disk = null; try { const s = fs.statfsSync(DATA_DIR); disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch {}
    const n = (sql, ...p) => db.prepare(sql).get(...p).n;
    return json(res, 200, {
      users: n("SELECT COUNT(*) n FROM users"), active: n("SELECT COUNT(DISTINCT user_id) n FROM sessions WHERE expires > ?", now()),
      seen24h: n("SELECT COUNT(*) n FROM users WHERE last_seen > ?", now() - 86400_000),
      storage: n("SELECT COALESCE(SUM(used),0) n FROM fs_state") + n("SELECT COALESCE(SUM(used),0) n FROM world_fs"),
      worlds: n("SELECT COUNT(*) n FROM worlds"), shares: n("SELECT COUNT(*) n FROM shares"), inboxPending: n("SELECT COUNT(*) n FROM inbox WHERE status = 'pending'"),
      disk, server: { node: process.version, platform: `${os.type()} ${os.release()}`, uptime: Math.round(process.uptime()), memory: process.memoryUsage().rss, cpus: os.cpus().length },
      settings: { registration: registration(), defaultQuotaMb: Math.round(defaultQuota() / MB) },
    });
  }

  if (a === "settings" && req.method === "PUT") {
    const b = await readJson(req, 4096);
    if (b.registration !== undefined) { if (!["open", "closed"].includes(b.registration)) fail(400, "Valor no válido"); setSetting("registration", b.registration); }
    if (b.defaultQuotaMb !== undefined) { const q = Math.round(Number(b.defaultQuotaMb)); if (!(q >= 10 && q <= 10_000_000)) fail(400, "Cuota no válida"); setSetting("defaultQuotaMb", q); }
    return json(res, 200, { registration: registration(), defaultQuotaMb: Math.round(defaultQuota() / MB) });
  }

  if (a === "update") { // actualizaciones de Sotos
    if (req.method === "GET") { try { return json(res, 200, await checkUpdate(new URL(req.url, "http://x").searchParams.has("force"))); } catch (e) { return json(res, 200, { current: currentVersion(), error: "No se pudo consultar GitHub: " + e.message }); } }
    if (req.method === "POST") {
      audit(me, null, "actualizar Sotos");
      res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
      const send = (o) => res.write(JSON.stringify(o) + "\n");
      try { const v = await applyUpdate((m) => send({ log: m })); send({ done: true, version: v }); res.end(); restart(); }
      catch (e) { send({ error: e.message }); res.end(); }
      return;
    }
  }
  if (a === "backups") { // copias de seguridad del servidor
    if (req.method === "GET") return json(res, 200, backupStatus());
    if (req.method === "POST") { audit(me, null, "copia de seguridad manual"); const r = await runBackup("manual"); return json(res, 200, { item: r, ...backupStatus() }); }
  }
  if (a === "log" && req.method === "GET") {
    const names = Object.fromEntries(db.prepare("SELECT id, name FROM users").all().map(r => [r.id, r.name]));
    return json(res, 200, { items: db.prepare("SELECT * FROM admin_log ORDER BY id DESC LIMIT 300").all().map(r => ({ ...r, admin: names[r.admin_id] || "—", user: names[r.user_id] || "(cuenta eliminada)" })) });
  }
  if (a === "users") {
    if (!id && req.method === "GET") return json(res, 200, { items: db.prepare("SELECT * FROM users").all().map(userRow)
      .sort((x, y) => (y.id === me.id) - (x.id === me.id) || (y.role === "admin") - (x.role === "admin") || (y.lastSeen || 0) - (x.lastSeen || 0) || y.created - x.created) });
    if (!id && req.method === "POST") { // alta directa por el administrador
      const b = await readJson(req, 8192);
      const email = String(b.email || "").trim().toLowerCase(), name = String(b.name || "").trim().slice(0, 60);
      if (!EMAIL.test(email)) fail(400, "Correo no válido"); if (!name) fail(400, "Escribe el nombre");
      if (String(b.password || "").length < 8) fail(400, "La contraseña debe tener al menos 8 caracteres");
      if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) fail(409, "Ya existe una cuenta con ese correo");
      const uid = rid(12), quota = b.quotaMb ? Math.round(Number(b.quotaMb)) * MB : defaultQuota();
      db.prepare("INSERT INTO users(id,email,name,pass,quota,created,role,avatar) VALUES(?,?,?,?,?,?,?,?)").run(uid, email, name, await hashPassword(String(b.password)), quota, now(), b.role === "admin" ? "admin" : "user", "def:" + AVATARS[Math.floor(Math.random() * AVATARS.length)]);
      return json(res, 201, { item: userRow(db.prepare("SELECT * FROM users WHERE id = ?").get(uid)) });
    }
    const u = id && db.prepare("SELECT * FROM users WHERE id = ?").get(id); if (!u) fail(404, "Usuario no encontrado");
    if (!sub && req.method === "PUT") {
      const b = await readJson(req, 16384);
      const self = u.id === me.id, isAdmin = u.role === "admin" && !u.disabled;
      if (b.role !== undefined) {
        if (!["admin", "user"].includes(b.role)) fail(400, "Rol no válido");
        if (self && b.role !== "admin" && !(await verifyPassword(me.id, b.password))) fail(403, "Escribe tu contraseña para confirmar que dejas de ser administrador");
        if (isAdmin && b.role !== "admin" && admins() <= 1) fail(409, "Debe quedar al menos un administrador");
        db.prepare("UPDATE users SET role = ? WHERE id = ?").run(b.role, u.id); if (b.role !== u.role) audit(me, u.id, "rol", b.role);
      }
      if (b.disabled !== undefined) {
        if (self && b.disabled) fail(409, "No puedes desactivar tu propia cuenta");
        if (isAdmin && b.disabled && admins() <= 1) fail(409, "Debe quedar al menos un administrador");
        db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(b.disabled ? 1 : 0, u.id);
        if (b.disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
      }
      if (b.quotaMb !== undefined) { const q = Math.round(Number(b.quotaMb)); if (!(q >= 10 && q <= 10_000_000)) fail(400, "Cuota no válida"); db.prepare("UPDATE users SET quota = ? WHERE id = ?").run(q * MB, u.id); audit(me, u.id, "cuota", q + " MB"); }
      if (Array.isArray(b.hiddenApps)) db.prepare("UPDATE users SET hidden_apps = ? WHERE id = ?").run(JSON.stringify(b.hiddenApps.filter(x => /^[a-z0-9-]{2,30}$/.test(x)).slice(0, 60)), u.id);
      if (b.name !== undefined) { const nm = String(b.name).trim().slice(0, 60); if (!nm) fail(400, "Escribe el nombre"); db.prepare("UPDATE users SET name = ? WHERE id = ?").run(nm, u.id); }
      return json(res, 200, { item: userRow(db.prepare("SELECT * FROM users WHERE id = ?").get(u.id)) });
    }
    if (sub === "2fa" && req.method === "DELETE") { // perdió el celular y los códigos de recuperación
      totpDisable(u.id); audit(me, u.id, "quitar verificación en dos pasos"); return json(res, 200, { ok: true });
    }
    if (sub === "password" && req.method === "POST") {
      const { password } = await readJson(req, 4096);
      if (String(password || "").length < 8) fail(400, "La contraseña debe tener al menos 8 caracteres");
      db.prepare("UPDATE users SET pass = ? WHERE id = ?").run(await hashPassword(String(password)), u.id);
      if (u.id !== me.id) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
      return json(res, 200, { ok: true });
    }
    if (sub === "vault" && parts[3] && req.method === "GET") { // solo si al instalar se permitió que el administrador vea las bóvedas
      audit(me, u.id, "abrir archivo de su bóveda"); return vaultAdminFile(res, u.id, parts[3], new URL(req.url, "http://x").searchParams.has("dl"));
    }
    if (sub === "files") {
      const nodeId = parts[3];
      if (!nodeId && req.method === "GET") { audit(me, u.id, "ver archivos"); return json(res, 200, { items: filesOf(u.id).sort((x, y) => y.size - x.size), vault: vaultForAdmin(u.id) }); }
      const f = filesOf(u.id).find(x => x.id === nodeId); if (!f) fail(404, "Archivo no encontrado");
      if (req.method === "GET") {
        const p = blobPath(u.id, f.id); if (!fs.existsSync(p)) fail(404, "Contenido no encontrado");
        const ext = (f.name.split(".").pop() || "").toLowerCase(), inline = SAFE_INLINE[ext];
        audit(me, u.id, "abrir archivo", f.path);
        res.writeHead(200, { "content-type": inline || "application/octet-stream", "content-length": fs.statSync(p).size, "x-content-type-options": "nosniff", "cache-control": "no-store",
          "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'", "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}` });
        return fs.createReadStream(p).pipe(res);
      }
      if (req.method === "DELETE") {
        const { reason } = await readJson(req, 4096); const why = String(reason || "").trim().slice(0, 300);
        if (!why) fail(400, "Escribe el motivo (se le enviará a la persona)");
        if (!f.trashed) applyOps(u.id, [{ t: "trash", ids: [f.id], at: now() }], "admin");
        applyOps(u.id, [{ t: "destroy", ids: [f.id] }], "admin");
        audit(me, u.id, "eliminar archivo", `${f.path} · ${why}`);
        try { addNotification(u.id, { kind: "admin", title: `Un administrador eliminó «${f.name}»`, body: why }); } catch {}
        return json(res, 200, { ok: true });
      }
    }
    if (sub === "logout" && req.method === "POST") { db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id); return json(res, 200, { ok: true }); }
    if (!sub && req.method === "DELETE") {
      if (u.id === me.id) fail(409, "No puedes eliminar tu propia cuenta desde aquí");
      if (u.role === "admin" && admins() <= 1) fail(409, "Debe quedar al menos un administrador");
      db.prepare("DELETE FROM users WHERE id = ?").run(u.id); // las tablas relacionadas se borran en cascada
      try { fs.rmSync(path.join(BLOB_DIR, u.id), { recursive: true, force: true }); fs.rmSync(path.join(VAULT_DIR, u.id), { recursive: true, force: true }); } catch {}
      return json(res, 200, { ok: true });
    }
  }
  fail(404, "No encontrado");
}
