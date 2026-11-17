/* ============================================================
   Sotos — notificaciones y contactos
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { db, now, rid } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { notify, isOnline, onPresence } from "./fs.mjs";

/* ---------------- bloqueos ---------------- */
export const isBlocked = (userId, otherId) => !!db.prepare("SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?").get(userId, otherId);

/* ---------------- presencia ---------------- */
// personas "cercanas": compañeros de algún mundo y quienes me tienen en su agenda (o yo a ellos)
export function relatedUsers(uid) {
  const me = db.prepare("SELECT email FROM users WHERE id = ?").get(uid); if (!me) return [];
  const ids = new Set();
  for (const r of db.prepare("SELECT DISTINCT b.user_id id FROM world_members a JOIN world_members b ON a.world_id = b.world_id WHERE a.user_id = ? AND b.user_id <> ?").all(uid, uid)) ids.add(r.id);
  for (const r of db.prepare("SELECT DISTINCT user_id id FROM contacts WHERE email = ? AND user_id <> ?").all(me.email, uid)) ids.add(r.id);
  for (const r of db.prepare("SELECT u.id FROM contacts c JOIN users u ON u.email = c.email WHERE c.user_id = ? AND u.id <> ?").all(uid, uid)) ids.add(r.id);
  return [...ids];
}
onPresence((uid, online) => {
  for (const other of relatedUsers(uid)) if (!isBlocked(uid, other)) notify(other, "presence", { user: uid, online });
});
export async function handlePresence(req, res) {
  const u = requireUser(req);
  return json(res, 200, { online: relatedUsers(u.id).filter(id => isOnline(id) && !isBlocked(id, u.id)) });
}

/* ---------------- notificaciones ---------------- */
// kind: share | world-invite | world-post | world-comment | world-file
export function addNotification(userId, { kind, title, body = "", link = null, actor = null }) {
  const row = { id: rid(10), user_id: userId, kind, title: String(title).slice(0, 200), body: String(body || "").slice(0, 500), link: link ? JSON.stringify(link) : null, actor, created: now(), read: 0 };
  db.prepare("INSERT INTO notifications(id,user_id,kind,title,body,link,actor,created,read) VALUES(?,?,?,?,?,?,?,?,0)")
    .run(row.id, userId, row.kind, row.title, row.body, row.link, actor, row.created);
  // conservar solo las 200 más recientes por usuario
  db.prepare("DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created DESC LIMIT 200)").run(userId, userId);
  notify(userId, "notif", publicNotif(row));
  return row;
}
const publicNotif = (r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link ? JSON.parse(r.link) : null, actor: r.actor, created: r.created, read: !!r.read });

export async function handleNotifications(req, res, parts) {
  const u = requireUser(req);
  if (!parts[0] && req.method === "GET") {
    const rows = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created DESC LIMIT 60").all(u.id);
    const unread = db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0").get(u.id).n;
    return json(res, 200, { items: rows.map(publicNotif), unread });
  }
  if (parts[0] === "read" && req.method === "POST") {
    const { ids } = await readJson(req, 16384);
    if (Array.isArray(ids)) for (const id of ids.slice(0, 200)) db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(String(id), u.id);
    else db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(u.id);
    notify(u.id, "notif-read", {});
    return json(res, 200, { ok: true });
  }
  if (parts[0] === "clear" && req.method === "POST") {
    db.prepare("DELETE FROM notifications WHERE user_id = ?").run(u.id);
    notify(u.id, "notif-read", {});
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}

/* ---------------- contactos ---------------- */
const COLORS = ["#c4532f", "#4f7a3a", "#2f5d8a", "#c9902a", "#7a3e6b", "#1f7a78", "#8a5a3b", "#5a5689"];
const clean = (v, n) => v == null ? null : String(v).trim().slice(0, n) || null;
function withSotos(c) {
  const acc = c.email ? db.prepare("SELECT id, name FROM users WHERE email = ?").get(String(c.email).toLowerCase()) : null;
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, notes: c.notes, color: c.color, created: c.created, updated: c.updated, sotos: acc ? { id: acc.id, name: acc.name } : null };
}
export async function handleContacts(req, res, parts) {
  const u = requireUser(req);
  const [id] = parts;
  if (id === "groups") return handleGroups(req, res, u, parts.slice(1));
  if (id === "blocks") return handleBlocks(req, res, u, parts.slice(1));
  if (!id && req.method === "GET") return json(res, 200, { items: db.prepare("SELECT * FROM contacts WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(u.id).map(withSotos) });
  if (!id && req.method === "POST") {
    const b = await readJson(req, 16384);
    const name = clean(b.name, 80); if (!name) fail(400, "Escribe un nombre");
    const email = clean(b.email, 254)?.toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Correo no válido");
    if (db.prepare("SELECT COUNT(*) n FROM contacts WHERE user_id = ?").get(u.id).n >= 2000) fail(400, "Demasiados contactos");
    const cid = rid(8), t = now();
    db.prepare("INSERT INTO contacts(id,user_id,name,email,phone,company,notes,color,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(cid, u.id, name, email, clean(b.phone, 40), clean(b.company, 80), clean(b.notes, 2000), COLORS[Math.floor(Math.random() * COLORS.length)], t, t);
    return json(res, 201, { item: withSotos(db.prepare("SELECT * FROM contacts WHERE id = ?").get(cid)) });
  }
  const c = id && db.prepare("SELECT * FROM contacts WHERE id = ? AND user_id = ?").get(id, u.id);
  if (!c) fail(404, "Contacto no encontrado");
  if (req.method === "PUT") {
    const b = await readJson(req, 16384);
    const name = clean(b.name, 80); if (!name) fail(400, "Escribe un nombre");
    const email = clean(b.email, 254)?.toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Correo no válido");
    db.prepare("UPDATE contacts SET name=?, email=?, phone=?, company=?, notes=?, updated=? WHERE id=?").run(name, email, clean(b.phone, 40), clean(b.company, 80), clean(b.notes, 2000), now(), id);
    return json(res, 200, { item: withSotos(db.prepare("SELECT * FROM contacts WHERE id = ?").get(id)) });
  }
  if (req.method === "DELETE") { db.prepare("DELETE FROM contacts WHERE id = ?").run(id); return json(res, 200, { ok: true }); }
  fail(405, "Método no permitido");
}

/* ---------------- grupos de contactos ---------------- */
const groupOut = (g) => ({ id: g.id, name: g.name, color: g.color, members: db.prepare("SELECT contact_id FROM contact_group_members WHERE group_id = ?").all(g.id).map(r => r.contact_id) });
async function handleGroups(req, res, u, [gid]) {
  if (!gid && req.method === "GET") return json(res, 200, { items: db.prepare("SELECT * FROM contact_groups WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(u.id).map(groupOut) });
  if (!gid && req.method === "POST") {
    const b = await readJson(req, 4096); const name = clean(b.name, 60); if (!name) fail(400, "Escribe un nombre para el grupo");
    if (db.prepare("SELECT COUNT(*) n FROM contact_groups WHERE user_id = ?").get(u.id).n >= 100) fail(400, "Demasiados grupos");
    const id = rid(8); db.prepare("INSERT INTO contact_groups(id,user_id,name,color,created) VALUES(?,?,?,?,?)").run(id, u.id, name, COLORS.includes(b.color) ? b.color : COLORS[0], now());
    return json(res, 201, { item: groupOut(db.prepare("SELECT * FROM contact_groups WHERE id = ?").get(id)) });
  }
  const g = gid && db.prepare("SELECT * FROM contact_groups WHERE id = ? AND user_id = ?").get(gid, u.id); if (!g) fail(404, "Grupo no encontrado");
  if (req.method === "PUT") {
    const b = await readJson(req, 65536);
    const name = b.name !== undefined ? clean(b.name, 60) : g.name; if (!name) fail(400, "Escribe un nombre para el grupo");
    db.prepare("UPDATE contact_groups SET name = ?, color = ? WHERE id = ?").run(name, COLORS.includes(b.color) ? b.color : g.color, gid);
    if (Array.isArray(b.members)) {
      db.prepare("DELETE FROM contact_group_members WHERE group_id = ?").run(gid);
      for (const cid of b.members.slice(0, 2000)) if (db.prepare("SELECT 1 FROM contacts WHERE id = ? AND user_id = ?").get(String(cid), u.id))
        db.prepare("INSERT OR IGNORE INTO contact_group_members(group_id,contact_id) VALUES(?,?)").run(gid, String(cid));
    }
    return json(res, 200, { item: groupOut(db.prepare("SELECT * FROM contact_groups WHERE id = ?").get(gid)) });
  }
  if (req.method === "DELETE") { db.prepare("DELETE FROM contact_groups WHERE id = ?").run(gid); return json(res, 200, { ok: true }); }
  fail(405, "Método no permitido");
}

/* ---------------- bloqueos ---------------- */
async function handleBlocks(req, res, u, [bid]) {
  if (!bid && req.method === "GET") return json(res, 200, { items: db.prepare("SELECT b.blocked_id id, x.name, x.email, b.created FROM blocks b JOIN users x ON x.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created DESC").all(u.id) });
  if (!bid && req.method === "POST") {
    const { userId } = await readJson(req, 4096); const t = db.prepare("SELECT id, name FROM users WHERE id = ?").get(String(userId || ""));
    if (!t || t.id === u.id) fail(400, "Usuario no válido");
    db.prepare("INSERT OR IGNORE INTO blocks(user_id,blocked_id,created) VALUES(?,?,?)").run(u.id, t.id, now());
    db.prepare("UPDATE inbox SET status = 'refused', decided = ? WHERE to_user = ? AND from_user = ? AND status = 'pending'").run(now(), u.id, t.id);
    return json(res, 200, { ok: true, name: t.name });
  }
  if (bid && req.method === "DELETE") { db.prepare("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?").run(u.id, bid); return json(res, 200, { ok: true }); }
  fail(405, "Método no permitido");
}