// Notas Markdown — app de ejemplo del SDK de Sotos · © 2026 Sebastian Sotomontes · MIT
const $ = (s) => document.querySelector(s);
const texto = $("#texto"), vista = $("#vista");
let actual = null, sucio = false;

/* ---------- Markdown mínimo (títulos, listas, citas, código, negrita, cursiva, enlaces) ---------- */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
function markdown(md) {
  const out = []; let list = null, code = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.replace(/\r/g, "").split("\n")) {
    if (code !== null) { if (/^```/.test(line)) { out.push(`<pre><code>${esc(code)}</code></pre>`); code = null; } else code += (code ? "\n" : "") + line; continue; }
    if (/^```/.test(line)) { close(); code = ""; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)/.exec(line))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = /^\s*[-*]\s+(.*)/.exec(line))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^>\s?(.*)/.exec(line))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) { close(); out.push("<hr>"); }
    else if (!line.trim()) close();
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  if (code !== null) out.push(`<pre><code>${esc(code)}</code></pre>`); close();
  return out.join("\n");
}

/* ---------- estado ---------- */
const estado = (t) => { $("#estado").textContent = t; };
function pintar() {
  vista.innerHTML = markdown(texto.value);
  const palabras = (texto.value.match(/\S+/g) || []).length; $("#cuenta").textContent = `${palabras} palabra${palabras === 1 ? "" : "s"}`;
}
function marcar(s) { sucio = s; $("#sucio").hidden = !s; }
function nombre(n) { $("#nombre").textContent = n; sotos.window.setTitle(n); }

/* ---------- archivos con el SDK ---------- */
async function abrir(f) {
  actual = f; texto.value = await (await sotos.files.read(f)).text(); pintar(); marcar(false); nombre(f.name); estado("Abierto");
}
async function guardarComo() {
  const f = await sotos.files.save({ name: actual ? actual.name : "Nota.md", data: texto.value, type: "text/markdown" });
  if (!f) return; actual = f; marcar(false); nombre(f.name); estado("Guardado"); sotos.notify({ title: "Nota guardada", body: f.name });
}
async function guardar() {
  if (!actual || actual.local) return guardarComo(); // lo que vino del equipo se guarda como archivo nuevo en Sotos
  await sotos.files.write(actual, texto.value); marcar(false); estado("Guardado " + new Date().toLocaleTimeString());
}
$("#abrir").onclick = async () => { const [f] = await sotos.files.pick({ title: "Abrir nota", exts: ["md", "markdown", "txt"] }); if (f) abrir(f); };
$("#guardar").onclick = () => guardar().catch((e) => estado(e.message));
$("#como").onclick = () => guardarComo().catch((e) => estado(e.message));
$("#nuevo").onclick = () => { actual = null; texto.value = ""; pintar(); marcar(false); nombre("Sin título"); };
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); guardar().catch((er) => estado(er.message)); } });

// borrador: se guarda en los datos de la app (sotos.storage), no en el navegador
let t; texto.addEventListener("input", () => { pintar(); marcar(true); clearTimeout(t); t = setTimeout(() => sotos.storage.set("borrador", { texto: texto.value, archivo: actual && actual.name }), 700); });

sotos.on("open", abrir); // «Abrir con Notas Markdown» desde Archivos
sotos.ready.then(async (info) => {
  const b = await sotos.storage.get("borrador").catch(() => null);
  if (b && b.texto && !texto.value && !actual) { texto.value = b.texto; pintar(); estado("Se recuperó tu borrador" + (b.archivo ? " de " + b.archivo : "")); }
  else estado(info.user ? `Hola, ${info.user.name.split(" ")[0]}` : "Lista");
  pintar();
});
