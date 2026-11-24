/* ============================================================
   Sotos OS — menú contextual global
   © 2026 Sebastian Sotomontes

   Cualquier clic derecho dentro de Sotos que una app no haya atendido
   (Escritorio, Archivos y Dock tienen menús propios) muestra un menú
   según lo que hay debajo: campo de texto, selección, enlace, imagen,
   barra de título o ventana. Las páginas abiertas en el Navegador envían
   su clic derecho por postMessage y usan el mismo menú (showMenu).
   Mayús + clic derecho deja el menú nativo del navegador.
   ============================================================ */
import React from "react";
import { ContextMenu, toast, copyText } from "./ui.jsx";
import * as vfs from "./vfs.js";
const { useState, useEffect } = React;

/** abre el menú global en (x, y) con items { id?, label, icon, run, danger } | { sep: true } */
export function showMenu(x, y, items) { window.dispatchEvent(new CustomEvent("sotos-menu", { detail: { x, y, items } })); }

const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=button]):not([type=submit]), textarea, [contenteditable="true"], [contenteditable=""]';
const search = (q) => "https://duckduckgo.com/?q=" + encodeURIComponent(q);
const short = (s, n = 26) => s.length > n ? s.slice(0, n - 1) + "…" : s;

export async function saveImageFromUrl(src, name) {
  const folder = vfs.resolve("/Imágenes") || vfs.getState().root;
  const r = await fetch(src); if (!r.ok) throw new Error("No se pudo descargar la imagen");
  const blob = await r.blob();
  const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  const base = (name || decodeURIComponent((src.split("?")[0].split("/").pop() || "imagen")) || "imagen").replace(/\.[^.]+$/, "").slice(0, 60) || "imagen";
  await vfs.create(folder.id, `${base}.${ext}`, blob);
  toast(`Imagen guardada en ${folder.name}`, { icon: "add_photo_alternate" });
}
async function copyImage(src) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0);
  const png = await new Promise(r => c.toBlob(r, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  toast("Imagen copiada", { icon: "content_copy" });
}
const clip = (text, msg = "Copiado") => copyText(text).then(() => toast(msg, { icon: "content_copy" })).catch(() => toast("Permite el acceso al portapapeles", { error: true }));

function buildItems(target, { openApp, winAction }) {
  const groups = [];
  const sel = String(window.getSelection() || "").trim();
  const ed = target.closest(EDITABLE);
  const link = target.closest("a[href]");
  const img = target.closest("img");
  const winEl = target.closest(".window");
  const onTitle = target.closest(".titlebar");

  if (ed) {
    const isInput = ed.matches("input,textarea");
    const hasSel = isInput ? ed.selectionStart !== ed.selectionEnd : !!sel;
    groups.push([
      { label: "Deshacer", icon: "undo", run: () => document.execCommand("undo") },
      { label: "Rehacer", icon: "redo", run: () => document.execCommand("redo") },
    ], [
      ...(hasSel ? [{ label: "Cortar", icon: "content_cut", run: () => document.execCommand("cut") }, { label: "Copiar", icon: "content_copy", run: () => document.execCommand("copy") }] : []),
      { label: "Pegar", icon: "content_paste", run: async () => { try { const t = await navigator.clipboard.readText(); ed.focus(); document.execCommand("insertText", false, t); } catch { toast("Permite el acceso al portapapeles para pegar", { error: true }); } } },
      ...(hasSel ? [{ label: "Eliminar", icon: "backspace", run: () => document.execCommand("delete") }] : []),
      { label: "Seleccionar todo", icon: "select_all", run: () => { ed.focus(); isInput ? ed.select() : document.execCommand("selectAll"); } },
    ]);
    if (hasSel && sel) groups.push([{ label: `Buscar «${short(sel)}» en la web`, icon: "travel_explore", run: () => openApp("browser", { url: search(sel), scName: "Búsqueda" }) }]);
  } else if (sel) {
    groups.push([
      { label: "Copiar", icon: "content_copy", run: () => clip(sel) },
      { label: `Buscar «${short(sel)}» en la web`, icon: "travel_explore", run: () => openApp("browser", { url: search(sel), scName: "Búsqueda" }) },
    ]);
  }
  if (link && /^https?:/i.test(link.href)) {
    groups.push([
      { label: "Abrir en el Navegador de Sotos", icon: "language", run: () => openApp("browser", { url: link.href }) },
      { label: "Abrir en una pestaña nueva", icon: "open_in_new", run: () => window.open(link.href, "_blank", "noopener") },
      { label: "Copiar dirección del enlace", icon: "link", run: () => clip(link.href, "Enlace copiado") },
    ]);
  }
  if (img && img.src) {
    groups.push([
      { label: "Guardar imagen en Imágenes", icon: "add_photo_alternate", run: () => saveImageFromUrl(img.src, img.alt).catch(e => toast(e.message, { error: true })) },
      { label: "Copiar imagen", icon: "image", run: () => copyImage(img.src).catch(() => toast("No se pudo copiar la imagen", { error: true })) },
    ]);
  }
  if (winEl) {
    const id = winEl.dataset.winId, max = winEl.classList.contains("maximized");
    const w = [
      { label: "Minimizar", icon: "minimize", run: () => winAction(id, "min") },
      { label: max ? "Restaurar tamaño" : "Maximizar", icon: max ? "filter_none" : "crop_square", run: () => winAction(id, "max") },
      { label: "Ajustar a la izquierda", icon: "splitscreen_left", run: () => winAction(id, "left") },
      { label: "Ajustar a la derecha", icon: "splitscreen_right", run: () => winAction(id, "right") },
      { label: "Cerrar ventana", icon: "close", danger: true, run: () => winAction(id, "close") },
    ];
    if (onTitle || !groups.length) groups.push(w); else groups.push(w.filter(x => x.icon === "close" || x.icon === "crop_square" || x.icon === "filter_none"));
  }
  if (!groups.length) {
    groups.push([
      { label: "Buscar en Sotos…", icon: "search", run: () => window.dispatchEvent(new CustomEvent("sotos-spotlight")) },
      { label: "Cambiar fondo…", icon: "wallpaper", run: () => openApp("settings") },
      { label: "Ajustes", icon: "settings", run: () => openApp("settings") },
    ]);
  }
  return groups.flatMap((g, i) => i ? [{ sep: true }, ...g] : g);
}

export function GlobalContextMenu({ openApp, winAction }) {
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    const onCtx = (e) => {
      // las apps con menú propio ya llamaron a preventDefault; Mayús deja el menú nativo
      if (e.defaultPrevented || e.shiftKey || !e.target.closest || !e.target.closest("#os")) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, items: buildItems(e.target, { openApp, winAction }) });
    };
    const onShow = (e) => setMenu(e.detail);
    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("sotos-menu", onShow);
    return () => { document.removeEventListener("contextmenu", onCtx); window.removeEventListener("sotos-menu", onShow); };
  }, [openApp, winAction]);
  if (!menu) return null;
  const items = menu.items.map((it, i) => it.sep ? it : { ...it, id: "m" + i });
  return <ContextMenu x={menu.x} y={menu.y} items={items}
    onSelect={(id) => { const it = items.find(x => x.id === id); try { const r = it?.run(); if (r?.catch) r.catch(err => toast(err.message, { error: true })); } catch (err) { toast(err.message, { error: true }); } }}
    onClose={() => setMenu(null)} />;
}
