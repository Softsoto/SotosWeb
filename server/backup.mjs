/* ============================================================
   Sotos — copias de seguridad automáticas del servidor
   Cada día (a las 3:00 por defecto) se guarda una copia completa de los datos:
   la base de datos con VACUUM INTO (copia consistente aunque el servidor esté en uso)
   y el contenido de los archivos. Si la copia vive en el mismo disco, el contenido se
   enlaza (hard link) en vez de copiarse: no ocupa espacio extra y, como Sotos nunca
   modifica un contenido en su sitio (escribe uno nuevo y lo renombra), cada copia
   conserva los archivos tal como estaban ese día. Se guardan las últimas 7.

   SOTOS_BACKUP_DIR   carpeta de las copias (por defecto <datos>/copias; mejor en otro disco)
   SOTOS_BACKUP_KEEP  cuántas copias guardar (7)
   SOTOS_BACKUP_HOUR  hora del día de la copia (3); "off" las desactiva
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR } from "./db.mjs";

export const BACKUP_DIR = path.resolve(process.env.SOTOS_BACKUP_DIR || path.join(DATA_DIR, "copias"));
const KEEP = Math.max(1, Number(process.env.SOTOS_BACKUP_KEEP || 7));
const HOUR = process.env.SOTOS_BACKUP_HOUR === "off" ? null : Number(process.env.SOTOS_BACKUP_HOUR ?? 3);
// lo que no se copia: las propias copias, cachés que se regeneran y los archivos de la base (van por VACUUM INTO)
const SKIP = new Set(["copias", "media-cache", "biblioteca", "servicios", "sotos.db", "sotos.db-wal", "sotos.db-shm"]); // biblioteca y servicios se regeneran
const LINKABLE = new Set(["blobs", "vault"]); // contenido inmutable: se enlaza

let running = null, lastError = null;
const stamp = (d = new Date()) => d.toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");

function copyTree(src, dst, link, acc) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (path.resolve(s) === BACKUP_DIR) continue;
    if (e.isDirectory()) copyTree(s, d, link, acc);
    else if (e.isFile()) {
      if (/\.(part|oo-\d+)$/.test(e.name)) continue; // escrituras a medias
      const size = fs.statSync(s).size; acc.files++; acc.bytes += size;
      if (link) { try { fs.linkSync(s, d); acc.linked++; continue; } catch {} } // otro disco o sistema sin enlaces: se copia
      fs.copyFileSync(s, d);
    }
  }
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR, { withFileTypes: true }).filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(-\d{2})?$/.test(e.name))
    .map(e => { let info = {}; try { info = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, e.name, "copia.json"), "utf8")); } catch {} return { name: e.name, ...info, complete: !!info.finished }; })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function runBackup(reason = "automática") {
  if (running) return running;
  running = (async () => {
    await null; // marca la copia como "en curso" antes de empezar
    const name = stamp(), dir = path.join(BACKUP_DIR, name), t0 = Date.now();
    const acc = { files: 0, bytes: 0, linked: 0 };
    try {
      fs.mkdirSync(dir, { recursive: true });
      db.exec(`VACUUM INTO '${path.join(dir, "sotos.db").replace(/'/g, "''")}'`);
      acc.bytes += fs.statSync(path.join(dir, "sotos.db")).size;
      for (const e of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const s = path.join(DATA_DIR, e.name);
        if (path.resolve(s) === BACKUP_DIR) continue;
        if (e.isDirectory()) copyTree(s, path.join(dir, e.name), LINKABLE.has(e.name), acc);
        else if (e.isFile()) { fs.copyFileSync(s, path.join(dir, e.name)); acc.files++; acc.bytes += fs.statSync(s).size; }
      }
      const info = { reason, started: t0, finished: Date.now(), files: acc.files, bytes: acc.bytes, linked: acc.linked };
      fs.writeFileSync(path.join(dir, "copia.json"), JSON.stringify(info, null, 2));
      // rotación: se borran las más viejas
      for (const old of listBackups().slice(KEEP)) fs.rmSync(path.join(BACKUP_DIR, old.name), { recursive: true, force: true });
      lastError = null; console.log(`[copias] ${name}: ${acc.files} archivos (${(acc.bytes / 1048576).toFixed(1)} MB, ${acc.linked} enlazados) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return { name, ...info };
    } catch (e) {
      lastError = e.message; console.error("[copias] falló:", e.message);
      fs.rmSync(dir, { recursive: true, force: true }); throw e;
    }
  })();
  running.finally(() => { running = null; }).catch(() => {}); // se libera al terminar (el cuerpo corre de una vez, sin pausas)
  return running;
}

export const backupStatus = () => ({ dir: BACKUP_DIR, keep: KEEP, hour: HOUR, running: !!running, lastError, items: listBackups() });

// programación: una vez al día a la hora elegida; si al arrancar la última copia tiene más de un día, se hace en 2 minutos
if (HOUR !== null && process.env.SOTOS_TEST !== "1") {
  const last = listBackups()[0]; const age = last?.finished ? Date.now() - last.finished : Infinity;
  if (age > 26 * 3600_000) setTimeout(() => runBackup("al arrancar (no había una copia reciente)").catch(() => {}), 120_000).unref();
  const next = () => { const n = new Date(); n.setHours(HOUR, 0, 0, 0); if (n <= new Date()) n.setDate(n.getDate() + 1); return n - Date.now(); };
  const loop = () => setTimeout(() => { runBackup().catch(() => {}).finally(loop); }, next()).unref();
  loop();
}
