/* ============================================================
   Sotos OS — shared UI + Window manager
   ============================================================ */
import React from "react";
import { TYPE_META } from "./data.jsx";
import { TileGlyph } from "./glyphs.jsx";
const { useState, useRef, useEffect, useCallback } = React;

// App icon tile
function Tile({ icon, color, size = 46, style, app }) {
  return (
    <div className="tile" data-app={app} style={{ width: size, height: size, background: color, fontSize: size, ...style }}>
      <span className="material-symbols-rounded">{icon}</span>
      {app && <TileGlyph app={app} />}
    </div>
  );
}

// Material symbol shorthand
function Ic({ name, size, style, className }) {
  return <span className={"material-symbols-rounded " + (className||"")} style={{ fontSize: size, ...style }}>{name}</span>;
}

/* -------------------- Movimiento de ventanas --------------------
   Tiempos del escritorio: lento 325 ms, normal 217 ms, rápido 108 ms.
   Abrir: de escala .9 / opacidad .05 a 1. Cerrar: a escala .9 / opacidad 0.
   Minimizar: se encoge y se desliza hacia el dock; restaurar hace el camino inverso. */
export const MOTION = { slow: 325, normal: 217, fast: 108, ease: "ease" };
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const winEl = (id) => document.querySelector(`.window[data-win-id="${id}"]`);
// destino del minimizado: el icono de la app en el dock (en el riel lateral, solo en horizontal)
function dockOffset(el, appId) {
  const r = el.getBoundingClientRect();
  const rail = document.documentElement.dataset.skin === "grafito";
  if (rail) return { x: (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--desk-left")) || 0) - r.left, y: 0, s: 0.9 };
  const icon = document.querySelector(`.dock-item[data-app="${appId}"]`)?.getBoundingClientRect();
  if (!icon) return { x: 0, y: 60, s: 0.9 };
  return { x: icon.left + icon.width / 2 - (r.left + r.width / 2), y: icon.top + icon.height / 2 - (r.top + r.height / 2), s: 0.35 };
}
/** anima la salida de una ventana y resuelve al terminar (cerrar) */
export function animateWinOut(id) {
  const el = winEl(id);
  if (!el || reduced() || !el.animate) return Promise.resolve();
  el.style.pointerEvents = "none";
  return el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.9)" }],
    { duration: MOTION.normal, easing: MOTION.ease, fill: "forwards" }).finished.catch(() => {});
}
/** suaviza un cambio de tamaño/posición (maximizar, acomodar a media pantalla) */
export function animateWinGeometry(id) {
  const el = winEl(id); if (!el || reduced()) return;
  el.classList.add("win-geo"); clearTimeout(el._geoT);
  el._geoT = setTimeout(() => el.classList.remove("win-geo"), MOTION.slow);
}

/* -------------------- Window -------------------- */
function Win({ win, app, focused, onFocus, onClose, onMin, onMax, onMove, onResize, children }) {
  const ref = useRef(null);
  const drag = useRef(null);
  // oculto de verdad solo cuando termina la animación de minimizar
  const [hidden, setHidden] = useState(win.minimized);
  const first = useRef(true), off = useRef(null), minRef = useRef(win.minimized), outAnim = useRef(null);
  minRef.current = win.minimized;
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const anim = !reduced() && el.animate;
    if (first.current) {
      first.current = false;
      if (!win.minimized && anim) el.animate([{ opacity: 0.05, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { duration: MOTION.normal, easing: MOTION.ease });
      return;
    }
    if (win.minimized) {
      if (!anim) return setHidden(true);
      const o = off.current = dockOffset(el, app.id);
      const a = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translate(${o.x}px, ${o.y}px) scale(${o.s})` }],
        { duration: MOTION.normal, easing: MOTION.ease, fill: "forwards" });
      outAnim.current = a;
      a.finished.then(() => { outAnim.current = null; if (minRef.current) setHidden(true); a.cancel(); }).catch(() => {});
    } else if (outAnim.current) {
      // restaurado a mitad del minimizado: invertir en el sitio
      const a = outAnim.current; outAnim.current = null; off.current = null; a.reverse();
      a.finished.then(() => a.cancel()).catch(() => {});
    } else if (hidden) {
      setHidden(false);
    }
  }, [win.minimized]);
  // restaurar: vuelve desde el dock (se ejecuta cuando ya es visible otra vez)
  React.useLayoutEffect(() => {
    if (hidden || first.current || !off.current) return;
    const el = ref.current, o = off.current; off.current = null;
    if (el && el.animate && !reduced()) el.animate([{ opacity: 0, transform: `translate(${o.x}px, ${o.y}px) scale(${o.s})` }, { opacity: 1, transform: "none" }], { duration: MOTION.normal, easing: MOTION.ease });
  }, [hidden]);
  // maximizar / restaurar tamaño con transición
  const wasMax = useRef(win.maximized);
  React.useLayoutEffect(() => { if (wasMax.current !== win.maximized) { wasMax.current = win.maximized; animateWinGeometry(win.id); } }, [win.maximized]);

  const startDrag = (e) => {
    if (win.maximized) return;
    if (e.target.closest(".win-ctrls") || e.button !== 0) return;
    onFocus();
    drag.current = { type: "move", sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y };
    ref.current.classList.add("dragging");
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  };
  const startResize = (e) => {
    e.stopPropagation();
    onFocus();
    drag.current = { type: "resize", sx: e.clientX, sy: e.clientY, ow: win.w, oh: win.h };
    ref.current.classList.add("resizing");
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  };
  const onDrag = useCallback((e) => {
    const d = drag.current; if (!d) return;
    if (d.type === "move") {
      const nx = d.ox + (e.clientX - d.sx);
      const ny = Math.max(30, d.oy + (e.clientY - d.sy));
      onMove(nx, ny);
    } else {
      const nw = Math.max(360, d.ow + (e.clientX - d.sx));
      const nh = Math.max(260, d.oh + (e.clientY - d.sy));
      onResize(nw, nh);
    }
  }, [onMove, onResize]);
  const endDrag = useCallback(() => {
    drag.current = null;
    if (ref.current) ref.current.classList.remove("dragging", "resizing");
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  }, [onDrag]);

  const style = win.maximized
    ? { left: "var(--desk-left, 0px)", top: 30, width: "calc(100% - var(--desk-left, 0px))", height: "calc(100% - 30px)", zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <div
      ref={ref}
      data-win-id={win.id}
      className={"window" + (win.maximized ? " maximized" : "") + (hidden ? " minimized" : "") + (focused ? " focused" : "")}
      style={{ ...style, "--app-color": app.color }}
      onMouseDown={onFocus}
    >
      <div className="titlebar" onMouseDown={startDrag} onDoubleClick={e => !e.target.closest(".win-ctrls") && onMax()}>
        <span className="win-app"><Ic name={app.icon} size={16} /></span>
        <div className="title">{win.title || app.name}</div>
        <div className="win-ctrls">
          <button onClick={onMin} title="Minimizar"><Ic name="minimize" size={18} /></button>
          <button onClick={onMax} title={win.maximized ? "Restaurar" : "Maximizar"}><Ic name={win.maximized ? "filter_none" : "crop_square"} size={16} /></button>
          <button className="close" onClick={onClose} title="Cerrar"><Ic name="close" size={18} /></button>
        </div>
      </div>
      <div className="win-body">{children}</div>
      {!win.maximized && <div className="resize-handle" onMouseDown={startResize} />}
    </div>
  );
}

/* -------------------- Small reusable pieces -------------------- */
function SideItem({ icon, label, active, onClick, color }) {
  return (
    <div className={"side-item" + (active ? " active" : "")} onClick={onClick}>
      <Ic name={icon} style={color && !active ? { color } : undefined} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function Toolbar({ children }) {
  return <div className="app-toolbar">{children}</div>;
}

function EmptyState({ icon, text }) {
  return <div className="empty-state"><div><Ic name={icon} /><div style={{ marginTop: 8, fontWeight: 500 }}>{text}</div></div></div>;
}

/* -------------------- File glyph (realistic icons) -------------------- */
function FileGlyph({ type, css, src, size = 46 }) {
  const m = TYPE_META[type] || TYPE_META.txt;
  if (m.kind === "folder")
    return <Ic name="folder" style={{ fontSize: size * 1.08, color: `var(--folder-color, ${m.color})`, fontVariationSettings: "'FILL' 1" }} />;
  if (m.kind === "icon")
    return <Ic name={m.icon} style={{ fontSize: size, color: m.color }} />;
  if (m.kind === "img")
    return src
      ? <img className="img-glyph" src={src} alt="" style={{ width: size * 1.15, height: size * 0.82, objectFit: "cover" }} />
      : <div className="img-glyph" style={{ width: size * 1.15, height: size * 0.82, background: css || "linear-gradient(160deg,#cdd6e0,#6b7d93)" }} />;
  // office / pdf -> page with badge
  return (
    <div className="doc-glyph" style={{ width: size * 0.82, height: size }}>
      <div className="doc-badge" style={{ background: m.color, fontSize: m.letter.length > 1 ? size * 0.2 : size * 0.3 }}>{m.letter}</div>
    </div>
  );
}

/* -------------------- Context menu -------------------- */
function ContextMenu({ x, y, items, onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (!ref.current || !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => e.key === "Escape" && onClose();
    setTimeout(() => { document.addEventListener("mousedown", close); document.addEventListener("contextmenu", close); }, 0);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("contextmenu", close); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  // keep on screen
  const px = Math.min(x, window.innerWidth - 220);
  const py = Math.min(y, window.innerHeight - items.length * 30 - 20);
  return (
    <div ref={ref} className="ctx-menu" style={{ left: px, top: py }} onContextMenu={e => e.preventDefault()}>
      {items.map((it, i) => it.sep
        ? <div key={i} className="ctx-sep" />
        : <button key={it.id} className={"ctx-item" + (it.danger ? " danger" : "")}
            onMouseDown={e => e.preventDefault() /* no robar el foco: conserva la selección del texto */}
            onClick={() => { onSelect(it.id); onClose(); }}>
            <Ic name={it.icon} size={18} /><span>{it.label}</span>
          </button>)}
    </div>
  );
}

/* -------------------- Avatar -------------------- */
function Avatar({ profile, size = 40 }) {
  if (profile && profile.avatar)
    return <img src={profile.avatar} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  const initials = (profile && profile.name ? profile.name : "Invitado").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--accent)", color: "var(--accent-ink)",
    display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.4 }}>{initials}</div>;
}

/* -------------------- Avisos (toasts) globales -------------------- */
const toastSubs = new Set();
let toastSeq = 0;
function toast(msg, opts = {}) {
  const t = { id: ++toastSeq, msg, icon: opts.icon || (opts.error ? "error" : "check_circle"), error: !!opts.error, action: opts.action };
  toastSubs.forEach(f => f(t));
  return t.id;
}
function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const add = (t) => { setList(l => [...l.slice(-3), t]); setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), t.error ? 6000 : 3200); };
    toastSubs.add(add); return () => toastSubs.delete(add);
  }, []);
  return (
    <div className="toasts">
      {list.map(t => (
        <div key={t.id} className={"toast" + (t.error ? " error" : "")}>
          <Ic name={t.icon} size={18} /><span>{t.msg}</span>
          {t.action && <button onClick={() => { t.action.run(); setList(l => l.filter(x => x.id !== t.id)); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

/* -------------------- Modal simple -------------------- */
function Modal({ title, icon, onClose, children, actions, width = 380 }) {
  useEffect(() => { const esc = e => e.key === "Escape" && onClose(); document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [onClose]);
  return (
    <div className="share-modal" onMouseDown={onClose}>
      <div className="share-card" style={{ width, textAlign: "left", alignItems: "stretch" }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {icon && <Ic name={icon} size={26} style={{ color: "var(--accent)" }} />}
          <div style={{ fontSize: 16.5, fontWeight: 800 }}>{title}</div>
        </div>
        {children}
        {actions && <div className="wl-btns" style={{ justifyContent: "flex-end", marginTop: 16 }}>{actions}</div>}
      </div>
    </div>
  );
}

export { Tile, Ic, Win, SideItem, Toolbar, EmptyState, FileGlyph, ContextMenu, Avatar, toast, Toasts, Modal };
