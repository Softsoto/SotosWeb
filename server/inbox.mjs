/* ============================================================
   Sotos — bandeja de entrada: "Enviar a…" otra cuenta
   El archivo viaja como copia; quien lo recibe lo acepta (se guarda en
   su carpeta Recibidos) o lo rechaza. Los bloqueos se respetan.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { db, BLOB_DIR, now, rid } from "./db.mjs";
import { fail, json, readJson, rateLimit } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { blobPath, userNode, loadState, applyOps, notify } from "./fs.mjs";
import { addNotification, isBlocked } from "./social.mjs";
import { ROOT } from "../web/src/os/tree-ops.js";

const INBOX_DIR = path.join(BLOB_DIR, "_inbox");
fs.mkdirSync(INBOX_DIR, { recursive: true });
const holdPath = (id) => { if (!/^[a-f0-9]{20}$/.test(id)) fail(400, "Identificador no válido"); return path.join(INBOX_DIR, id); };
const pendingCount = (uid) => db.prepare("SELECT COUNT(*) n FROM inbox WHERE to_user = ? AND status = 'pending'").get(uid).n;
const pub = (r) => ({ id: r.id, name: r.name, type: r.type, size: r.size, message: r.message, status: r.status, created: r.created, decided: r.decided,
  from: r.from_name ? { id: r.from_user, name: r.from_name, email: r.from_email } : undefined, to: r.to_name ? { id: r.to_user, name: r.to_name, email: r.to_email } : undefined });

function uniqueIn(folder, name) {
  const names = new Set((folder?.children || []).map(c => c.name.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf("."), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) { const n = `${base} (${i})${ext}`; if (!names.has(n.toLowerCase())) return n; }
}

export async function handleInbox(req, res, parts) {
  const u = requireUser(req);
  const [a, b] = parts;

  if (!a && req.method === "GET") {
    const received = db.prepare(`SELECT i.*, f.name from_name, f.email from_email FROM inbox i JOIN users f ON f.id = i.from_user
      WHERE i.to_user = ? ORDER BY (i.status = 'pending') DESC, i.created DESC LIMIT 80`).all(u.id).map(pub);
    const sent = db.prepare(`SELECT i.*, t.name to_name, t.email to_email FROM inbox i JOIN users t ON t.id = i.to_user
      WHERE i.from_user = ? ORDER BY i.created DESC LIMIT 40`).all(u.id).map(pub);
    return json(res, 200, { received, sent, pending: pendingCount(u.id) });
  }

  if (a === "send" && req.method === "POST") {
    rateLimit("send:" + u.id, 60, 3600_000);
    const { nodeId, to, message } = await readJson(req, 16384);
    const node = userNode(u.id, String(nodeId || ""));
    if (!node) fail(404, "El archivo no existe");
    if (node.type === "folder" || node.children) fail(400, "Por ahora se pueden enviar archivos, no carpetas. Comprímela en .zip y envíala.");
    const list = (Array.isArray(to) ? to : [to]).map(x => String(x || "").trim().toLowerCase()).filter(Boolean).slice(0, 20);
    if (!list.length) fail(400, "Elige a quién enviarlo");
    const src = (() => { try { const p = blobPath(u.id, node.id); return fs.existsSync(p) ? p : null; } catch { return null; } })();
    if (!src && !node.url) fail(409, "El archivo aún se está subiendo; inténtalo en un momento");
    const sentTo = [], skipped = [];
    for (const who of list) {
      const t = db.prepare("SELECT id, name, email FROM users WHERE id = ? OR email = ?").get(who, who);
      if (!t) { skipped.push({ who, reason: "no tiene cuenta en Sotos" }); continue; }
      if (t.id === u.id) { skipped.push({ who, reason: "eres tú" }); continue; }
      if (isBlocked(t.id, u.id) || isBlocked(u.id, t.id)) { skipped.push({ who: t.name, reason: "no es posible enviarle archivos" }); continue; }
      const id = rid(10);
      if (src) fs.copyFileSync(src, holdPath(id));
      db.prepare("INSERT INTO inbox(id,from_user,to_user,name,type,size,url,message,status,created) VALUES(?,?,?,?,?,?,?,?,'pending',?)")
        .run(id, u.id, t.id, node.name, node.type || "file", node.size || 0, src ? null : node.url, String(message || "").slice(0, 500) || null, now());
      addNotification(t.id, { kind: "inbox", title: `${u.name} te envió “${node.name}”`, body: message ? String(message).slice(0, 300) : "Acéptalo para guardarlo en tus archivos", link: { inbox: id }, actor: u.name });
      notify(t.id, "inbox", { pending: pendingCount(t.id) });
      sentTo.push(t.name);
    }
    return json(res, 200, { sent: sentTo, skipped });
  }

  const row = a && db.prepare("SELECT * FROM inbox WHERE id = ?").get(a);
  if (!row) fail(404, "No encontrado");

  if (b === "accept" && req.method === "POST") {
    if (row.to_user !== u.id || row.status !== "pending") fail(409, "Este envío ya no está pendiente");
    const used = db.prepare("SELECT used FROM fs_state WHERE user_id = ?").get(u.id)?.used || 0;
    if (used + (row.size || 0) > u.quota) fail(507, "No queda espacio en tu cuenta");
    const { state } = loadState(u.id);
    let folder = (state.root.children || []).find(c => c.type === "folder" && c.name === "Recibidos");
    const ops = [], t = now();
    if (!folder) { folder = { id: rid(8), name: "Recibidos", type: "folder", children: [], ctime: t, mtime: t }; ops.push({ t: "create", parent: ROOT, node: folder }); }
    const fid = rid(8), name = uniqueIn(folder, row.name);
    const hold = holdPath(row.id);
    if (fs.existsSync(hold)) { const dst = blobPath(u.id, fid); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(hold, dst); }
    const node = { id: fid, name, type: row.type || "file", size: row.size || 0, ctime: t, mtime: t, ...(row.url ? { url: row.url, online: true } : {}) };
    ops.push({ t: "create", parent: folder.id, node });
    applyOps(u.id, ops, "inbox");
    fs.rmSync(hold, { force: true });
    db.prepare("UPDATE inbox SET status = 'accepted', decided = ? WHERE id = ?").run(t, row.id);
    addNotification(row.from_user, { kind: "inbox-accepted", title: `${u.name} aceptó “${row.name}”`, link: null, actor: u.name });
    notify(u.id, "inbox", { pending: pendingCount(u.id) });
    return json(res, 200, { nodeId: fid, folderId: folder.id, name });
  }
  if (b === "refuse" && req.method === "POST") {
    if (row.to_user !== u.id || row.status !== "pending") fail(409, "Este envío ya no está pendiente");
    fs.rmSync(holdPath(row.id), { force: true });
    db.prepare("UPDATE inbox SET status = 'refused', decided = ? WHERE id = ?").run(now(), row.id);
    addNotification(row.from_user, { kind: "inbox-refused", title: `${u.name} rechazó “${row.name}”`, link: null, actor: u.name });
    notify(u.id, "inbox", { pending: pendingCount(u.id) });
    return json(res, 200, { ok: true });
  }
  if (!b && req.method === "DELETE") { // quien envía puede retirar un envío pendiente
    if (row.from_user !== u.id || row.status !== "pending") fail(409, "Ya no se puede retirar");
    fs.rmSync(holdPath(row.id), { force: true });
    db.prepare("UPDATE inbox SET status = 'withdrawn', decided = ? WHERE id = ?").run(now(), row.id);
    notify(row.to_user, "inbox", { pending: pendingCount(row.to_user) });
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}
