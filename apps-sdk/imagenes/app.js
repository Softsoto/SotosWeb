// Convertidor de imágenes — app del SDK de Sotos · © 2026 Sebastian Sotomontes · MIT
const $ = (s) => document.querySelector(s);
const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const EXT = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };
let fotos = []; // { file, blob, url, nombre, w, h, estado, el }
const estado = (t) => { $("#estado").textContent = t; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function pintar() {
  $("#convertir").disabled = !fotos.length; $("#limpiar").disabled = !fotos.length;
  $("#lista").innerHTML = fotos.length ? "" : `<div class="vacio">Elige fotos de Sotos Drive o de tu equipo. También puedes abrirlas desde Archivos con «Abrir con».</div>`;
  for (const f of fotos) {
    const el = document.createElement("div"); el.className = "foto" + (f.estado === "ok" ? " ok" : f.estado === "mal" ? " mal" : "");
    el.innerHTML = `<img alt="" src="${f.url}"><b title="${esc(f.nombre)}">${esc(f.nombre)}</b><span>${f.w}×${f.h} · ${kb(f.blob.size)}${f.nota ? " · " + esc(f.nota) : ""}</span>`;
    $("#lista").appendChild(el);
  }
}
async function agregar(files) {
  for (const f of files) {
    try { const blob = await sotos.files.read(f); const bmp = await createImageBitmap(blob); fotos.push({ file: f, blob, url: URL.createObjectURL(blob), nombre: f.name, w: bmp.width, h: bmp.height }); bmp.close(); }
    catch (e) { estado(`${f.name}: no es una imagen que se pueda leer`); }
  }
  pintar(); estado(`${fotos.length} foto(s) en la lista`);
}
async function convertir(f, tipo, ancho, calidad) {
  const bmp = await createImageBitmap(f.blob); const esc = ancho && bmp.width > ancho ? ancho / bmp.width : 1;
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
  const g = c.getContext("2d"); if (tipo === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); } // JPG no tiene transparencia
  g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const out = await new Promise(ok => c.toBlob(ok, tipo, calidad / 100)); return { out, w: c.width, h: c.height };
}
$("#elegir").onclick = async () => { const r = await sotos.files.pick({ title: "Elegir fotos", types: ["img"], multiple: true }).catch(e => { estado(e.message); return []; }); if (r.length) agregar(r); };
$("#limpiar").onclick = () => { fotos.forEach(f => URL.revokeObjectURL(f.url)); fotos = []; pintar(); estado("Lista vacía"); };
$("#calidad").oninput = (e) => { $("#calidad-v").textContent = e.target.value + "%"; };
$("#formato").onchange = (e) => { $("#calidad-l").hidden = e.target.value === "image/png"; };
$("#convertir").onclick = async () => {
  const carpeta = await sotos.files.pickFolder({ title: "¿Dónde guardo las fotos convertidas?" }).catch(e => { estado(e.message); return null; }); if (!carpeta) return;
  const tipo = $("#formato").value, ancho = Number($("#ancho").value), calidad = Number($("#calidad").value);
  sotos.storage.set("ajustes", { tipo, ancho, calidad }).catch(() => {});
  $("#convertir").disabled = true; let hechas = 0, antes = 0, despues = 0;
  for (const f of fotos) {
    try {
      estado(`Convirtiendo ${f.nombre}…`); const { out, w, h } = await convertir(f, tipo, ancho, calidad);
      const nombre = f.nombre.replace(/\.[^.]+$/, "") + "." + EXT[tipo];
      await sotos.files.saveIn(carpeta, { name: nombre, data: out, type: tipo });
      antes += f.blob.size; despues += out.size; f.estado = "ok"; f.nota = `→ ${w}×${h} · ${kb(out.size)}`; hechas++;
    } catch (e) { f.estado = "mal"; f.nota = e.message; }
    pintar();
  }
  $("#convertir").disabled = false;
  estado(`${hechas} foto(s) guardadas en «${carpeta.name}» · de ${kb(antes)} a ${kb(despues)}`);
};
sotos.on("open", (f) => agregar([f])); // «Abrir con Convertidor de imágenes» desde Archivos
sotos.ready.then(async () => {
  const a = await sotos.storage.get("ajustes").catch(() => null);
  if (a) { $("#formato").value = a.tipo; $("#ancho").value = String(a.ancho); $("#calidad").value = a.calidad; $("#calidad-v").textContent = a.calidad + "%"; $("#calidad-l").hidden = a.tipo === "image/png"; }
});
