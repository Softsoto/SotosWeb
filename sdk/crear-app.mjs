#!/usr/bin/env node
// Sotos SDK — crea el esqueleto de una app nueva
//   node sdk/crear-app.mjs <id> ["Nombre de la app"]
// Crea la carpeta <id>/ con sotos-app.json, index.html, estilo.css y app.js listos para editar.
// © 2026 Sebastian Sotomontes · MIT
import fs from "node:fs"; import path from "node:path";
import { ID, PERMISSIONS } from "./manifest.mjs";
const [id, name = "Mi app"] = process.argv.slice(2);
if (!id || !ID.test(id)) { console.error("Uso: node sdk/crear-app.mjs <id> [\"Nombre\"]\n  El id: 2-30 letras minúsculas, números o guiones (ej. «lista-compras»)."); process.exit(2); }
const dir = path.resolve(id); if (fs.existsSync(dir)) { console.error(`Ya existe ${dir}`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const w = (f, t) => fs.writeFileSync(path.join(dir, f), t.replace(/^\n/, ""));
w("sotos-app.json", JSON.stringify({ id, name, version: "1.0.0", description: "Describe en una frase lo que hace tu app.", author: "Tu nombre", icon: "extension", color: "#5a5689", category: "Herramientas", entry: "index.html", width: 900, height: 620, permissions: ["files.read", "files.write", "storage", "notify"], opens: ["txt"] }, null, 2) + "\n");
w("index.html", `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
  <link rel="stylesheet" href="estilo.css">
  <script src="/sdk/sotos-sdk.js"></script>
</head>
<body>
  <header><h1>${name}</h1><div class="acciones"><button id="abrir">Abrir</button><button id="guardar">Guardar como…</button></div></header>
  <textarea id="texto" placeholder="Escribe aquí o abre un archivo…"></textarea>
  <footer id="estado">Lista</footer>
  <script src="app.js"></script>
</body>
</html>
`);
w("estilo.css", `
:root { --fondo: #f6f1e7; --texto: #2b2622; --borde: #d9cfbf; --acento: var(--sotos-accent, #c4532f); }
:root[data-sotos-theme="dark"] { --fondo: #1f1c19; --texto: #ece6dc; --borde: #3a342e; }
* { box-sizing: border-box; }
body { margin: 0; height: 100vh; display: flex; flex-direction: column; background: var(--fondo); color: var(--texto); font: 14px system-ui, sans-serif; }
header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--borde); }
h1 { font-size: 16px; margin: 0; flex: 1; }
button { font: inherit; padding: 6px 12px; border: 1px solid var(--borde); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
button:hover { border-color: var(--acento); }
textarea { flex: 1; margin: 0; padding: 14px; border: 0; resize: none; background: transparent; color: inherit; font: 15px/1.6 ui-monospace, monospace; outline: none; }
footer { padding: 6px 14px; border-top: 1px solid var(--borde); font-size: 12px; opacity: .7; }
`);
w("app.js", `
// ${name} — hecha con el SDK de Sotos (sdk/README.md)
const $ = (s) => document.querySelector(s);
let actual = null; // archivo abierto (lo que devuelve sotos.files.pick / save)
const estado = (t) => { $("#estado").textContent = t; };

async function abrir(f) {
  actual = f; $("#texto").value = await (await sotos.files.read(f)).text();
  sotos.window.setTitle(f.name); estado("Abierto: " + f.name);
}
$("#abrir").onclick = async () => { const [f] = await sotos.files.pick({ exts: ["txt", "md"] }); if (f) abrir(f); };
$("#guardar").onclick = async () => {
  const f = await sotos.files.save({ name: actual ? actual.name : "nota.txt", data: $("#texto").value });
  if (f) { actual = f; sotos.window.setTitle(f.name); estado("Guardado: " + f.name); sotos.notify({ title: "Guardado", body: f.name }); }
};
// guardado automático del borrador en los datos de la app
let t; $("#texto").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => sotos.storage.set("borrador", $("#texto").value), 600); });

sotos.on("open", abrir); // «Abrir con» desde Archivos
sotos.ready.then(async (info) => {
  const b = await sotos.storage.get("borrador"); if (b && !$("#texto").value) $("#texto").value = b;
  estado("Lista · " + info.app.name + " " + info.app.version);
});
`);
console.log(`App creada en ${dir}\n  1. Edita sotos-app.json (nombre, ícono, permisos: ${Object.keys(PERMISSIONS).join(", ")})\n  2. Empaquétala:  node sdk/empaquetar-app.mjs ${id}\n  3. Instálala en Administración → Apps`);
