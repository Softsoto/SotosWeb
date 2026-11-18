/* ============================================================
   Sotos — mantenimiento automático (cada hora)
   · Papelera: lo que lleva más de 30 días se elimina definitivamente
     (SOTOS_TRASH_DAYS, 0 = nunca). Tres días antes llega un aviso.
   · Espacio: aviso cuando una cuenta pasa del 80 % y del 95 % de su cuota.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { db, now } from "./db.mjs";
import { loadState, applyOps } from "./fs.mjs";
import { addNotification } from "./social.mjs";

const DAYS = Number(process.env.SOTOS_TRASH_DAYS ?? 30);
const DAY = 864e5;
db.exec(`CREATE TABLE IF NOT EXISTS upkeep_flags (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, flag TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, flag))`);
const flagged = (uid, f) => !!db.prepare("SELECT 1 FROM upkeep_flags WHERE user_id = ? AND flag = ?").get(uid, f);
const flag = (uid, f) => db.prepare("INSERT OR IGNORE INTO upkeep_flags(user_id,flag,created) VALUES(?,?,?)").run(uid, f, now());
const unflag = (uid, prefix) => db.prepare("DELETE FROM upkeep_flags WHERE user_id = ? AND flag LIKE ?").run(uid, prefix + "%");
const size = (n) => n.children ? n.children.reduce((s, c) => s + size(c), 0) : (n.size || 0);
const fmt = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : (b / 1048576).toFixed(0) + " MB";

export function runUpkeep(at = Date.now()) {
  const out = { emptied: 0, warned: 0, quota: 0 };
  for (const u of db.prepare("SELECT u.id, u.quota, f.used FROM users u JOIN fs_state f ON f.user_id = u.id").all()) {
    try {
      // ---- papelera
      if (DAYS > 0) {
        const { state } = loadState(u.id);
        const expired = state.trash.filter(t => t.at && at - t.at > DAYS * DAY).map(t => t.node.id);
        if (expired.length) { applyOps(u.id, [{ t: "destroy", ids: expired }], "papelera-automatica"); out.emptied += expired.length; }
        const soon = state.trash.filter(t => t.at && at - t.at > (DAYS - 3) * DAY && at - t.at <= DAYS * DAY);
        const key = "trash-soon:" + soon.map(t => t.node.id).sort().join(",").slice(0, 200);
        if (soon.length && !flagged(u.id, key)) {
          unflag(u.id, "trash-soon:"); flag(u.id, key); out.warned++;
          addNotification(u.id, { kind: "system", title: soon.length === 1 ? `“${soon[0].node.name}” se eliminará de la papelera en unos días` : `${soon.length} elementos se eliminarán de la papelera en unos días`, body: `Lo que lleva ${DAYS} días en la papelera se borra definitivamente. Restáuralo si lo necesitas.`, link: { app: "trash" } });
        }
      }
      // ---- espacio
      const pct = u.quota ? (u.used || 0) / u.quota : 0;
      for (const [lvl, label] of [[0.95, "95"], [0.8, "80"]]) {
        if (pct >= lvl) {
          if (!flagged(u.id, "quota:" + label)) {
            flag(u.id, "quota:" + label); out.quota++;
            addNotification(u.id, { kind: "system", title: lvl >= 0.95 ? "Tu espacio está casi lleno" : `Ya usas el ${label} % de tu espacio`, body: `${fmt(u.used)} de ${fmt(u.quota)}. Vacía la papelera o borra archivos grandes; un administrador también puede darte más espacio.`, link: { app: "files" } });
          }
          break;
        }
      }
      if (pct < 0.75) unflag(u.id, "quota:"); // si libera espacio, el aviso podrá volver a salir
    } catch (e) { console.error("[mantenimiento]", u.id, e.message); }
  }
  return out;
}

if (process.env.SOTOS_TEST !== "1") {
  setTimeout(() => runUpkeep(), 60_000).unref();
  setInterval(() => runUpkeep(), 3600_000).unref();
}
