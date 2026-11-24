/* ============================================================
   Sotos — barra de tareas, menú Inicio y pantalla de mosaicos de los temas de época
   (Prado, Cristal, Vidrio y Mosaico). El tema Aluminio usa la barra de menú y el dock.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { APPS, APP_BY_ID, appAllowed } from "./data.jsx";
import { BrandMark } from "./logo.jsx";
import { Tile, Ic, Avatar } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { NodeGlyph, useObjectUrl } from "./files-ui.jsx";
import { tz as regionTz } from "./region.js";
import { eraOf } from "./epocas.js";
import { playEra } from "./sonidos.js";
import { isInstalled } from "./installed.js";
const { useState, useEffect, useRef, useMemo } = React;

const PLACES = [["Documentos", "description"], ["Imágenes", "image"], ["Música", "music_note"], ["Vídeos", "movie"], ["Descargas", "download"]];
const topFolder = (name) => (vfs.getState().root?.children || []).find(c => c.type === "folder" && c.name === name);
const visibleApps = () => APPS.filter(a => !a.hidden && a.id !== "launchpad" && (!a.store || isInstalled(a.id)) && appAllowed(a.id, vfs.getState().user));
function useNow(ms = 1000) { const [n, setN] = useState(new Date()); useEffect(() => { const t = setInterval(() => setN(new Date()), ms); return () => clearInterval(t); }, [ms]); return n; }
const fmtTime = (d, h24) => d.toLocaleTimeString("es-ES", { timeZone: regionTz(), hour: "2-digit", minute: "2-digit", hour12: !h24 });
const fmtDay = (d) => d.toLocaleDateString("es-ES", { timeZone: regionTz(), day: "2-digit", month: "2-digit", year: "numeric" });

/* ---------------- barra de tareas ---------------- */
export function Taskbar({ skin, wins, topId, order, running, badges, profile, settings, startOpen, onStart, onApp, onWin, onLogout, onSearch, tray }) {
  const era = eraOf(skin); const now = useNow(); const grouped = era?.group;
  // botones: Vidrio y Mosaico agrupan por app (fijadas + abiertas); Prado y Cristal muestran una tarea por ventana
  const pinned = order.filter(id => id !== "__div__" && id !== "launchpad" && !id.startsWith("f:") && APP_BY_ID[id] && appAllowed(id, vfs.getState().user));
  const live = wins.filter(w => APP_BY_ID[w.appId]);
  const appClick = (id) => { const ws = live.filter(w => w.appId === id); if (!ws.length) return onApp(id); const top = ws.find(w => w.id === topId); onWin(top && !top.minimized ? "min" : "focus", (top || ws[ws.length - 1]).id); };
  const winClick = (w) => onWin(w.id === topId && !w.minimized ? "min" : "focus", w.id);
  return (
    <div className={"taskbar era-" + skin} role="toolbar" aria-label="Barra de tareas">
      <button className={"tb-start" + (startOpen ? " on" : "")} onClick={onStart} aria-label="Inicio" title="Inicio">
        <span className="tb-start-mark"><BrandMark size={skin === "prado" ? 18 : 22} /></span>{skin === "prado" && <span className="tb-start-text">Inicio</span>}
      </button>
      {grouped ? (
        <div className="tb-apps">
          {[...pinned, ...[...new Set(live.map(w => w.appId))].filter(id => !pinned.includes(id))].map(id => { const app = APP_BY_ID[id]; const ws = live.filter(w => w.appId === id);
            return <button key={id} className={"tb-app" + (ws.length ? " running" : "") + (ws.some(w => w.id === topId && !w.minimized) ? " active" : "")} onClick={() => appClick(id)} title={app.name} aria-label={app.name + (ws.length ? `, ${ws.length} ventana(s)` : "")}>
              <Tile icon={app.icon} color={app.color} app={id} size={28} />{ws.length > 1 && <span className="tb-stack" aria-hidden="true" />}
              {badges?.[id] > 0 && <span className="tb-badge">{badges[id] > 99 ? "99+" : badges[id]}</span>}</button>; })}
        </div>
      ) : (<>
        <div className="tb-quick" aria-label="Inicio rápido">
          {pinned.slice(0, 6).map(id => { const app = APP_BY_ID[id]; return <button key={id} className="tb-q" onClick={() => onApp(id)} title={app.name} aria-label={app.name}><Tile icon={app.icon} color={app.color} app={id} size={20} /></button>; })}
        </div>
        <div className="tb-tasks">
          {live.map(w => { const app = APP_BY_ID[w.appId];
            return <button key={w.id} className={"tb-task" + (w.id === topId && !w.minimized ? " active" : "")} onClick={() => winClick(w)} title={w.title || app.name}>
              <Tile icon={app.icon} color={app.color} app={app.id} size={18} /><span>{w.title || app.name}</span></button>; })}
        </div>
      </>)}
      <div className="tb-tray">
        {tray}
        <button className="tb-clock" onClick={onSearch} title={now.toLocaleDateString("es-ES", { dateStyle: "full", timeZone: regionTz() })}>
          <span>{fmtTime(now, settings.clock24)}</span>{skin !== "prado" && <span className="tb-clock-day">{fmtDay(now)}</span>}
        </button>
        {(skin === "cristal" || skin === "vidrio" || skin === "mosaico") && <button className="tb-showdesk" onClick={() => onWin("desktop")} title="Mostrar el escritorio" aria-label="Mostrar el escritorio" />}
      </div>
    </div>
  );
}

/* ---------------- menú Inicio (Prado, Cristal, Vidrio) ---------------- */
export function StartMenu({ skin, profile, order, onApp, onOpenFolder, onLogout, onClose, onSearchAll, onAccount }) {
  const [q, setQ] = useState(""), [all, setAll] = useState(false); const ref = useRef(null), input = useRef(null);
  useEffect(() => {
    const out = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest(".tb-start")) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => document.addEventListener("mousedown", out), 0); document.addEventListener("keydown", key);
    if (skin !== "prado") setTimeout(() => input.current?.focus(), 30);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, []);
  const apps = useMemo(visibleApps, []);
  const pinned = order.filter(id => APP_BY_ID[id] && apps.some(a => a.id === id)).slice(0, 9);
  const go = (id) => { playEra(skin, "abrir"); onApp(id); onClose(); };
  const ql = q.trim().toLowerCase();
  const hits = ql ? { apps: apps.filter(a => a.name.toLowerCase().includes(ql)).slice(0, 8), files: vfs.search(ql, 8) } : null;
  const user = vfs.getState().user;
  const right = [...PLACES.map(([n, ic]) => ({ label: n, icon: ic, act: () => { const f = topFolder(n); f ? onOpenFolder(f.id) : onApp("files"); } })),
    { sep: true }, { label: "Panel de control", icon: "tune", act: () => onApp("control") }, ...(user?.role === "admin" ? [{ label: "Administración", icon: "admin_panel_settings", act: () => onApp("admin") }] : []),
    { label: "Tienda", icon: "shopping_bag", act: () => onApp("store") }, { label: "Buscar", icon: "search", act: onSearchAll }];
  return (
    <div ref={ref} className={"startmenu era-" + skin} role="dialog" aria-label="Menú Inicio">
      {skin === "prado" && <div className="sm-head"><button className="sm-acct acct-trigger" onClick={onAccount} title="Tu cuenta"><Avatar profile={profile} size={42} /></button><b>{profile?.name || "Invitado"}</b></div>}
      <div className="sm-body">
        <div className="sm-left">
          {hits ? (<>
            <div className="sm-group">Apps</div>
            {hits.apps.map(a => <button key={a.id} className="sm-item" onClick={() => go(a.id)}><Tile icon={a.icon} color={a.color} app={a.id} size={30} /><span>{a.name}</span></button>)}
            {!!hits.files.length && <div className="sm-group">Archivos</div>}
            {hits.files.map(n => <button key={n.id} className="sm-item" onClick={() => { n.type === "folder" ? onOpenFolder(n.id) : window.dispatchEvent(new CustomEvent("sotos-open-item", { detail: n })); onClose(); }}><span className="sm-glyph"><NodeGlyph node={n} size={22} /></span><span>{n.name}</span></button>)}
            {!hits.apps.length && !hits.files.length && <div className="sm-empty">Nada coincide con «{q}»</div>}
          </>) : all ? (<>
            <button className="sm-back" onClick={() => setAll(false)}><Ic name="chevron_left" size={18} /> Atrás</button>
            <div className="sm-all">{apps.slice().sort((a, b) => a.name.localeCompare(b.name, "es")).map(a => <button key={a.id} className="sm-item small" onClick={() => go(a.id)}><Tile icon={a.icon} color={a.color} app={a.id} size={20} /><span>{a.name}</span></button>)}</div>
          </>) : (<>
            {pinned.map(id => { const a = APP_BY_ID[id]; return <button key={id} className="sm-item" onClick={() => go(id)}><Tile icon={a.icon} color={a.color} app={id} size={30} /><span>{a.name}</span></button>; })}
            <div className="sm-sep" />
            <button className="sm-allbtn" onClick={() => setAll(true)}>Todos los programas <Ic name="chevron_right" size={18} /></button>
          </>)}
          {skin !== "prado" && <input ref={input} className="sm-search" placeholder="Buscar programas y archivos" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && hits?.apps[0]) go(hits.apps[0].id); }} aria-label="Buscar programas y archivos" />}
        </div>
        <div className="sm-right">
          {skin !== "prado" && <div className="sm-user"><button className="sm-acct acct-trigger" onClick={onAccount} title="Tu cuenta"><Avatar profile={profile} size={46} /></button><b>{profile?.name || "Invitado"}</b></div>}
          {right.map((it, i) => it.sep ? <div key={i} className="sm-sep" /> : <button key={it.label} className="sm-place" onClick={() => { it.act(); onClose(); }}><Ic name={it.icon} size={18} /><span>{it.label}</span></button>)}
        </div>
      </div>
      <div className="sm-foot">
        {skin === "prado" && <input className="sm-search" placeholder="Buscar" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar programas y archivos" />}
        <button className="sm-power" onClick={() => { onClose(); onLogout(); }}><Ic name="logout" size={18} /> Cerrar sesión</button>
      </div>
    </div>
  );
}

/* ---------------- pantalla de mosaicos (Mosaico) ---------------- */
function LiveClock() { const n = useNow(); return <div className="tile-live clock"><b>{fmtTime(n, true)}</b><span>{n.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: regionTz() })}</span></div>; }
function LiveCalendar() { const n = useNow(60000); return <div className="tile-live cal"><b>{n.getDate()}</b><span>{n.toLocaleDateString("es-ES", { weekday: "long", timeZone: regionTz() })}</span></div>; }
function LivePhotos() {
  const imgs = useMemo(() => { const out = []; vfs.walk(n => { if (n.type === "img" && n.size && n.size < 15e6 && out.length < 12) out.push(n); }); return out; }, []);
  const [i, setI] = useState(0); useEffect(() => { if (imgs.length < 2) return; const t = setInterval(() => setI(x => (x + 1) % imgs.length), 4500); return () => clearInterval(t); }, [imgs.length]);
  const url = useObjectUrl(imgs[i]?.id, imgs[i]?.mtime);
  return url ? <img className="tile-photo" src={url} alt="" /> : null;
}
export function StartScreen({ profile, order, badges, wallSrc, onApp, onDesktop, onLogout, onAccount }) {
  const apps = useMemo(visibleApps, []);
  useEffect(() => { const key = (e) => { if (e.key === "Escape") onDesktop(); }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, []);
  const pinned = order.filter(id => APP_BY_ID[id] && apps.some(a => a.id === id));
  const rest = apps.filter(a => !pinned.includes(a.id));
  const SIZE = { calendar: "wide", gallery: "wide", mail: "wide", files: "med", worlds: "med" };
  const tile = (a, size = SIZE[a.id] || "med") => (
    <button key={a.id} className={"mt " + size} style={{ "--tile": a.color }} onClick={() => { playEra("mosaico", "abrir"); onApp(a.id); }} aria-label={a.name}>
      {a.id === "calendar" ? <LiveCalendar /> : a.id === "gallery" ? <LivePhotos /> : null}
      {!(a.id === "calendar") && <Ic name={a.icon} size={size === "small" ? 24 : 38} className="mt-ic" />}
      {size !== "small" && <span className="mt-name">{a.name}</span>}
      {badges?.[a.id] > 0 && <span className="mt-count">{badges[a.id] > 99 ? "99+" : badges[a.id]}</span>}
    </button>);
  return (
    <div className="startscreen" role="dialog" aria-label="Inicio">
      <div className="ss-head"><h1>Inicio</h1><div className="ss-user"><span>{profile?.name || "Invitado"}</span><button className="sm-acct acct-trigger" onClick={onAccount} title="Tu cuenta"><Avatar profile={profile} size={38} /></button>
        <button className="ss-power" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión"><Ic name="logout" size={20} /></button></div></div>
      <div className="ss-groups">
        <div className="ss-group">
          <button className="mt wide desk" onClick={onDesktop} aria-label="Escritorio" style={wallSrc ? { backgroundImage: `url("${wallSrc}")` } : undefined}><span className="mt-name">Escritorio</span></button>
          <button className="mt wide" style={{ "--tile": "var(--era-tile-clock)" }} aria-label="Reloj" onClick={() => onApp("control", { applet: "reloj", nonce: Date.now() })}><LiveClock /></button>
          {pinned.slice(0, 8).map(id => tile(APP_BY_ID[id]))}
        </div>
        <div className="ss-group">{rest.map(a => tile(a, "small"))}</div>
      </div>
    </div>
  );
}
