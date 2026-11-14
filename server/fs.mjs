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

const SAFE_ID = /^[a-z0-9]{6,40}$/i;
const MAX_FILE = Number(process.env.SOTOS_MAX_FILE_MB || 512) * 1024 * 1024;

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

export const blobPath = (userId, id) => {
  if (!SAFE_ID.test(id) || !SAFE_ID.test(userId)) fail(400, "Identificador no válido");
  return path.join(BLOB_DIR, userId, id);
};

/* ---------------- eventos en vivo (SSE) por usuario ---------------- */
const listeners = new Map(); // userId -> Set(res)
export function notify(userId, event, data) {
  for (const res of listeners.get(userId) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function events(req, res, user) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
  res.write(`event: hello\ndata: ${JSON.stringify({ version: loadState(user.id).version })}\n\n`);
  if (!listeners.has(user.id)) listeners.set(user.id, new Set());
  listeners.get(user.id).add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => { clearInterval(ping); listeners.get(user.id)?.delete(res); });
}

/* ---------------- aplicar operaciones (también lo usa ONLYOFFICE) ---------------- */
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
  return version;
}

export async function handleFs(req, res, parts) {
  const user = requireUser(req);
  const [kind, id] = parts;

  if (kind === "events") return events(req, res, user);

  if (kind === "state" && req.method === "GET") {
    const { version, state, fresh } = loadState(user.id);
    const used = db.prepare("SELECT used FROM fs_state WHERE user_id = ?").get(user.id)?.used || 0;
    return json(res, 200, { version, state, fresh, used, quota: user.quota });
  }
  if (kind === "ops" && req.method === "POST") {
    const { ops, origin } = await readJson(req, 8 * 1024 * 1024);
    if (!Array.isArray(ops) || ops.length > 500) fail(400, "Operaciones no válidas");
    let version;
    try { version = applyOps(user.id, ops, String(origin || "").slice(0, 40)); }
    catch (e) { fail(400, e.message); }
    return json(res, 200, { version });
  }
  if (kind === "blob" && id) {
    const p = blobPath(user.id, id);
    if (req.method === "GET") {
      if (!fs.existsSync(p)) fail(404, "Contenido no encontrado");
      const st = fs.statSync(p);
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": st.size, "cache-control": "private, max-age=31536000, immutable" });
      return pipeline(fs.createReadStream(p), res);
    }
    if (req.method === "PUT") {
      const len = Number(req.headers["content-length"] || 0);
      if (len > MAX_FILE) fail(413, `El archivo supera el máximo de ${MAX_FILE / 1048576} MB`);
      const used = db.prepare("SELECT used FROM fs_state WHERE user_id = ?").get(user.id)?.used || 0;
      if (used + len > user.quota) fail(507, "No queda espacio en tu cuenta");
      fs.mkdirSync(path.dirname(p), { recursive: true });
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
