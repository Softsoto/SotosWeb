/* ============================================================
   Sotos — lanzador (Docker y NAS)
   El botón «Actualizar» instala las versiones nuevas en SOTOS_DATA/app, que vive en el volumen
   de datos y sobrevive a reinicios y a recrear el contenedor. Al arrancar se usa la versión más
   nueva entre la que trae la imagen y la instalada ahí; si la imagen es más nueva (se reconstruyó),
   gana la imagen.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const IMAGE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const version = (dir) => { try { return fs.readFileSync(path.join(dir, "VERSION"), "utf8").trim(); } catch { return null; } };
const cmp = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

let root = IMAGE;
if (process.env.SOTOS_DATA) {
  const app = path.join(path.resolve(process.env.SOTOS_DATA), "app"), v = version(app);
  if (v && fs.existsSync(path.join(app, "server", "index.mjs")) && cmp(v, version(IMAGE) || "0") > 0) root = app;
  process.env.SOTOS_LANZADOR = "1"; // el actualizador sabe que puede instalar en SOTOS_DATA/app
  if (root !== IMAGE) console.log(`[sotos] arrancando Sotos ${v} (actualizado; la imagen trae la ${version(IMAGE)})`);
}
await import(pathToFileURL(path.join(root, "server", "index.mjs")).href);
