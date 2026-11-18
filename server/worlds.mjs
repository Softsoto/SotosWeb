/* ============================================================
   Sotos — Mundos: espacios compartidos con muro, carpeta y chat
   © 2026 Sebastian Sotomontes

   Cada mundo tiene miembros (owner | member), un muro con
   publicaciones y comentarios, un chat y su propia carpeta, que usa
   el mismo motor de operaciones que los archivos personales
   (tree-ops.js) con contenidos en blobs/w<id>/.
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { db, now, rid, BLOB_DIR } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { notify, blobPath } from "./fs.mjs";
import { addNotification, isBlocked } from "./social.mjs";
import { applyOp, folderSize, ROOT } from "../web/src/os/tree-ops.js";

const MAX_FILE = Number(process.env.SOTOS_MAX_FILE_MB || 512) * 1024 * 1024;
const WORLD_QUOTA = Number(process.env.SOTOS_WORLD_QUOTA_MB || 2048) * 1024 * 1024;
const ICONS = new Set(["diversity_3", "groups", "family_restroom", "school", "work", "sports_soccer", "music_note", "travel_explore", "pets", "rocket_launch", "palette", "restaurant"]);
const COLORS = ["#c4532f", "#4f7a3a", "#2f5d8a", "#c9902a", "#7a3e6b", "#1f7a78"];
const space = (worldId) => "w" + worldId;
const txt = (v, n) => String(v ?? "").trim().slice(0, n);

/* ---------------- utilidades ---------------- */
const members = (wid) => db.prepare("SELECT m.user_id id, m.role, m.joined, u.name, u.email FROM world_members m JOIN users u ON u.id = m.user_id WHERE m.world_id = ? ORDER BY m.joined").all(wid);
function membership(wid, userId) {
  const w = db.prepare("SELECT * FROM worlds WHERE id = ?").get(wid);
  if (!w) fail(404, "Este mundo no existe");
  const m = db.prepare("SELECT role FROM world_members WHERE world_id = ? AND user_id = ?").get(wid, userId);
  if (!m) fail(403, "No eres miembro de este mundo");
  return { w, role: m.role };
}
const toMembers = (wid, event, data, exceptId) => { for (const m of members(wid)) if (m.id !== exceptId) notify(m.id, event, data); };
const toAll = (wid, event, data) => toMembers(wid, event, data, null);
const userName = (id) => db.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name || "Alguien";
function worldSummary(w, userId) {
  const m = db.prepare("SELECT role, last_read FROM world_members WHERE world_id = ? AND user_id = ?").get(w.id, userId);
  const unread = db.prepare("SELECT COUNT(*) n FROM world_messages WHERE world_id = ? AND created > ? AND user_id <> ?").get(w.id, m?.last_read || 0, userId).n;
  const count = db.prepare("SELECT COUNT(*) n FROM world_members WHERE world_id = ?").get(w.id).n;
  const last = db.prepare("SELECT MAX(t) t FROM (SELECT MAX(created) t FROM world_posts WHERE world_id = ? UNION SELECT MAX(created) FROM world_messages WHERE world_id = ?)").get(w.id, w.id).t;
  return { id: w.id, name: w.name, color: w.color, icon: w.icon, description: w.description, owner: w.owner_id, created: w.created, role: m?.role, members: count, unread, activity: last || w.created };
}

/* ---------------- carpeta del mundo ---------------- */
const emptyTree = () => ({ root: { id: ROOT, name: "Carpeta del mundo", type: "folder", children: [], ctime: now(), mtime: now() }, trash: [] });
function loadWorldFs(wid) {
  const r = db.prepare("SELECT version, json, used FROM world_fs WHERE world_id = ?").get(wid);
  return r ? { version: r.version, state: JSON.parse(r.json), used: r.used } : { version: 0, state: emptyTree(), used: 0 };
}
function applyWorldOps(wid, ops, actorId, origin) {
  let { version, state } = loadWorldFs(wid);
  let newFiles = [];
  for (const op of ops) {
    const r = applyOp(state, op);
    state = { root: r.root, trash: r.trash };
    if (op.t === "create" && !op.node.children) newFiles.push(op.node.name);
    for (const { from, to } of r.effects.copyBlobs) { try { const s = blobPath(space(wid), from); if (fs.existsSync(s)) fs.copyFileSync(s, blobPath(space(wid), to)); } catch {} }
    for (const id of r.effects.deleteBlobs) { try { fs.rmSync(blobPath(space(wid), id), { force: true }); } catch {} }
  }
  version++;
  const used = folderSize(state.root) + state.trash.reduce((s, t) => s + folderSize(t.node), 0);
  db.prepare("INSERT INTO world_fs(world_id,version,json,used) VALUES(?,?,?,?) ON CONFLICT(world_id) DO UPDATE SET version=excluded.version, json=excluded.json, used=excluded.used").run(wid, version, JSON.stringify(state), used);
  toAll(wid, "world-fs", { world: wid, version, origin });
  if (newFiles.length && actorId) {
    const w = db.prepare("SELECT name FROM worlds WHERE id = ?").get(wid);
    for (const m of members(wid)) if (m.id !== actorId) addNotification(m.id, { kind: "world-file", title: `${userName(actorId)} subió ${newFiles.length === 1 ? `“${newFiles[0]}”` : newFiles.length + " archivos"}`, body: w.name, link: { world: wid, tab: "files" }, actor: actorId });
  }
  return version;
}

/** documentos de la carpeta de un mundo abiertos en ONLYOFFICE / Euro-Office (coedición entre miembros) */
export function worldDoc(wid, userId, nodeId) {
  membership(String(wid), userId); const find = (n) => n.id === nodeId ? n : (n.children || []).reduce((r, c) => r || find(c), null);
  return { owner: space(String(wid)), node: find(loadWorldFs(String(wid)).state.root) };
}
export const worldDocSaved = (wid, nodeId, size, actorId) => applyWorldOps(String(wid), [{ t: "write", id: nodeId, size, mtime: Date.now() }], actorId, "onlyoffice");

/* ---------------- rutas ---------------- */
export async function handleWorlds(req, res, parts) {
  const u = requireUser(req);
  const [wid, area, sub, subsub] = parts;

  if (!wid) {
    if (req.method === "GET") {
      const ws = db.prepare("SELECT w.* FROM worlds w JOIN world_members m ON m.world_id = w.id WHERE m.user_id = ?").all(u.id);
      return json(res, 200, { items: ws.map(w => worldSummary(w, u.id)).sort((a, b) => b.activity - a.activity) });
    }
    if (req.method === "POST") {
      const b = await readJson(req, 16384);
      const name = txt(b.name, 60); if (!name) fail(400, "Ponle un nombre al mundo");
      if (db.prepare("SELECT COUNT(*) n FROM worlds WHERE owner_id = ?").get(u.id).n >= 50) fail(400, "Ya tienes demasiados mundos");
      const id = rid(8), t = now();
      db.prepare("INSERT INTO worlds(id,name,color,icon,description,owner_id,created) VALUES(?,?,?,?,?,?,?)")
        .run(id, name, COLORS.includes(b.color) ? b.color : COLORS[0], ICONS.has(b.icon) ? b.icon : "diversity_3", txt(b.description, 300), u.id, t);
      db.prepare("INSERT INTO world_members(world_id,user_id,role,joined,last_read) VALUES(?,?,?,?,?)").run(id, u.id, "owner", t, t);
      return json(res, 201, { item: worldSummary(db.prepare("SELECT * FROM worlds WHERE id = ?").get(id), u.id) });
    }
    fail(405, "Método no permitido");
  }

  if (!/^[a-f0-9]{16}$/.test(wid)) fail(404, "Mundo no válido");
  const { w, role } = membership(wid, u.id);
  const owner = role === "owner";

  if (!area) {
    if (req.method === "GET") return json(res, 200, { item: worldSummary(w, u.id), members: members(wid) });
    if (req.method === "PUT") {
      if (!owner) fail(403, "Solo quien creó el mundo puede editarlo");
      const b = await readJson(req, 16384);
      const name = txt(b.name, 60) || w.name;
      db.prepare("UPDATE worlds SET name=?, description=?, color=?, icon=? WHERE id=?").run(name, txt(b.description ?? w.description, 300), COLORS.includes(b.color) ? b.color : w.color, ICONS.has(b.icon) ? b.icon : w.icon, wid);
      toAll(wid, "world", { world: wid, kind: "meta" });
      return json(res, 200, { item: worldSummary(db.prepare("SELECT * FROM worlds WHERE id = ?").get(wid), u.id) });
    }
    if (req.method === "DELETE") {
      if (!owner) fail(403, "Solo quien creó el mundo puede eliminarlo");
      const ms = members(wid);
      db.prepare("DELETE FROM worlds WHERE id = ?").run(wid);
      fs.rmSync(path.join(BLOB_DIR, space(wid)), { recursive: true, force: true });
      for (const m of ms) notify(m.id, "world", { world: wid, kind: "deleted" });
      return json(res, 200, { ok: true });
    }
  }

  if (area === "members") {
    if (req.method === "POST") {
      const { email } = await readJson(req, 4096);
      const em = txt(email, 254).toLowerCase();
      const t = db.prepare("SELECT id, name FROM users WHERE email = ?").get(em);
      if (!t) fail(404, "Ese correo no tiene cuenta en Sotos");
      if (isBlocked(t.id, u.id) || isBlocked(u.id, t.id)) fail(403, "No es posible invitar a esta persona");
      if (db.prepare("SELECT 1 FROM world_members WHERE world_id = ? AND user_id = ?").get(wid, t.id)) fail(409, `${t.name} ya está en el mundo`);
      if (db.prepare("SELECT COUNT(*) n FROM world_members WHERE world_id = ?").get(wid).n >= 100) fail(400, "El mundo está lleno (100 personas)");
      db.prepare("INSERT INTO world_members(world_id,user_id,role,joined,last_read) VALUES(?,?,?,?,0)").run(wid, t.id, "member", now());
      addNotification(t.id, { kind: "world-invite", title: `${u.name} te añadió a “${w.name}”`, body: w.description || "Nuevo mundo compartido", link: { world: wid }, actor: u.id });
      toAll(wid, "world", { world: wid, kind: "members" });
      return json(res, 201, { members: members(wid) });
    }
    if (req.method === "DELETE" && sub) {
      if (sub !== u.id && !owner) fail(403, "Solo quien creó el mundo puede quitar personas");
      if (sub === w.owner_id) fail(400, "Quien creó el mundo no puede salir; puede eliminarlo");
      db.prepare("DELETE FROM world_members WHERE world_id = ? AND user_id = ?").run(wid, sub);
      notify(sub, "world", { world: wid, kind: "removed" });
      toAll(wid, "world", { world: wid, kind: "members" });
      return json(res, 200, { ok: true });
    }
  }

  if (area === "posts") {
    if (!sub && req.method === "GET") {
      const posts = db.prepare("SELECT p.*, u.name author FROM world_posts p JOIN users u ON u.id = p.user_id WHERE p.world_id = ? ORDER BY p.created DESC LIMIT 100").all(wid);
      const cm = db.prepare("SELECT c.*, u.name author FROM world_comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created");
      return json(res, 200, { items: posts.map(p => ({ id: p.id, text: p.text, created: p.created, user: p.user_id, author: p.author, comments: cm.all(p.id).map(c => ({ id: c.id, text: c.text, created: c.created, user: c.user_id, author: c.author })) })) });
    }
    if (!sub && req.method === "POST") {
      const { text } = await readJson(req, 32768);
      const t = txt(text, 5000); if (!t) fail(400, "Escribe algo");
      const id = rid(8);
      db.prepare("INSERT INTO world_posts(id,world_id,user_id,text,created) VALUES(?,?,?,?,?)").run(id, wid, u.id, t, now());
      for (const m of members(wid)) if (m.id !== u.id) addNotification(m.id, { kind: "world-post", title: `${u.name} publicó en “${w.name}”`, body: t.slice(0, 140), link: { world: wid, tab: "wall" }, actor: u.id });
      toAll(wid, "world", { world: wid, kind: "posts" });
      return json(res, 201, { id });
    }
    const p = sub && db.prepare("SELECT * FROM world_posts WHERE id = ? AND world_id = ?").get(sub, wid);
    if (!p) fail(404, "Publicación no encontrada");
    if (!subsub && req.method === "DELETE") {
      if (p.user_id !== u.id && !owner) fail(403, "No puedes borrar esta publicación");
      db.prepare("DELETE FROM world_posts WHERE id = ?").run(sub);
      toAll(wid, "world", { world: wid, kind: "posts" });
      return json(res, 200, { ok: true });
    }
    if (subsub === "comments" && req.method === "POST") {
      const { text } = await readJson(req, 16384);
      const t = txt(text, 2000); if (!t) fail(400, "Escribe algo");
      db.prepare("INSERT INTO world_comments(id,post_id,user_id,text,created) VALUES(?,?,?,?,?)").run(rid(8), sub, u.id, t, now());
      if (p.user_id !== u.id) addNotification(p.user_id, { kind: "world-comment", title: `${u.name} comentó tu publicación`, body: t.slice(0, 140), link: { world: wid, tab: "wall" }, actor: u.id });
      toAll(wid, "world", { world: wid, kind: "posts" });
      return json(res, 201, { ok: true });
    }
  }

  if (area === "messages") {
    if (req.method === "GET") {
      const before = Number(new URL(req.url, "http://x").searchParams.get("before")) || Date.now() + 1;
      const rows = db.prepare("SELECT m.*, u.name author FROM world_messages m JOIN users u ON u.id = m.user_id WHERE m.world_id = ? AND m.created < ? ORDER BY m.created DESC LIMIT 100").all(wid, before);
      return json(res, 200, { items: rows.reverse().map(m => ({ id: m.id, text: m.text, created: m.created, user: m.user_id, author: m.author })) });
    }
    if (req.method === "POST") {
      const { text } = await readJson(req, 16384);
      const t = txt(text, 2000); if (!t) fail(400, "Mensaje vacío");
      const msg = { id: rid(8), text: t, created: now(), user: u.id, author: u.name };
      db.prepare("INSERT INTO world_messages(id,world_id,user_id,text,created) VALUES(?,?,?,?,?)").run(msg.id, wid, u.id, t, msg.created);
      db.prepare("UPDATE world_members SET last_read = ? WHERE world_id = ? AND user_id = ?").run(msg.created, wid, u.id);
      toAll(wid, "world-msg", { world: wid, message: msg });
      return json(res, 201, { item: msg });
    }
  }

  if (area === "read" && req.method === "POST") {
    db.prepare("UPDATE world_members SET last_read = ? WHERE world_id = ? AND user_id = ?").run(now(), wid, u.id);
    return json(res, 200, { ok: true });
  }

  if (area === "fs") {
    if (sub === "state" && req.method === "GET") { const r = loadWorldFs(wid); return json(res, 200, { ...r, quota: WORLD_QUOTA }); }
    if (sub === "ops" && req.method === "POST") {
      const { ops, origin } = await readJson(req, 8 * 1024 * 1024);
      if (!Array.isArray(ops) || ops.length > 500 || ops.some(o => o.t === "replace")) fail(400, "Operaciones no válidas");
      try { return json(res, 200, { version: applyWorldOps(wid, ops, u.id, String(origin || "").slice(0, 40)) }); }
      catch (e) { fail(400, e.message); }
    }
    if (sub === "blob" && subsub) {
      const p = blobPath(space(wid), subsub);
      if (req.method === "GET") {
        if (!fs.existsSync(p)) fail(404, "Contenido no encontrado");
        res.writeHead(200, { "content-type": "application/octet-stream", "content-length": fs.statSync(p).size, "cache-control": "private, max-age=31536000, immutable" });
        return pipeline(fs.createReadStream(p), res);
      }
      if (req.method === "PUT") {
        const len = Number(req.headers["content-length"] || 0);
        if (len > MAX_FILE) fail(413, "Archivo demasiado grande");
        if (loadWorldFs(wid).used + len > WORLD_QUOTA) fail(507, "La carpeta del mundo está llena");
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const tmp = p + ".part-" + process.pid; let n = 0;
        try {
          await pipeline(req, async function* (src) { for await (const c of src) { n += c.length; if (n > MAX_FILE) throw Object.assign(new Error("big"), { status: 413 }); yield c; } }, fs.createWriteStream(tmp));
          fs.renameSync(tmp, p);
        } catch (e) { fs.rmSync(tmp, { force: true }); if (e.status === 413) fail(413, "Archivo demasiado grande"); throw e; }
        return json(res, 200, { ok: true, size: n });
      }
    }
  }
  fail(404, "No encontrado");
}
