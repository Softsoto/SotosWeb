// Lector de libros (EPUB) — app del SDK de Sotos · © 2026 Sebastian Sotomontes · MIT
const $ = (s) => document.querySelector(s);
let libro = null, actual = 0, letra = 18, guardarT = null;
const estado = (t) => { $("#estado").textContent = t; };
const dir = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "";
const unir = (base, rel) => { const partes = (base + rel).split("/"), out = []; for (const x of partes) { if (x === "..") out.pop(); else if (x !== ".") out.push(x); } return decodeURIComponent(out.join("/")); };
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };

async function abrir(f) {
  try {
    estado("Abriendo " + f.name + "…");
    const zip = await leerZip(await sotos.files.read(f));
    const cont = new DOMParser().parseFromString(await zip.texto("META-INF/container.xml"), "application/xml");
    const opfRuta = cont.querySelector("rootfile")?.getAttribute("full-path"); if (!opfRuta) throw new Error("El EPUB no tiene índice (content.opf)");
    const opf = new DOMParser().parseFromString(await zip.texto(opfRuta), "application/xml"), base = dir(opfRuta);
    const items = {}; opf.querySelectorAll("manifest > item").forEach(i => items[i.getAttribute("id")] = { href: unir(base, i.getAttribute("href")), tipo: i.getAttribute("media-type") });
    const lomo = [...opf.querySelectorAll("spine > itemref")].map(r => items[r.getAttribute("idref")]).filter(i => i && /html/.test(i.tipo));
    if (!lomo.length) throw new Error("El libro no tiene capítulos legibles");
    const titulo = opf.querySelector("metadata > *|title, title")?.textContent?.trim() || f.name.replace(/\.epub$/i, "");
    const autor = opf.querySelector("metadata > *|creator, creator")?.textContent?.trim() || "";
    if (libro) libro.urls.forEach(u => URL.revokeObjectURL(u));
    libro = { clave: "pos:" + f.name, titulo, autor, zip, lomo, urls: [] };
    const nombres = await Promise.all(lomo.map(async (c, i) => { const t = await zip.texto(c.href); const m = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(t || ""); return (m ? m[1].replace(/<[^>]+>/g, "").trim() : "") || `Capítulo ${i + 1}`; }));
    $("#capitulos").innerHTML = nombres.map((n, i) => `<option value="${i}">${n.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).slice(0, 80)}</option>`).join(""); $("#capitulos").disabled = false;
    sotos.window.setTitle(titulo);
    const pos = await sotos.storage.get(libro.clave).catch(() => null);
    $("#portada").hidden = true; $("#texto").hidden = false;
    await mostrar(pos?.cap || 0, pos?.y || 0);
  } catch (e) { estado("No se pudo abrir: " + e.message); }
}
async function mostrar(i, y = 0) {
  actual = Math.max(0, Math.min(libro.lomo.length - 1, i)); const cap = libro.lomo[actual];
  const html = await libro.zip.texto(cap.href);
  let doc = new DOMParser().parseFromString(html, "application/xhtml+xml"); if (doc.querySelector("parsererror")) doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, link, style, form, meta, base").forEach(n => n.remove()); // sin código ni estilos ajenos
  doc.querySelectorAll("*").forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }));
  for (const img of doc.querySelectorAll("img[src], image")) { // imágenes del libro desde el propio .zip
    const attr = img.hasAttribute("src") ? "src" : (img.hasAttribute("href") ? "href" : "xlink:href"); const ruta = unir(dir(cap.href), img.getAttribute(attr) || "");
    const datos = await libro.zip.datos(ruta).catch(() => null); if (!datos) { img.removeAttribute(attr); continue; }
    const url = URL.createObjectURL(new Blob([datos], { type: MIME[ruta.split(".").pop().toLowerCase()] || "image/*" })); libro.urls.push(url); img.setAttribute(attr, url);
  }
  const art = $("#texto"); art.replaceChildren(...[...(doc.body || doc.documentElement).childNodes].map(n => document.importNode(n, true)));
  art.querySelectorAll("a[href]").forEach(a => { const h = a.getAttribute("href"); if (/^https?:/i.test(h)) { a.target = "_blank"; a.rel = "noopener noreferrer"; return; }
    a.onclick = (e) => { e.preventDefault(); const destino = unir(dir(cap.href), h.split("#")[0]); const j = libro.lomo.findIndex(c => c.href === destino); if (j >= 0) mostrar(j); }; });
  $("#capitulos").value = String(actual); $("#anterior").disabled = actual === 0; $("#siguiente").disabled = actual === libro.lomo.length - 1;
  estado(`${libro.titulo}${libro.autor ? " · " + libro.autor : ""} · capítulo ${actual + 1} de ${libro.lomo.length}`);
  const hoja = $("#hoja"); requestAnimationFrame(() => { hoja.scrollTop = y * (hoja.scrollHeight - hoja.clientHeight); });
  recordar();
}
function recordar() { if (!libro) return; clearTimeout(guardarT); guardarT = setTimeout(() => { const h = $("#hoja"); sotos.storage.set(libro.clave, { cap: actual, y: h.scrollHeight > h.clientHeight ? h.scrollTop / (h.scrollHeight - h.clientHeight) : 0 }).catch(() => {}); }, 800); }
const ponerLetra = (n) => { letra = Math.max(13, Math.min(30, n)); document.documentElement.style.setProperty("--letra", letra + "px"); sotos.storage.set("letra", letra).catch(() => {}); };
$("#abrir").onclick = async () => { const [f] = await sotos.files.pick({ title: "Abrir libro", exts: ["epub"] }).catch(() => []); if (f) abrir(f); };
$("#capitulos").onchange = (e) => mostrar(Number(e.target.value));
$("#anterior").onclick = () => mostrar(actual - 1); $("#siguiente").onclick = () => mostrar(actual + 1);
$("#menos").onclick = () => ponerLetra(letra - 1); $("#mas").onclick = () => ponerLetra(letra + 1);
$("#hoja").addEventListener("scroll", recordar);
document.addEventListener("keydown", (e) => { if (!libro || e.target.closest("select,input")) return; if (e.key === "ArrowRight") mostrar(actual + 1); if (e.key === "ArrowLeft") mostrar(actual - 1); });
sotos.on("open", abrir);
sotos.ready.then(async () => { const l = await sotos.storage.get("letra").catch(() => null); if (l) ponerLetra(l); });
