/* ============================================================
   Sotos OS — compartir: enlaces públicos y "compartido conmigo"
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { db, now, rid } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser, currentUser } from "./auth.mjs";
import { loadState, blobPath } from "./fs.mjs";
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
/** acceso a un recurso compartido: público por enlace, o restringido a destinatarios */
function canSee(s, req) {
  const restricted = db.prepare("SELECT COUNT(*) n FROM share_users WHERE token = ?").get(s.token).n > 0;
  if (!restricted) return true;
  const u = currentUser(req); if (!u) fail(401, "Inicia sesión para ver este elemento");
  if (u.id === s.user_id) return true;
  if (!db.prepare("SELECT 1 FROM share_users WHERE token = ? AND user_id = ?").get(s.token, u.id)) fail(403, "No tienes acceso a este elemento");
  return true;
}
export function resolveShare(token, req) { const r = shareRow(token); canSee(r.s, req); return r; }

export async function handleShares(req, res, parts) {
  const u = requireUser(req);
  const [a] = parts;
  if (!a && req.method === "GET") {
    const st = loadState(u.id).state; const map = index(st.root);
    const rows = db.prepare("SELECT * FROM shares WHERE user_id = ? ORDER BY created DESC").all(u.id);
    return json(res, 200, { shares: rows.map(r => ({ token: r.token, nodeId: r.node_id, perm: r.perm, created: r.created, expires: r.expires, name: map.get(r.node_id)?.node.name || "(eliminado)",
      people: db.prepare("SELECT u.email, u.name FROM share_users su JOIN users u ON u.id = su.user_id WHERE su.token = ?").all(r.token) })) });
  }
  if (!a && req.method === "POST") {
    const { nodeId, perm, days, emails } = await readJson(req, 16384);
    if (nodeId === ROOT) fail(400, "No se puede compartir todo el Drive");
    if (!findNode({ root: loadState(u.id).state.root, trash: [] }, nodeId)) fail(404, "No existe");
    const p = perm === "edit" ? "edit" : "view";
    const exp = Number(days) > 0 ? now() + Math.min(365, Number(days)) * 86400_000 : null;
    const token = rid(16);
    db.prepare("INSERT INTO shares(token,user_id,node_id,perm,created,expires) VALUES(?,?,?,?,?,?)").run(token, u.id, nodeId, p, now(), exp);
    const missing = [];
    for (const e of (Array.isArray(emails) ? emails : []).slice(0, 50)) {
      const em = String(e).trim().toLowerCase(); if (!em) continue;
      const t = db.prepare("SELECT id FROM users WHERE email = ?").get(em);
      if (t && t.id !== u.id) db.prepare("INSERT OR IGNORE INTO share_users(token,user_id) VALUES(?,?)").run(token, t.id); else if (!t) missing.push(em);
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
  const { s, node } = resolveShare(token, req);
  if (!kind && req.method === "GET") {
    const strip = (n) => n.children ? { id: n.id, name: n.name, type: n.type, mtime: n.mtime, children: n.children.map(strip) } : { id: n.id, name: n.name, type: n.type, size: n.size, mtime: n.mtime, online: !!n.url };
    return json(res, 200, { owner: s.owner, perm: s.perm, expires: s.expires, node: strip(node) });
  }
  if (kind === "blob" && id && req.method === "GET") {
    const inner = index(node).get(id)?.node; // solo archivos dentro de lo compartido
    if (!inner || inner.children) fail(404, "No encontrado");
    return sendBlob(res, s.user_id, inner, { download: new URL(req.url, "http://x").searchParams.has("dl") });
  }
  fail(404, "No encontrado");
}
