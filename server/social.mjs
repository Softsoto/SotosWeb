/* ============================================================
   Sotos — notificaciones y contactos
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { db, now, rid } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { notify } from "./fs.mjs";

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
