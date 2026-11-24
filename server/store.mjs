/* ============================================================
   Sotos — Tienda: apps instaladas por cuenta y reseñas con estrellas
   (como install/uninstall/addReview de inevio)
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { db, now } from "./db.mjs";
import { fail, json, readJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { notify } from "./fs.mjs";

db.exec(`
CREATE TABLE IF NOT EXISTS app_installs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, app_id TEXT NOT NULL, installed INTEGER NOT NULL,
  PRIMARY KEY (user_id, app_id));
CREATE TABLE IF NOT EXISTS app_reviews (
  app_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL, text TEXT, created INTEGER NOT NULL, PRIMARY KEY (app_id, user_id));
`);
const APP_ID = /^[a-z0-9-]{2,30}$/;

export async function handleStore(req, res, parts) {
  const u = requireUser(req);
  const [app, action] = parts;
  if (!app && req.method === "GET") {
    const rows = db.prepare("SELECT app_id, installed FROM app_installs WHERE user_id = ?").all(u.id);
    const ratings = Object.fromEntries(db.prepare("SELECT app_id, AVG(stars) avg, COUNT(*) n FROM app_reviews GROUP BY app_id").all().map(r => [r.app_id, { avg: Math.round(r.avg * 10) / 10, count: r.n }]));
    return json(res, 200, { installed: rows.map(r => r.app_id), dates: Object.fromEntries(rows.map(r => [r.app_id, r.installed])), ratings });
  }
  if (!APP_ID.test(app || "")) fail(400, "App no válida");
  if (action === "install" && req.method === "POST") { db.prepare("INSERT OR IGNORE INTO app_installs(user_id,app_id,installed) VALUES(?,?,?)").run(u.id, app, now()); notify(u.id, "store", {}); return json(res, 200, { ok: true }); }
  if (action === "uninstall" && req.method === "POST") { db.prepare("DELETE FROM app_installs WHERE user_id = ? AND app_id = ?").run(u.id, app); notify(u.id, "store", {}); return json(res, 200, { ok: true }); }
  if (action === "reviews" && req.method === "GET")
    return json(res, 200, { items: db.prepare("SELECT r.*, x.name author FROM app_reviews r JOIN users x ON x.id = r.user_id WHERE app_id = ? ORDER BY created DESC LIMIT 50").all(app).map(r => ({ stars: r.stars, text: r.text, author: r.author, created: r.created, mine: r.user_id === u.id })) });
  if (action === "reviews" && req.method === "POST") {
    const { stars, text } = await readJson(req, 8192); const s = Math.round(Number(stars));
    if (!(s >= 1 && s <= 5)) fail(400, "Elige de 1 a 5 estrellas");
    db.prepare("INSERT INTO app_reviews(app_id,user_id,stars,text,created) VALUES(?,?,?,?,?) ON CONFLICT(app_id,user_id) DO UPDATE SET stars = excluded.stars, text = excluded.text, created = excluded.created")
      .run(app, u.id, s, String(text || "").trim().slice(0, 1000) || null, now());
    return json(res, 200, { ok: true });
  }
  fail(404, "No encontrado");
}
