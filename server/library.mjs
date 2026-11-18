/* ============================================================
   Sotos — biblioteca multimedia para Jellyfin (Cine) e Immich (Fotos)
   Para cada cuenta que activa Cine o Fotos se mantiene <datos>/biblioteca/<cuenta>/{Videos,Musica,Fotos}
   con la misma estructura de carpetas que en Archivos. Son enlaces (hard links) al contenido real:
   no ocupan espacio extra. Se actualiza sola cuando la persona sube, mueve, renombra o borra.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { db, now, DATA_DIR } from "./db.mjs";
import { loadState, blobPath, onFsChange } from "./fs.mjs";

export const LIB_DIR = path.join(DATA_DIR, "biblioteca");
db.exec(`CREATE TABLE IF NOT EXISTS media_lib (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, service TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, service))`);
const KIND = { video: "Videos", audio: "Musica", img: "Fotos" };
const clean = (s) => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/[. ]+$/, "_").slice(0, 180) || "_";
const listeners = new Set(); // al terminar de sincronizar (Jellyfin/Immich vuelven a escanear)
export const onLibraryChange = (fn) => listeners.add(fn);

export function enableLibrary(uid, service) { db.prepare("INSERT OR IGNORE INTO media_lib(user_id,service,created) VALUES(?,?,?)").run(uid, service, now()); return syncLibrary(uid); }
const enabled = (uid) => !!db.prepare("SELECT 1 FROM media_lib WHERE user_id = ?").get(uid);

/** deja la carpeta de la cuenta igual a sus archivos de video, música e imágenes */
export function syncLibrary(uid) {
  const want = new Map(); // ruta relativa → contenido
  const walk = (n, parts) => { for (const c of n.children || []) { if (c.children) walk(c, [...parts, clean(c.name)]); else if (KIND[c.type] && c.size) want.set(path.join(KIND[c.type], ...parts, clean(c.name)), c.id); } };
  walk(loadState(uid).state.root, []);
  const base = path.join(LIB_DIR, uid); fs.mkdirSync(base, { recursive: true }); for (const k of Object.values(KIND)) fs.mkdirSync(path.join(base, k), { recursive: true });
  let added = 0, removed = 0;
  // quitar lo que ya no está o cambió de contenido
  const scan = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name), rel = path.relative(base, p);
    if (e.isDirectory()) { scan(p); if (!fs.readdirSync(p).length && !Object.values(KIND).includes(rel)) fs.rmdirSync(p); continue; }
    const id = want.get(rel); let same = false; try { same = !!id && fs.statSync(p).ino === fs.statSync(blobPath(uid, id)).ino; } catch {}
    if (same) want.delete(rel); else { fs.rmSync(p, { force: true }); removed++; } } };
  scan(base);
  for (const [rel, id] of want) {
    const src = blobPath(uid, id), dst = path.join(base, rel); if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try { fs.linkSync(src, dst); } catch { try { fs.copyFileSync(src, dst); } catch { continue; } } // otro disco: copia
    added++;
  }
  if (added || removed) for (const fn of listeners) try { fn(uid, { added, removed }); } catch {}
  return { added, removed };
}

// cambios en los archivos: se sincroniza a los pocos segundos (agrupando ráfagas de cambios)
const pending = new Map();
onFsChange((uid) => { if (!enabled(uid)) return; clearTimeout(pending.get(uid)); pending.set(uid, setTimeout(() => { pending.delete(uid); try { syncLibrary(uid); } catch (e) { console.error("[biblioteca]", e.message); } }, 4000)); });
