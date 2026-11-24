/* ============================================================
   Sotos — carpetas con contraseña (Archivos)
   El servidor guarda la contraseña de cada carpeta (scrypt, nunca en claro) y se niega a
   entregar o cambiar el contenido de lo que hay dentro hasta que se escribe: no basta con
   esconderla en pantalla, tampoco se puede leer por la API, un enlace compartido, WebDAV,
   Office, la bandeja de entrada o el NAS.
   Al escribirla, ese navegador la tiene abierta 15 minutos sin uso (cookie de sesión, solo
   para la API) y después vuelve a cerrarse sola. Una carpeta dentro de otra con contraseña
   necesita las dos.
   No es cifrado: quien administra el disco del servidor puede ver los archivos. Para eso
   está la Bóveda.
     GET    /api/fs/locks                      [{ nodeId, unlocked }]
     POST   /api/fs/locks        { nodeId, password }      poner contraseña
     POST   /api/fs/locks/:id/unlock { password }          abrir (15 min)
     POST   /api/fs/locks/:id/lock                         volver a cerrar ya
     PUT    /api/fs/locks/:id    { password, next }        cambiar la contraseña
     DELETE /api/fs/locks/:id    { password }              quitar la contraseña
   © 2026 Sebastian Sotomontes
   ============================================================ */
import crypto from "node:crypto";
import { db, now } from "./db.mjs";
import { fail, json, readJson, rateLimit, cookies } from "./http.mjs";
import { hashPassword, checkPassword } from "./auth.mjs";
import { loadState } from "./fs.mjs";
import { index, ROOT, DESKTOP } from "../web/src/os/tree-ops.js";

db.exec(`CREATE TABLE IF NOT EXISTS folder_locks (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, node_id TEXT NOT NULL, pass_hash TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, node_id));`);

const COOKIE = "sotos_ul", IDLE = 15 * 60_000;
const sessions = new Map(); // token → { uid, nodes: Set, last }
setInterval(() => { const t = Date.now(); for (const [k, s] of sessions) if (t - s.last > IDLE) sessions.delete(k); }, 60_000).unref();

const lockRows = (uid) => db.prepare("SELECT node_id FROM folder_locks WHERE user_id = ?").all(uid).map(r => r.node_id);
function sessionOf(req, uid) {
  const t = cookies(req)[COOKIE]; const s = t && sessions.get(t);
  if (!s || s.uid !== uid || Date.now() - s.last > IDLE) return null;
  s.last = Date.now(); return s;
}
const isHttps = (req) => !!req.socket.encrypted || (process.env.TRUST_PROXY && req.headers["x-forwarded-proto"] === "https");

/** la carpeta con contraseña (aún cerrada) que contiene a nodeId, o null si se puede usar */
export function lockedFolder(uid, nodeId, req) {
  const locks = lockRows(uid); if (!locks.length) return null;
  const set = new Set(locks), open = sessionOf(req, uid)?.nodes || new Set();
  const map = index(loadState(uid).state.root);
  for (let cur = map.get(nodeId); cur; cur = cur.parent ? map.get(cur.parent.id) : null)
    if (set.has(cur.node.id) && !open.has(cur.node.id)) return cur.node;
  return null;
}
/** corta la petición si nodeId está dentro de una carpeta con contraseña cerrada */
export function guardLocked(uid, nodeId, req) {
  const f = lockedFolder(uid, nodeId, req);
  if (f) fail(423, `La carpeta «${f.name}» tiene contraseña: ábrela primero`);
}

export async function handleLocks(req, res, parts, user) {
  const [id, action] = parts;
  if (!id && req.method === "GET") {
    const open = sessionOf(req, user.id)?.nodes || new Set();
    return json(res, 200, { items: lockRows(user.id).map(n => ({ nodeId: n, unlocked: open.has(n) })), idleMinutes: IDLE / 60_000 });
  }
  if (!id && req.method === "POST") {
    const { nodeId, password } = await readJson(req, 4096);
    const node = index(loadState(user.id).state.root).get(String(nodeId || ""))?.node;
    if (!node || !node.children) fail(400, "Solo se les pone contraseña a las carpetas");
    if (node.id === ROOT || node.id === DESKTOP) fail(400, "A esta carpeta no se le puede poner contraseña");
    if (String(password || "").length < 4) fail(400, "La contraseña debe tener al menos 4 caracteres");
    guardLocked(user.id, node.id, req); // dentro de otra con contraseña: primero hay que abrir esa
    db.prepare("INSERT OR REPLACE INTO folder_locks(user_id,node_id,pass_hash,created) VALUES(?,?,?,?)").run(user.id, node.id, await hashPassword(String(password)), now());
    return json(res, 201, { ok: true });
  }
  const row = id && db.prepare("SELECT * FROM folder_locks WHERE user_id = ? AND node_id = ?").get(user.id, String(id));
  if (!row) fail(404, "Esa carpeta no tiene contraseña");
  const verify = async (pw) => { rateLimit("lock:" + user.id + ":" + row.node_id, 10, 15 * 60_000); if (!(await checkPassword(String(pw || ""), row.pass_hash))) fail(403, "Contraseña incorrecta"); };

  if (action === "unlock" && req.method === "POST") {
    const { password } = await readJson(req, 4096); await verify(password);
    let token = cookies(req)[COOKIE], s = sessionOf(req, user.id);
    if (!s) { token = crypto.randomBytes(24).toString("base64url"); s = { uid: user.id, nodes: new Set(), last: Date.now() }; sessions.set(token, s); }
    s.nodes.add(row.node_id);
    res.setHeader("set-cookie", `${COOKIE}=${token}; Path=/api/; HttpOnly; SameSite=Strict${isHttps(req) ? "; Secure" : ""}`);
    return json(res, 200, { ok: true, minutes: IDLE / 60_000 });
  }
  if (action === "lock" && req.method === "POST") { sessionOf(req, user.id)?.nodes.delete(row.node_id); return json(res, 200, { ok: true }); }
  if (!action && req.method === "PUT") {
    const { password, next } = await readJson(req, 4096); await verify(password);
    if (String(next || "").length < 4) fail(400, "La contraseña nueva debe tener al menos 4 caracteres");
    db.prepare("UPDATE folder_locks SET pass_hash = ? WHERE user_id = ? AND node_id = ?").run(await hashPassword(String(next)), user.id, row.node_id);
    return json(res, 200, { ok: true });
  }
  if (!action && req.method === "DELETE") {
    const { password } = await readJson(req, 4096); await verify(password);
    db.prepare("DELETE FROM folder_locks WHERE user_id = ? AND node_id = ?").run(user.id, row.node_id);
    for (const s of sessions.values()) if (s.uid === user.id) s.nodes.delete(row.node_id);
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}
