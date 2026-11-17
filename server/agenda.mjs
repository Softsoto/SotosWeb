/* ============================================================
   Sotos — Calendario y Tareas (como el calendario y las tareas de inevio)
   Calendarios personales y uno compartido por cada Mundo; listas de tareas
   personales o de un Mundo, con asignación y comentarios. Recordatorios
   por notificación. Eventos en vivo por SSE a quien corresponda.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { db, now, rid } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { notify } from "./fs.mjs";
import { addNotification } from "./social.mjs";

db.exec(`
CREATE TABLE IF NOT EXISTS calendars (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, color TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, calendar_id TEXT REFERENCES calendars(id) ON DELETE CASCADE,
  world_id TEXT REFERENCES worlds(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT, notes TEXT, remind INTEGER, reminded INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_cal ON events(calendar_id, start);
CREATE INDEX IF NOT EXISTS idx_events_world ON events(world_id, start);
CREATE TABLE IF NOT EXISTS task_lists (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id TEXT REFERENCES worlds(id) ON DELETE CASCADE, name TEXT NOT NULL, color TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL, notes TEXT, due INTEGER, priority INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0,
  assignee TEXT REFERENCES users(id) ON DELETE SET NULL, creator TEXT REFERENCES users(id) ON DELETE SET NULL,
  created INTEGER NOT NULL, updated INTEGER NOT NULL, done_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, created INTEGER NOT NULL);
`);

const COLORS = ["#c4532f", "#4f7a3a", "#2f5d8a", "#c9902a", "#7a3e6b", "#1f7a78", "#8a5a3b", "#5a5689"];
const txt = (v, n) => v == null ? null : (String(v).trim().slice(0, n) || null);
const color = (c, i = 0) => COLORS.includes(c) ? c : COLORS[i % COLORS.length];
const myWorlds = (uid) => db.prepare("SELECT w.id, w.name, w.color FROM world_members m JOIN worlds w ON w.id = m.world_id WHERE m.user_id = ?").all(uid);
const isMember = (uid, wid) => !!db.prepare("SELECT 1 FROM world_members WHERE world_id = ? AND user_id = ?").get(wid, uid);
const members = (wid) => db.prepare("SELECT user_id FROM world_members WHERE world_id = ?").all(wid).map(r => r.user_id);
const tell = (uid, wid, event, data) => { if (wid) for (const m of members(wid)) notify(m, event, data); else notify(uid, event, data); };

/* ======================= CALENDARIO ======================= */
function ensureDefault(uid) {
  if (!db.prepare("SELECT 1 FROM calendars WHERE user_id = ?").get(uid))
    db.prepare("INSERT INTO calendars(id,user_id,name,color,created) VALUES(?,?,?,?,?)").run(rid(8), uid, "Personal", "#2f5d8a", now());
}
const evOut = (e) => ({ id: e.id, calendarId: e.calendar_id, worldId: e.world_id, title: e.title, start: e.start, end: e.end, allDay: !!e.all_day, location: e.location, notes: e.notes, remind: e.remind, author: e.author || null, mine: !!e.mine });
function canEditEvent(uid, e) { if (e.world_id) return isMember(uid, e.world_id); return !!db.prepare("SELECT 1 FROM calendars WHERE id = ? AND user_id = ?").get(e.calendar_id, uid); }
async function eventBody(req) {
  const b = await readJson(req, 32768);
  const title = txt(b.title, 200); if (!title) fail(400, "Escribe un título");
  const start = Number(b.start), end = Number(b.end || b.start);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) fail(400, "Fechas no válidas");
  const remind = b.remind == null || b.remind === "" ? null : Math.max(0, Math.min(10080, Math.round(Number(b.remind))));
  return { b, title, start, end, allDay: b.allDay ? 1 : 0, location: txt(b.location, 200), notes: txt(b.notes, 5000), remind };
}

export async function handleCalendar(req, res, parts) {
  const u = requireUser(req); ensureDefault(u.id);
  const [a, id] = parts;
  if (!a && req.method === "GET") {
    const url = new URL(req.url, "http://x"); const from = Number(url.searchParams.get("from")) || 0, to = Number(url.searchParams.get("to")) || 8.64e15;
    const cals = db.prepare("SELECT * FROM calendars WHERE user_id = ? ORDER BY created").all(u.id);
    const worlds = myWorlds(u.id);
    const own = cals.length ? db.prepare(`SELECT e.*, 1 mine FROM events e WHERE calendar_id IN (${cals.map(() => "?").join(",")}) AND e.end >= ? AND e.start <= ?`).all(...cals.map(c => c.id), from, to) : [];
    const shared = worlds.length ? db.prepare(`SELECT e.*, x.name author, (e.user_id = ?) mine FROM events e JOIN users x ON x.id = e.user_id WHERE world_id IN (${worlds.map(() => "?").join(",")}) AND e.end >= ? AND e.start <= ?`).all(u.id, ...worlds.map(w => w.id), from, to) : [];
    return json(res, 200, { calendars: cals.map(c => ({ id: c.id, name: c.name, color: c.color })), worlds, events: [...own, ...shared].map(evOut) });
  }
  if (a === "calendars") {
    if (!id && req.method === "POST") { const b = await readJson(req, 4096); const name = txt(b.name, 60); if (!name) fail(400, "Escribe un nombre");
      const n = db.prepare("SELECT COUNT(*) n FROM calendars WHERE user_id = ?").get(u.id).n; if (n >= 30) fail(400, "Demasiados calendarios");
      const cid = rid(8); db.prepare("INSERT INTO calendars(id,user_id,name,color,created) VALUES(?,?,?,?,?)").run(cid, u.id, name, color(b.color, n), now());
      notify(u.id, "calendar", {}); return json(res, 201, { item: { id: cid, name, color: color(b.color, n) } }); }
    const c = id && db.prepare("SELECT * FROM calendars WHERE id = ? AND user_id = ?").get(id, u.id); if (!c) fail(404, "Calendario no encontrado");
    if (req.method === "PUT") { const b = await readJson(req, 4096); db.prepare("UPDATE calendars SET name = ?, color = ? WHERE id = ?").run(txt(b.name, 60) || c.name, color(b.color || c.color), id); notify(u.id, "calendar", {}); return json(res, 200, { ok: true }); }
    if (req.method === "DELETE") { if (db.prepare("SELECT COUNT(*) n FROM calendars WHERE user_id = ?").get(u.id).n <= 1) fail(409, "Debe quedar al menos un calendario"); db.prepare("DELETE FROM calendars WHERE id = ?").run(id); notify(u.id, "calendar", {}); return json(res, 200, { ok: true }); }
  }
  if (a === "events") {
    if (!id && req.method === "POST") {
      const { b, title, start, end, allDay, location, notes, remind } = await eventBody(req);
      let cal = null, wid = null;
      if (b.worldId) { if (!isMember(u.id, String(b.worldId))) fail(403, "No eres miembro de ese mundo"); wid = String(b.worldId); }
      else { cal = db.prepare("SELECT id FROM calendars WHERE id = ? AND user_id = ?").get(String(b.calendarId || ""), u.id) || db.prepare("SELECT id FROM calendars WHERE user_id = ? ORDER BY created LIMIT 1").get(u.id); }
      const eid = rid(10), t = now();
      db.prepare("INSERT INTO events(id,calendar_id,world_id,user_id,title,start,end,all_day,location,notes,remind,reminded,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?)")
        .run(eid, cal?.id || null, wid, u.id, title, start, end, allDay, location, notes, remind, t, t);
      if (wid) for (const m of members(wid)) if (m !== u.id) addNotification(m, { kind: "event", title: `${u.name} añadió “${title}” al calendario del mundo`, body: new Date(start).toLocaleString("es-CO"), link: { app: "calendar", date: start }, actor: u.name });
      tell(u.id, wid, "calendar", {}); return json(res, 201, { id: eid });
    }
    const e = id && db.prepare("SELECT * FROM events WHERE id = ?").get(id); if (!e || !canEditEvent(u.id, e)) fail(404, "Evento no encontrado");
    if (req.method === "PUT") {
      const { b, title, start, end, allDay, location, notes, remind } = await eventBody(req);
      let cal = e.calendar_id; if (!e.world_id && b.calendarId && db.prepare("SELECT 1 FROM calendars WHERE id = ? AND user_id = ?").get(String(b.calendarId), u.id)) cal = String(b.calendarId);
      db.prepare("UPDATE events SET calendar_id=?, title=?, start=?, end=?, all_day=?, location=?, notes=?, remind=?, reminded=0, updated=? WHERE id=?").run(cal, title, start, end, allDay, location, notes, remind, now(), id);
      tell(u.id, e.world_id, "calendar", {}); return json(res, 200, { ok: true });
    }
    if (req.method === "DELETE") { db.prepare("DELETE FROM events WHERE id = ?").run(id); tell(u.id, e.world_id, "calendar", {}); return json(res, 200, { ok: true }); }
  }
  fail(404, "No encontrado");
}

// recordatorios: cada 30 s se avisa de los eventos cuyo aviso ya toca
setInterval(() => {
  const t = now();
  const due = db.prepare("SELECT e.*, c.user_id owner FROM events e LEFT JOIN calendars c ON c.id = e.calendar_id WHERE e.remind IS NOT NULL AND e.reminded = 0 AND e.start - e.remind * 60000 <= ? AND e.start >= ?").all(t, t - 3600_000);
  for (const e of due) {
    db.prepare("UPDATE events SET reminded = 1 WHERE id = ?").run(e.id);
    const who = e.world_id ? members(e.world_id) : [e.owner];
    const mins = Math.max(0, Math.round((e.start - t) / 60000));
    for (const m of who) if (m) addNotification(m, { kind: "reminder", title: `Recordatorio: ${e.title}`, body: mins ? `Empieza en ${mins} min${e.location ? " · " + e.location : ""}` : `Empieza ahora${e.location ? " · " + e.location : ""}`, link: { app: "calendar", date: e.start } });
  }
}, 30_000).unref();

/* ======================= TAREAS ======================= */
function ensureList(uid) {
  if (!db.prepare("SELECT 1 FROM task_lists WHERE user_id = ? AND world_id IS NULL").get(uid))
    db.prepare("INSERT INTO task_lists(id,user_id,world_id,name,color,created) VALUES(?,?,NULL,?,?,?)").run(rid(8), uid, "Mis tareas", "#4f7a3a", now());
}
function canList(uid, l) { return l && (l.world_id ? isMember(uid, l.world_id) : l.user_id === uid); }
const taskOut = (t) => ({ id: t.id, listId: t.list_id, title: t.title, notes: t.notes, due: t.due, priority: t.priority, done: !!t.done, doneAt: t.done_at,
  assignee: t.assignee ? { id: t.assignee, name: t.assignee_name } : null, creator: t.creator_name || null, comments: t.comments || 0, created: t.created, updated: t.updated });
const TASK_SELECT = `SELECT t.*, a.name assignee_name, c.name creator_name, (SELECT COUNT(*) FROM task_comments k WHERE k.task_id = t.id) comments FROM tasks t LEFT JOIN users a ON a.id = t.assignee LEFT JOIN users c ON c.id = t.creator`;

export async function handleTasks(req, res, parts) {
  const u = requireUser(req); ensureList(u.id);
  const [a, id, sub] = parts;
  if (!a && req.method === "GET") {
    const worlds = myWorlds(u.id);
    const lists = db.prepare(`SELECT * FROM task_lists WHERE (user_id = ? AND world_id IS NULL)${worlds.length ? ` OR world_id IN (${worlds.map(() => "?").join(",")})` : ""} ORDER BY created`).all(u.id, ...worlds.map(w => w.id));
    const tasks = lists.length ? db.prepare(`${TASK_SELECT} WHERE t.list_id IN (${lists.map(() => "?").join(",")}) ORDER BY t.done, COALESCE(t.due, 9e15), t.priority DESC, t.created`).all(...lists.map(l => l.id)) : [];
    return json(res, 200, { lists: lists.map(l => ({ id: l.id, name: l.name, color: l.color, worldId: l.world_id, world: l.world_id ? worlds.find(w => w.id === l.world_id)?.name : null })), worlds, tasks: tasks.map(taskOut) });
  }
  if (a === "lists") {
    if (!id && req.method === "POST") { const b = await readJson(req, 4096); const name = txt(b.name, 60); if (!name) fail(400, "Escribe un nombre");
      const wid = b.worldId ? String(b.worldId) : null; if (wid && !isMember(u.id, wid)) fail(403, "No eres miembro de ese mundo");
      const lid = rid(8); db.prepare("INSERT INTO task_lists(id,user_id,world_id,name,color,created) VALUES(?,?,?,?,?,?)").run(lid, u.id, wid, name, color(b.color, 1), now());
      tell(u.id, wid, "tasks", {}); return json(res, 201, { id: lid }); }
    const l = id && db.prepare("SELECT * FROM task_lists WHERE id = ?").get(id); if (!canList(u.id, l)) fail(404, "Lista no encontrada");
    if (req.method === "PUT") { const b = await readJson(req, 4096); db.prepare("UPDATE task_lists SET name = ?, color = ? WHERE id = ?").run(txt(b.name, 60) || l.name, color(b.color || l.color), id); tell(u.id, l.world_id, "tasks", {}); return json(res, 200, { ok: true }); }
    if (req.method === "DELETE") { if (!l.world_id && db.prepare("SELECT COUNT(*) n FROM task_lists WHERE user_id = ? AND world_id IS NULL").get(u.id).n <= 1) fail(409, "Debe quedar al menos una lista personal"); db.prepare("DELETE FROM task_lists WHERE id = ?").run(id); tell(u.id, l.world_id, "tasks", {}); return json(res, 200, { ok: true }); }
  }
  if (a === "items") {
    if (!id && req.method === "POST") {
      const b = await readJson(req, 16384); const l = db.prepare("SELECT * FROM task_lists WHERE id = ?").get(String(b.listId || "")); if (!canList(u.id, l)) fail(404, "Lista no encontrada");
      const title = txt(b.title, 300); if (!title) fail(400, "Escribe la tarea");
      const assignee = b.assignee && l.world_id && isMember(String(b.assignee), l.world_id) ? String(b.assignee) : null;
      const tid = rid(10), t = now();
      db.prepare("INSERT INTO tasks(id,list_id,title,notes,due,priority,done,assignee,creator,created,updated) VALUES(?,?,?,?,?,?,0,?,?,?,?)")
        .run(tid, l.id, title, txt(b.notes, 5000), b.due ? Number(b.due) : null, Math.max(0, Math.min(2, Number(b.priority) || 0)), assignee, u.id, t, t);
      if (assignee && assignee !== u.id) addNotification(assignee, { kind: "task", title: `${u.name} te asignó “${title}”`, body: l.name, link: { app: "tasks", list: l.id }, actor: u.name });
      tell(u.id, l.world_id, "tasks", {}); return json(res, 201, { id: tid });
    }
    const t = id && db.prepare("SELECT t.*, l.world_id, l.user_id owner FROM tasks t JOIN task_lists l ON l.id = t.list_id WHERE t.id = ?").get(id);
    if (!t || !canList(u.id, { world_id: t.world_id, user_id: t.owner })) fail(404, "Tarea no encontrada");
    if (sub === "comments") {
      if (req.method === "GET") return json(res, 200, { items: db.prepare("SELECT k.*, x.name author FROM task_comments k JOIN users x ON x.id = k.user_id WHERE task_id = ? ORDER BY created").all(id).map(k => ({ id: k.id, text: k.text, author: k.author, user: k.user_id, created: k.created })) });
      if (req.method === "POST") { const { text } = await readJson(req, 8192); const tx = txt(text, 2000); if (!tx) fail(400, "Escribe un comentario");
        db.prepare("INSERT INTO task_comments(id,task_id,user_id,text,created) VALUES(?,?,?,?,?)").run(rid(10), id, u.id, tx, now());
        for (const who of new Set([t.creator, t.assignee].filter(x => x && x !== u.id))) addNotification(who, { kind: "task-comment", title: `${u.name} comentó en “${t.title}”`, body: tx.slice(0, 200), link: { app: "tasks", list: t.list_id }, actor: u.name });
        tell(u.id, t.world_id, "tasks", {}); return json(res, 201, { ok: true }); }
    }
    if (!sub && req.method === "PUT") {
      const b = await readJson(req, 16384); const f = { ...t };
      if (b.title !== undefined) { f.title = txt(b.title, 300); if (!f.title) fail(400, "Escribe la tarea"); }
      if (b.notes !== undefined) f.notes = txt(b.notes, 5000);
      if (b.due !== undefined) f.due = b.due ? Number(b.due) : null;
      if (b.priority !== undefined) f.priority = Math.max(0, Math.min(2, Number(b.priority) || 0));
      if (b.done !== undefined) { f.done = b.done ? 1 : 0; f.done_at = b.done ? now() : null; }
      if (b.listId !== undefined) { const l = db.prepare("SELECT * FROM task_lists WHERE id = ?").get(String(b.listId)); if (canList(u.id, l)) f.list_id = l.id; }
      if (b.assignee !== undefined) { const ok = b.assignee && t.world_id && isMember(String(b.assignee), t.world_id); const nv = ok ? String(b.assignee) : null;
        if (nv && nv !== t.assignee && nv !== u.id) addNotification(nv, { kind: "task", title: `${u.name} te asignó “${f.title}”`, link: { app: "tasks", list: f.list_id }, actor: u.name }); f.assignee = nv; }
      db.prepare("UPDATE tasks SET list_id=?, title=?, notes=?, due=?, priority=?, done=?, done_at=?, assignee=?, updated=? WHERE id=?").run(f.list_id, f.title, f.notes, f.due, f.priority, f.done, f.done_at, f.assignee, now(), id);
      if (b.done && t.creator && t.creator !== u.id && !t.done) addNotification(t.creator, { kind: "task-done", title: `${u.name} completó “${f.title}”`, link: { app: "tasks", list: f.list_id }, actor: u.name });
      tell(u.id, t.world_id, "tasks", {}); return json(res, 200, { item: taskOut(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id)) });
    }
    if (!sub && req.method === "DELETE") { db.prepare("DELETE FROM tasks WHERE id = ?").run(id); tell(u.id, t.world_id, "tasks", {}); return json(res, 200, { ok: true }); }
  }
  fail(404, "No encontrado");
}
