// Sotos — trae de vuelta una copia guardada en un almacenamiento S3 (Backblaze B2, R2, Wasabi, AWS, MinIO…)
// No necesita el servidor viejo: solo los datos del bucket.
//
//   node scripts/restaurar-copia.mjs --endpoint https://s3.us-west-004.backblazeb2.com --region us-west-004 \
//        --bucket mi-bucket [--prefix sotos] --access-key KEY --destino ./datos-restaurados [--copia 2026-11-20_03-00-00]
//   (la clave secreta se pide escondida, o con la variable SOTOS_S3_SECRET)
//   --listar   solo muestra las copias disponibles
//
// Luego: apunta SOTOS_DATA a la carpeta de destino (o copia su contenido a la carpeta de datos) y arranca Sotos.
// Si la copia está en otro disco o en un NAS (destino «carpeta»), basta con copiar la carpeta de la fecha.
// © 2026 Sebastian Sotomontes
import fs from "node:fs"; import path from "node:path"; import { pipeline } from "node:stream/promises"; import { Readable } from "node:stream";
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => { if (x.startsWith("--")) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]); return a; }, []));
const need = (k) => { if (!args[k]) { console.error(`Falta --${k}`); process.exit(2); } return args[k]; };
async function askHidden(q) {
  if (process.env.SOTOS_S3_SECRET) return process.env.SOTOS_S3_SECRET;
  process.stdout.write(q); const stdin = process.stdin; stdin.setRawMode?.(true); stdin.resume(); let s = "";
  return new Promise(ok => stdin.on("data", function on(d) { for (const ch of d.toString("utf8")) { if (ch === "\r" || ch === "\n") { stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", on); process.stdout.write("\n"); return ok(s); } if (ch === "\u0003") process.exit(1); if (ch === "\u007f" || ch === "\b") s = s.slice(0, -1); else s += ch; } }));
}
const { s3client } = await import(new URL("../server/s3.mjs", import.meta.url)); // sin base de datos: no toca nada del servidor
const s3 = s3client({ endpoint: need("endpoint").replace(/\/+$/, ""), region: args.region || "auto", bucket: need("bucket"), accessKey: need("access-key"), secret: await askHidden("Clave secreta: ") });
const P = (args.prefix === undefined ? "sotos" : String(args.prefix)).replace(/^\/+|\/+$/g, ""), PP = P ? P + "/" : "";
const keys = await s3.list(PP + "copias/");
const snaps = [...new Set([...keys.keys()].map(k => k.slice((PP + "copias/").length).split("/")[0]))].filter(n => keys.has(`${PP}copias/${n}/copia.json`)).sort().reverse();
if (!snaps.length) { console.error("No hay copias completas en ese bucket/carpeta."); process.exit(1); }
if (args.listar) { console.log("Copias disponibles (la más reciente primero):"); for (const s of snaps) console.log("  " + s); process.exit(0); }
const pick = args.copia && args.copia !== true ? String(args.copia) : snaps[0]; if (!snaps.includes(pick)) { console.error(`No existe la copia ${pick}. Usa --listar.`); process.exit(1); }
const dest = path.resolve(need("destino")); if (fs.existsSync(dest) && fs.readdirSync(dest).length) { console.error(`La carpeta ${dest} no está vacía: elige una vacía.`); process.exit(1); }
fs.mkdirSync(dest, { recursive: true });
const save = async (key, rel) => { const to = path.join(dest, ...rel.split("/")); if (!to.startsWith(dest + path.sep)) throw new Error("ruta no válida: " + rel); fs.mkdirSync(path.dirname(to), { recursive: true }); const r = await s3.getStream(key); await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(to)); };
console.log(`Restaurando la copia ${pick} en ${dest}…`);
let n = 0; const own = [...keys.keys()].filter(k => k.startsWith(`${PP}copias/${pick}/`));
for (const k of own) { const rel = k.slice(`${PP}copias/${pick}/`.length); if (rel === "lista.json") continue; await save(k, rel); n++; }
const list = JSON.parse(await s3.get(`${PP}copias/${pick}/lista.json`)).files;
for (const rel of list) { await save(PP + "objetos/" + rel, rel); if (++n % 100 === 0) console.log(`  ${n} archivos…`); }
console.log(`Listo: ${n} archivos. Arranca Sotos con SOTOS_DATA=${dest}`);

