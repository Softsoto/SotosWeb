/* ============================================================
   Sotos OS — archivos en la nube: estado por usuario, operaciones, blobs, eventos
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { db, BLOB_DIR } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { applyOp, folderSize, findNode, ROOT, DESKTOP } from "../web/src/os/tree-ops.js";
import { guardLocked, handleLocks } from "./candados.mjs";

const SAFE_ID = /^[a-z0-9]{6,40}$/i;
const MAX_FILE = Number(process.env.SOTOS_MAX_FILE_MB || 512) * 1024 * 1024;
const MEDIA_TYPES = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime", ogv: "video/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif" };

const emptyState = () => ({ root: { id: ROOT, name: "Sotos Drive", type: "folder", children: [{ id: DESKTOP, name: "Escritorio", type: "folder", children: [], ctime: Date.now(), mtime: Date.now() }], ctime: Date.now(), mtime: Date.now() }, trash: [] });
export function loadState(userId) {
  const row = db.prepare("SELECT version, json FROM fs_state WHERE user_id = ?").get(userId);
  if (!row) return { version: 0, state: emptyState(), fresh: true };
  return { version: row.version, state: JSON.parse(row.json), fresh: false };
}
function saveState(userId, version, state) {
  const used = folderSize(state.root) + state.trash.reduce((s, t) => s + folderSize(t.node), 0);
  db.prepare("INSERT INTO fs_state(user_id,version,json,used) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version, json=excluded.json, used=excluded.used")
    .run(userId, version, JSON.stringify(state), used);
}

/* ---------------- versiones (como getVersions de inevio) ----------------
   Antes de sobrescribir un contenido se guarda el anterior en versions/<usuario>/<id>/<marca>.
   Cambios seguidos (menos de 5 min) se agrupan en una sola versión; se guardan hasta 30. */
const VERSION_DIR = path.join(BLOB_DIR, "_versions");
const MAX_VERSIONS = 30, GROUP_MS = 5 * 60_000;
const vdir = (userId, id) => { blobPath(userId, id); return path.join(VERSION_DIR, userId, id); };
export function snapshotVersion(userId, id) {
  const cur = blobPath(userId, id); if (!fs.existsSync(cur)) return;
  const dir = vdir(userId, id); fs.mkdirSync(dir, { recursive: true });
  const list = fs.readdirSync(dir).filter(f => /^\d+$/.test(f)).sort();
  const last = list[list.length - 1];
  if (last && Date.now() - Number(last) < GROUP_MS) return; // ya hay una versión reciente de esta tanda de cambios
  fs.copyFileSync(cur, path.join(dir, String(Date.now())));
  for (const old of list.slice(0, Math.max(0, list.length + 1 - MAX_VERSIONS))) fs.rmSync(path.join(dir, old), { force: true });
}
export function listVersions(userId, id) {
  const dir = vdir(userId, id); if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^\d+$/.test(f)).sort().reverse().map(f => ({ at: Number(f), size: fs.statSync(path.join(dir, f)).size }));
}

export const blobPath = (userId, id) => {
  if (!SAFE_ID.test(id) || !SAFE_ID.test(userId)) fail(400, "Identificador no válido");
  return path.join(BLOB_DIR, userId, id);
};

/* ---------------- eventos en vivo (SSE) por usuario ---------------- */
const listeners = new Map(); // userId -> Set(res)
/* presencia: conectado = al menos una pestaña con eventos abiertos */
export const isOnline = (userId) => (listeners.get(userId)?.size || 0) > 0;
let presenceHook = null;
export const onPresence = (fn) => { presenceHook = fn; };
export function notify(userId, event, data) {
  for (const res of listeners.get(userId) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function events(req, res, user) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
  res.write(`event: hello\ndata: ${JSON.stringify({ version: loadState(user.id).version })}\n\n`);
  if (!listeners.has(user.id)) listeners.set(user.id, new Set());
  const was = isOnline(user.id);
  listeners.get(user.id).add(res);
  if (!was) presenceHook?.(user.id, true);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => { clearInterval(ping); listeners.get(user.id)?.delete(res); if (!isOnline(user.id)) presenceHook?.(user.id, false); });
}

/* ---------------- aplicar operaciones (también lo usa ONLYOFFICE) ---------------- */
const fsChange = new Set(); // otros módulos que reaccionan a cambios (biblioteca multimedia)
export const onFsChange = (fn) => fsChange.add(fn);
export function applyOps(userId, ops, origin) {
  let { version, state } = loadState(userId);
  for (const op of ops) {
    const r = applyOp(state, op);
    state = { root: r.root, trash: r.trash };
    for (const { from, to } of r.effects.copyBlobs) { try { const s = blobPath(userId, from); if (fs.existsSync(s)) fs.copyFileSync(s, blobPath(userId, to)); } catch {} }
    for (const id of r.effects.deleteBlobs) { try { fs.rmSync(blobPath(userId, id), { force: true }); } catch {} }
  }
  version++;
  saveState(userId, version, state);
  notify(userId, "fs", { version, origin });
  for (const fn of fsChange) try { fn(userId, ops); } catch {}
  return version;
}

/** ninguna operación puede tocar lo que hay dentro de una carpeta con contraseña cerrada */
function guardOps(uid, ops, req) {
  for (const op of ops) {
    if (op.t === "replace") { if (db.prepare("SELECT 1 FROM folder_locks WHERE user_id = ? LIMIT 1").get(uid)) fail(423, "Tienes carpetas con contraseña: no se puede reemplazar todo el Drive"); continue; }
    const ids = [op.parent, op.id, op.dest, ...(op.ids || []), ...(op.blobs || []).map(b => b && b.from)].filter(x => typeof x === "string");
    for (const id of ids) guardLocked(uid, id, req);
  }
}

export async function handleFs(req, res, parts) {
  const user = requireUser(req);
  const [kind, id] = parts;

  if (kind === "events") return events(req, res, user);
  if (kind === "locks") return handleLocks(req, res, parts.slice(1), user);
  if ((kind === "blob" || kind === "versions") && id) guardLocked(user.id, id, req);

  if (kind === "state" && req.method === "GET") {
    const { version, state, fresh } = loadState(user.id);
    const used = db.prepare("SELECT used FROM fs_state WHERE user_id = ?").get(user.id)?.used || 0;
    return json(res, 200, { version, state, fresh, used, quota: user.quota });
  }
  if (kind === "ops" && req.method === "POST") {
    const { ops, origin } = await readJson(req, 8 * 1024 * 1024);
    if (!Array.isArray(ops) || ops.length > 500) fail(400, "Operaciones no válidas");
    guardOps(user.id, ops, req);
    let version;
    try { version = applyOps(user.id, ops, String(origin || "").slice(0, 40)); }
    catch (e) { fail(400, e.message); }
    return json(res, 200, { version });
  }
  if (kind === "versions" && id) {
    if (!userNode(user.id, id)) fail(404, "Archivo no encontrado");
    const at = parts[2], action = parts[3];
    if (!at && req.method === "GET") return json(res, 200, { items: listVersions(user.id, id) });
    if (!/^\d+$/.test(at || "")) fail(400, "Versión no válida");
    const vp = path.join(vdir(user.id, id), at); if (!fs.existsSync(vp)) fail(404, "Esa versión ya no existe");
    if (!action && req.method === "GET") { const st = fs.statSync(vp); res.writeHead(200, { "content-type": "application/octet-stream", "content-length": st.size, "cache-control": "private, no-store" }); return pipeline(fs.createReadStream(vp), res); }
    if (action === "restore" && req.method === "POST") {
      const cur = blobPath(user.id, id);
      // lo actual también queda como versión, por si te arrepientes
      if (fs.existsSync(cur)) { const dir = vdir(user.id, id); fs.copyFileSync(cur, path.join(dir, String(Date.now()))); }
      fs.copyFileSync(vp, cur);
      const size = fs.statSync(cur).size;
      const version = applyOps(user.id, [{ t: "write", id, size, mtime: Date.now() }], "versions");
      return json(res, 200, { ok: true, size, version });
    }
  }
  if (kind === "blob" && id) {
    const p = blobPath(user.id, id);
    if (req.method === "GET") {
      if (!fs.existsSync(p)) fail(404, "Contenido no encontrado");
      const st = fs.statSync(p); const name = userNode(user.id, id)?.name || "archivo";
      // tipo real solo para medios (para reproducir por partes); lo demás sigue como binario, así nada se interpreta como página
      const ext = (name.split(".").pop() || "").toLowerCase();
      const type = MEDIA_TYPES[ext] || "application/octet-stream";
      const url = new URL(req.url, "http://x");
      const base = { "content-type": type, "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "private, max-age=31536000, immutable",
        ...(url.searchParams.has("dl") ? { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } : {}) };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (m && (m[1] || m[2])) { // descarga por partes: el video empieza sin bajarse entero y se puede adelantar
        let start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        if (start >= st.size || start > end) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
        res.writeHead(206, { ...base, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
        return pipeline(fs.createReadStream(p, { start, end }), res).catch(() => {});
      }
      res.writeHead(200, { ...base, "content-length": st.size });
      return pipeline(fs.createReadStream(p), res).catch(() => {});
    }
    if (req.method === "PUT") {
      const len = Number(req.headers["content-length"] || 0);
      if (len > MAX_FILE) fail(413, `El archivo supera el máximo de ${MAX_FILE / 1048576} MB`);
      const used = db.prepare("SELECT used FROM fs_state WHERE user_id = ?").get(user.id)?.used || 0;
      if (used + len > user.quota) fail(507, "No queda espacio en tu cuenta");
      fs.mkdirSync(path.dirname(p), { recursive: true });
      try { snapshotVersion(user.id, id); } catch {} // el contenido anterior pasa al historial
      const tmp = p + ".part-" + process.pid;
      let n = 0;
      try {
        await pipeline(req, async function* (src) { for await (const c of src) { n += c.length; if (n > MAX_FILE) throw Object.assign(new Error("too big"), { status: 413 }); yield c; } }, fs.createWriteStream(tmp));
        fs.renameSync(tmp, p);
      } catch (e) { fs.rmSync(tmp, { force: true }); if (e.status === 413) fail(413, "Archivo demasiado grande"); throw e; }
      return json(res, 200, { ok: true, size: n });
    }
  }
  fail(404, "No encontrado");
}

/** nodo de un usuario (para compartir / ONLYOFFICE) */
export const userNode = (userId, nodeId) => findNode(loadState(userId).state, nodeId);
