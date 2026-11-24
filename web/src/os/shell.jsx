/* ============================================================
   Sotos OS — shell: boot, login, menu bar, dock, window manager
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { APPS, APP_BY_ID, DOCK_IDS, ROUTE, WALLPAPERS, DEFAULT_SHORTCUTS, appAllowed } from "./data.jsx";
import { SotosLogo, SotosMark, BrandMark, setBrandLogo } from "./logo.jsx";
import * as Vault from "./vault.jsx";
import { Tile, Ic, Win, EmptyState, FileGlyph, ContextMenu, Avatar, toast, Toasts, animateWinOut, animateWinGeometry , AppGuard } from "./ui.jsx";
import { UpdateDialog, UpdatePrompt, openUpdate } from "./actualizar.jsx";
import { WIDGET_TYPES, Widget } from "./widgets.jsx";
import * as vfs from "./vfs.js";
import { useVfs, DESKTOP } from "./vfs.js";
import { NodeGlyph, dragIds, dropTarget, itemMenu, runItemAction, PropertiesModal, useObjectUrl, ShareDialog, VersionsDialog, MoveToDialog, DRAG_MIME } from "./files-ui.jsx";
import { LoginScreen } from "./auth-ui.jsx";
import { FilePickerHost } from "./filepicker.jsx";
import { Taskbar, StartMenu, StartScreen } from "./taskbar.jsx";
import { AccountPanel } from "./cuenta.jsx";
import { eraOf, isWinSkin, baseSkin } from "./epocas.js";
import { playEra, playUi } from "./sonidos.js";
import { wallUrl, isWall } from "./wallpapers.js";
import { GlobalContextMenu } from "./context-menu.jsx";
import { DEMO, SHOWCASE_URL } from "./config.js";

/* bienvenida del demo público (una sola vez por navegador) */
function DemoWelcome({ onClose, onApp }) {
  const tips = [
    ["folder", "Arrastra archivos o carpetas de tu PC a Archivos o al escritorio."],
    ["description", "Abre Plan de negocio.docx o Presupuesto marketing.xlsx: son archivos de Office reales."],
    ["terminal", "En la Terminal escribe help, ls o neofetch."],
    ["wallpaper", "Cambia el fondo en Ajustes: ocho paisajes ilustrados."],
    ["mouse", "Clic derecho en cualquier parte y Ctrl + K para buscar."],
  ];
  return (
    <div className="share-modal" onMouseDown={onClose}>
      <div className="share-card demo-card" onMouseDown={e => e.stopPropagation()}>
        <BrandMark size={64} variant="tile" />
        <div className="demo-title">Bienvenido al demo de Sotos</div>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>Un ordenador completo dentro del navegador. En el demo no hay servidor: todo lo que hagas se guarda <b>solo en este navegador</b>. Con Sotos instalado tendrás cuentas, nube, compartir y el navegador con proxy.</div>
        <div className="demo-tips">{tips.map(([i, t]) => <div key={i}><Ic name={i} size={18} /><span>{t}</span></div>)}</div>
        <div className="wl-btns">
          <button className="tb-btn primary" onClick={onClose}><Ic name="arrow_forward" /> Empezar</button>
          <a className="tb-btn" href={SHOWCASE_URL} target="_blank" rel="noopener"><Ic name="info" /> Conocer el proyecto</a>
        </div>
        <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>© 2026 Sebastian Sotomontes</div>
      </div>
    </div>
  );
}
import { api, hasServer } from "./api.js";
import * as Worlds from "./worlds.jsx";
import * as Contacts from "./contacts.jsx";
import * as Donar from "./donar.jsx";
import * as Descargas from "./descargas.jsx";
import * as Nas from "./nas.jsx";
import { NotificationBell } from "./notifications.jsx";
import { SendToDialog, useInboxCount } from "./inbox.jsx";
import { setRegion, tz as regionTz } from "./region.js";
import { loadInstalled, subscribeInstalled } from "./installed.js";

// registro de componentes de app (antes se resolvían con window[app.comp])
// las apps se descargan al abrirlas (carga inicial más liviana); con el escritorio listo se precargan en segundo plano
const APP_LOADERS = {
  media: () => import("./media-apps.jsx"),
  creative: () => import("./creative.jsx"),
  apps1: () => import("./apps1.jsx"),
  apps2: () => import("./apps2.jsx"),
  apps3: () => import("./apps3.jsx"),
  apps4: () => import("./apps4.jsx"),
  apps5: () => import("./apps5.jsx"),
  games: () => import("./games.jsx"),
  terminal: () => import("./terminal.jsx"),
  admin: () => import("./admin.jsx"),
  calendar: () => import("./calendar.jsx"),
  tasks: () => import("./tasks.jsx"),
  panel: () => import("./panel-control.jsx"),
};
const COMP_MODULE = { CineApp: "media", FotosApp: "media", CodeApp: "creative", DiagramsApp: "creative", PaintApp: "creative", WhiteboardApp: "creative", EditorApp: "apps1", FilesApp: "apps1", GalleryApp: "apps1", SaveBadge: "apps1", SheetsApp: "apps1", MusicApp: "apps2", PdfApp: "apps2", VideoApp: "apps2", BrowserApp: "apps3", ChatApp: "apps3", MailApp: "apps3", WhatsAppApp: "apps3", SettingsApp: "apps4", StoreApp: "apps4", WebApp: "apps4", DocsApp: "apps5", LaunchpadApp: "apps5", SlidesApp: "apps5", TrashApp: "apps5", WebViewApp: "apps5", GamesApp: "games", TerminalApp: "terminal", AdminApp: "admin", CalendarApp: "calendar", TasksApp: "tasks", ControlPanelApp: "panel" };
const lazyCache = {};
const lazyComp = (name) => lazyCache[name] || (lazyCache[name] = React.lazy(() => APP_LOADERS[COMP_MODULE[name]]().then(m => ({ default: m[name] }))));
const APP_COMPONENTS = { ...Vault, ...Worlds, ...Contacts, ...Donar, ...Descargas, ...Nas, ...Object.fromEntries(Object.keys(COMP_MODULE).map(k => [k, lazyComp(k)])) };
const whenIdle = (fn, ms) => window.requestIdleCallback ? window.requestIdleCallback(() => fn(), { timeout: ms + 3000 }) : setTimeout(fn, ms);
let prefetched = false;
export const prefetchApps = () => { if (prefetched) return; prefetched = true; const ids = Object.keys(APP_LOADERS); const next = () => { const id = ids.shift(); if (!id) return; APP_LOADERS[id]().catch(() => {}).finally(() => whenIdle(next, 300)); }; setTimeout(() => whenIdle(next, 0), 1500); };
const DEFAULT_PROFILE = { name: "Invitado", avatar: null };
const { useState: useSh, useEffect: useEh, useRef: useRh, useCallback: useCh } = React;
const TOUCH = () => window.matchMedia?.("(pointer: coarse)").matches;
// iPhone y iPad no lanzan "contextmenu" al mantener presionado: se simula (Android ya lo hace solo)
if (typeof window !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))) {
  let t = null, x = 0, y = 0, fired = false;
  document.addEventListener("touchstart", (e) => { if (e.touches.length !== 1) return; const p = e.touches[0]; x = p.clientX; y = p.clientY; fired = false; clearTimeout(t);
    const target = e.target; t = setTimeout(() => { fired = true; target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })); navigator.vibrate?.(10); }, 550); }, { passive: true });
  document.addEventListener("touchmove", (e) => { const p = e.touches[0]; if (Math.abs(p.clientX - x) > 10 || Math.abs(p.clientY - y) > 10) clearTimeout(t); }, { passive: true });
  document.addEventListener("touchend", (e) => { clearTimeout(t); if (fired) e.preventDefault(); }, { passive: false });
}

const DEFAULTS = { region: { timeZone: "auto", dateFormat: "auto", showExt: true }, theme: "light", accent: "#c4532f", wallpaper: "paramo", dock: "bottom", font: "Onest", winStyle: "soft", clock24: true, skin: "sotos", wallGray: true };
const WIN_STYLES = {
  // identidad Sotos: borde de tinta y sombra desplazada, como una lámina impresa
  soft:  { "--win-radius": "10px", "--win-shadow": "5px 5px 0 var(--print-shadow), 0 24px 48px -26px rgba(0,0,0,.45)", "--win-border": "1.5px solid var(--ink-line)" },
  sharp: { "--win-radius": "3px",  "--win-shadow": "7px 7px 0 var(--print-shadow)", "--win-border": "1.5px solid var(--ink-line)" },
  flat:  { "--win-radius": "8px",  "--win-shadow": "0 1px 0 var(--border)", "--win-border": "1px solid var(--border-strong)" },
};

/* -------------------- Menu bar -------------------- */
function MenuBar({ activeApp, settings, update, profile, onApp, onNew, onLogout, onSearch, onOpenLink, onAccount }) {
  const [now, setNow] = useSh(new Date());
  const [menu, setMenu] = useSh(null);
  const [cal, setCal] = useSh(false);
  const [calMonth, setCalMonth] = useSh(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  useEh(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEh(() => {
    if (!menu && !cal) return;
    const close = (e) => { if (e.target.closest && e.target.closest(".cal-pop")) return; setMenu(null); setCal(false); };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => document.removeEventListener("mousedown", close);
  }, [menu, cal]);
  const time = now.toLocaleTimeString("es-ES", { timeZone: regionTz(), hour: "2-digit", minute: "2-digit", hour12: !settings.clock24 });
  const date = now.toLocaleDateString("es-ES", { timeZone: regionTz(), weekday: "short", day: "numeric", month: "short" });

  const MENUS = {
    Archivo: [
      { label: "Nueva ventana de Archivos", icon: "folder", act: () => onApp("files") },
      { label: "Nuevo documento", icon: "description", act: () => onNew("docx") },
      { label: "Nueva hoja de cálculo", icon: "table_chart", act: () => onNew("xlsx") },
      { label: "Nueva presentación", icon: "slideshow", act: () => onNew("pptx") },
      { label: "Nueva nota de texto", icon: "edit_note", act: () => onNew("txt") },
      { sep: true },
      { label: "Cerrar sesión", icon: "power_settings_new", act: onLogout },
    ],
    Editar: [
      { label: "Buscar…  (Ctrl+K)", icon: "search", act: onSearch },
      { label: "Preferencias…", icon: "tune", act: () => onApp("settings") },
    ],
    Ver: [
      { label: settings.theme === "dark" ? "Modo claro" : "Modo oscuro", icon: settings.theme === "dark" ? "light_mode" : "dark_mode", act: () => update("theme", settings.theme === "dark" ? "light" : "dark") },
      { label: "Cambiar fondo…", icon: "wallpaper", act: () => onApp("settings") },
      { label: "Dock " + (settings.dock === "left" ? "abajo" : "a la izquierda"), icon: "dock_to_bottom", act: () => update("dock", settings.dock === "left" ? "bottom" : "left") },
    ],
    Ayuda: [
      { label: "Acerca de Sotos", icon: "info", act: () => onApp("settings") },
      { label: "Centro de soporte", icon: "support", act: () => onApp("chat") },
    ],
  };

  return (
    <div className="menubar">
      <div className="brand" onClick={() => onApp("settings")} style={{ cursor: "pointer" }}><BrandMark size={17} />Sotos</div>
      <div className="menu-item active-app">{activeApp ? activeApp.name : "Escritorio"}</div>
      {Object.keys(MENUS).map(name => (
        <div key={name} className="menu-wrap" onMouseDown={e => e.stopPropagation()}>
          <div className={"menu-item" + (menu === name ? " open" : "")}
            onClick={() => setMenu(menu === name ? null : name)} onMouseEnter={() => menu && setMenu(name)}>{name}</div>
          {menu === name && (
            <div className="menu-drop">
              {MENUS[name].map((it, i) => it.sep ? <div key={i} className="ctx-sep" />
                : <button key={i} className="ctx-item" onClick={() => { it.act(); setMenu(null); }}><Ic name={it.icon} size={18} /><span>{it.label}</span></button>)}
            </div>
          )}
        </div>
      ))}
      <div className="spacer" />
      <div className="tray">
        {DEMO && <a className="demo-chip" href={SHOWCASE_URL} target="_blank" rel="noopener" title="Esto es un demo: los archivos se guardan solo en este navegador. Clic para conocer el proyecto.">DEMO</a>}
        <div className="ti menubar-search" title="Buscar en todo Sotos (Ctrl + K)" onClick={onSearch}><Ic name="search" /><span>Buscar</span></div>
        <NotificationBell onOpenLink={onOpenLink} />
        <TransfersIndicator />
        <SyncIndicator />
        <BatteryIndicator />
        <div className="ti" title="Cerrar sesión" onClick={onLogout}><Ic name="power_settings_new" /></div>
        <div className="ti acct-trigger" title="Tu cuenta" role="button" tabIndex={0} onClick={onAccount} onKeyDown={e => e.key === "Enter" && onAccount()} style={{ padding: "0 4px" }}><Avatar profile={profile} size={20} /></div>
        <div className="ti clock" onMouseDown={e => e.stopPropagation()} onClick={() => { setCal(c => !c); setMenu(null); }}>
          <span style={{ textTransform: "capitalize" }}>{date}</span> &nbsp;{time}
        </div>
        {cal && <CalendarPopover now={now} month={calMonth} setMonth={setCalMonth} clock24={settings.clock24} />}
      </div>
    </div>
  );
}

/* -------------------- gestor de transferencias (subidas y descargas) -------------------- */
function TransfersIndicator() {
  const [list, setList] = useSh([]), [open, setOpen] = useSh(false), [, tick] = useSh(0);
  useEh(() => vfs.subscribeTransfers(setList), []);
  const active = list.filter(t => t.status === "active");
  useEh(() => { if (!active.length) return; const i = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(i); }, [active.length]);
  if (!list.length) return null;
  const pct = (t) => t.total ? Math.min(100, Math.round(t.loaded / t.total * 100)) : 0;
  const total = active.reduce((a, t) => a + t.total, 0), done = active.reduce((a, t) => a + t.loaded, 0);
  const speed = (t) => { const s = (Date.now() - t.started) / 1000; return s > 1 ? t.loaded / s : 0; };
  const eta = (t) => { const v = speed(t); if (!v) return ""; const r = (t.total - t.loaded) / v; return r < 60 ? `${Math.ceil(r)} s` : r < 3600 ? `${Math.ceil(r / 60)} min` : `${(r / 3600).toFixed(1)} h`; };
  const label = { done: "Listo", error: "Error", cancelled: "Cancelada" };
  return (
    <div className="ti tr-wrap" onMouseDown={e => e.stopPropagation()}>
      <div className={"tr-btn" + (active.length ? " busy" : "")} title={active.length ? `Transfiriendo ${active.length} archivo(s) · ${total ? Math.round(done / total * 100) : 0}%` : "Transferencias recientes"} onClick={() => setOpen(o => !o)}>
        <Ic name={active.length ? "swap_vert" : "download_done"} />{active.length > 0 && <span className="tr-pct">{total ? Math.round(done / total * 100) : 0}%</span>}
      </div>
      {open && <div className="tr-panel">
        <div className="tr-head"><b>Transferencias</b><div style={{ flex: 1 }} />{list.some(t => t.status !== "active") && <button className="tb-btn" onClick={() => vfs.clearTransfers()}>Limpiar</button>}</div>
        {[...list].reverse().map(t => <div key={t.key} className={"tr-row " + t.status}>
          <Ic name={t.dir === "up" ? "upload" : "download"} size={18} />
          <div className="tr-main"><div className="tr-name" title={t.name}>{t.name}</div>
            <div className="tr-bar"><i style={{ width: (t.status === "done" ? 100 : pct(t)) + "%" }} /></div>
            <div className="tr-meta">{t.status === "active" ? `${vfs.fmtSize(t.loaded)} de ${vfs.fmtSize(t.total)} · ${vfs.fmtSize(speed(t))}/s${eta(t) ? " · quedan " + eta(t) : ""}` : (label[t.status] || "") + (t.error ? ": " + t.error : "") + (t.note ? " · " + t.note : t.status === "done" ? " · " + vfs.fmtSize(t.total) : "")}</div></div>
          {t.status === "active" && t.dir === "up" && <button className="tb-btn icon" title="Cancelar" onClick={() => vfs.cancelTransfer(t.key)}><Ic name="close" /></button>}
        </div>)}
      </div>}
    </div>
  );
}

/* -------------------- indicadores reales de la bandeja -------------------- */
function SyncIndicator() {
  const mode = useVfs(s => s.mode), sync = useVfs(s => s.sync);
  const [online, setOnline] = useSh(navigator.onLine);
  useEh(() => { const f = () => setOnline(navigator.onLine); window.addEventListener("online", f); window.addEventListener("offline", f); return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); }; }, []);
  if (mode !== "cloud") return <div className="ti" title={online ? "Modo invitado: los archivos están solo en este navegador" : "Sin conexión"}><Ic name={online ? "wifi" : "wifi_off"} /></div>;
  const M = { ok: ["cloud_done", "Todo sincronizado"], syncing: ["cloud_sync", `Sincronizando… (${sync.pending})`], offline: ["cloud_off", `Sin conexión · ${sync.pending} cambio(s) pendiente(s)`],
    auth: ["cloud_alert", "La sesión caducó: vuelve a iniciar sesión"], full: ["cloud_alert", "Tu espacio en la nube está lleno"], idle: ["cloud", "Nube"] };
  const [icon, label] = M[sync.status] || M.idle;
  return <div className={"ti" + (sync.status === "syncing" ? " spin-soft" : "")} title={label + (sync.quota ? ` · ${vfs.fmtSize(sync.used || 0)} de ${vfs.fmtSize(sync.quota)}` : "")}
    style={{ color: sync.status === "auth" || sync.status === "full" ? "#e2483d" : undefined }}><Ic name={icon} /></div>;
}
function BatteryIndicator() {
  const [b, setB] = useSh(null);
  useEh(() => {
    let bat; const upd = () => setB({ level: bat.level, charging: bat.charging });
    navigator.getBattery?.().then(x => { bat = x; upd(); x.addEventListener("levelchange", upd); x.addEventListener("chargingchange", upd); }).catch(() => {});
    return () => { if (bat) { bat.removeEventListener("levelchange", upd); bat.removeEventListener("chargingchange", upd); } };
  }, []);
  if (!b || (b.level === 1 && b.charging)) return null; // PC de escritorio: no mostrar batería falsa
  const lv = Math.round(b.level * 100);
  const icon = b.charging ? "battery_charging_full" : lv > 85 ? "battery_full" : lv > 60 ? "battery_5_bar" : lv > 35 ? "battery_3_bar" : lv > 15 ? "battery_2_bar" : "battery_alert";
  return <div className="ti" title={`Batería ${lv}%${b.charging ? " · cargando" : ""}`}><Ic name={icon} /></div>;
}

/* -------------------- Calendar popover -------------------- */
function CalendarPopover({ now, month, setMonth, clock24 }) {
  const today = new Date();
  const first = new Date(month.y, month.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const monthName = first.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const cells = []; for (let i = 0; i < startDow; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(d);
  const isToday = d => d === today.getDate() && month.m === today.getMonth() && month.y === today.getFullYear();
  const t = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: !clock24 });
  return (
    <div className="cal-pop" onMouseDown={e => e.stopPropagation()}>
      <div className="cal-clock">
        <div className="cal-time">{t}</div>
        <div className="cal-date" style={{ textTransform: "capitalize" }}>{now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</div>
      </div>
      <div className="cal-head">
        <button onClick={() => setMonth(m => { const n = m.m - 1; return n < 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: n }; })}><Ic name="chevron_left" size={18} /></button>
        <span style={{ textTransform: "capitalize" }}>{monthName}</span>
        <button onClick={() => setMonth(m => { const n = m.m + 1; return n > 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: n }; })}><Ic name="chevron_right" size={18} /></button>
      </div>
      <div className="cal-grid">
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
        {cells.map((d, i) => <span key={i} className={"cal-day" + (d && isToday(d) ? " today" : "") + (!d ? " empty" : "")}>{d || ""}</span>)}
      </div>
    </div>
  );
}

/* -------------------- Dock -------------------- */
export const APP_MIME = "application/x-sotos-app"; // arrastrar una app (desde Aplicaciones o el escritorio) hasta el Dock
function Dock({ position, order, running, minimized, badges, onApp, dockApi }) {
  const [ctx, setCtx] = useSh(null), [hotAt, setHotAt] = useSh(null);
  const drag = useRh(null), self = useRh(null);
  const hasApp = (e) => [...e.dataTransfer.types].includes(APP_MIME) || [...e.dataTransfer.types].includes(DRAG_MIME);
  const onDrop = (i, e) => {
    setHotAt(null);
    const from = drag.current; drag.current = null;
    if (from != null) { if (from === i) return; const arr = [...order]; const [m] = arr.splice(from, 1); arr.splice(from < i ? i - 1 : i, 0, m); dockApi.reorder(arr); return; }
    const id = e.dataTransfer.getData(APP_MIME); if (id && APP_BY_ID[id]) { dockApi.insert(id, i); toast(`${APP_BY_ID[id].name} agregada al Dock`, { icon: "add_circle" }); return; }
    // carpetas arrastradas desde Archivos o el escritorio
    let ids = []; try { ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME) || "[]"); } catch {}
    const folders = ids.map(vfs.node).filter(n => n && n.type === "folder");
    folders.forEach((f, k) => dockApi.insert("f:" + f.id, i + k));
    if (folders.length) toast(folders.length === 1 ? `Carpeta «${folders[0].name}» agregada al Dock` : `${folders.length} carpetas agregadas al Dock`, { icon: "create_new_folder" });
    else if (ids.length) toast("Al Dock solo se pueden agregar apps y carpetas", { icon: "info" });
  };
  const over = (i) => (e) => { if (drag.current != null || hasApp(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; if (hotAt !== i) setHotAt(i); } };
  // soltar un ícono fuera del Dock lo quita (con deshacer)
  const dragEnd = (id) => (e) => {
    const from = drag.current; drag.current = null; setHotAt(null); if (from == null) return;
    const r = self.current?.getBoundingClientRect(); const out = r && (e.clientX < r.left - 40 || e.clientX > r.right + 40 || e.clientY < r.top - 40 || e.clientY > r.bottom + 40);
    if (out && e.dataTransfer.dropEffect === "none") { const before = [...order]; dockApi.remove(id); toast(`${id.startsWith("f:") ? "Carpeta «" + (vfs.node(id.slice(2))?.name || "") + "»" : APP_BY_ID[id]?.name} quitada del Dock`, { icon: "do_not_disturb_on", action: { label: "Deshacer", run: () => dockApi.reorder(before) } }); }
  };
  // apps abiertas que no están fijadas: se muestran al final, como en cualquier escritorio
  const extra = [...running].filter(id => !order.includes(id) && APP_BY_ID[id] && !APP_BY_ID[id].hidden && id !== "launchpad");
  const item = (id, i, pinned) => {
    if (id === "launchpad" && position.includes("rail")) return null; // en el riel, la marca abre Aplicaciones
    if (id.startsWith("f:")) { // carpeta fijada en el Dock
      const f = vfs.node(id.slice(2)); if (!f) return null;
      return (
        <button key={id} className={"dock-item dock-folder" + (hotAt === i && pinned ? " drop-before" : "")} data-folder={f.id} draggable
          onClick={() => onApp("files", { folderId: f.id, nonce: Date.now() })}
          onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, id, pinned: true, folder: f }); }}
          onDragStart={e => { drag.current = i; e.dataTransfer.setData(APP_MIME, id); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={dragEnd(id)} onDragOver={over(i)} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(i, e); }}>
          <span className="dock-folder-ic"><NodeGlyph node={f} size={34} /></span>
          <span className="dock-tip">{f.name}</span>
        </button>);
    }
    if (!appAllowed(id, vfs.getState().user)) return null;
    const app = APP_BY_ID[id]; if (!app) return null;
    return (
      <button key={(pinned ? "" : "x:") + id} className={"dock-item" + (hotAt === i && pinned ? " drop-before" : "")} data-app={id} draggable={pinned}
        onClick={() => onApp(id)}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, id, pinned }); }}
        onDragStart={e => { drag.current = i; e.dataTransfer.setData(APP_MIME, id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={dragEnd(id)}
        onDragOver={pinned ? over(i) : undefined} onDrop={pinned ? (e) => { e.preventDefault(); e.stopPropagation(); onDrop(i, e); } : undefined}>
        <Tile icon={app.icon} color={app.color} app={id} />
        <span className="dock-tip">{app.name}</span>
        {running.has(id) && <span className={"run-dot" + (minimized?.has(id) ? " min" : "")} />}
        {badges?.[id] > 0 && <span className="dock-badge" key={badges[id]}>{badges[id] > 99 ? "99+" : badges[id]}</span>}
      </button>
    );
  };
  return (
    <div ref={self} className={"dock " + position + (hotAt === order.length ? " drop-end" : "")}
      onDragOver={over(order.length)} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHotAt(null); }} onDrop={e => { e.preventDefault(); onDrop(order.length, e); }}>
      {position.includes("rail") && <button className="rail-logo" title="Aplicaciones" onClick={() => onApp("launchpad")}><BrandMark size={32} /></button>}
      {order.map((id, i) => id === "__div__" ? <div key={"d" + i} className="divider" onDragOver={over(i)} onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(i, e); }} /> : item(id, i, true))}
      {!!extra.length && <div className="divider" />}
      {extra.map((id, i) => item(id, order.length + i, false))}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y}
        items={ctx.folder ? [{ id: "open", label: "Abrir carpeta", icon: "folder_open" }, { sep: true }, { id: "remove", label: "Quitar del Dock", icon: "do_not_disturb_on", danger: true }] : [{ id: "open", label: running.has(ctx.id) ? "Mostrar" : "Abrir", icon: "open_in_new" }, { sep: true },
          ctx.pinned ? { id: "remove", label: "Quitar del Dock", icon: "do_not_disturb_on", danger: true } : { id: "keep", label: "Mantener en el Dock", icon: "keep" }]}
        onSelect={(a) => { if (a === "open") ctx.folder ? onApp("files", { folderId: ctx.folder.id, nonce: Date.now() }) : onApp(ctx.id); if (a === "remove") dockApi.remove(ctx.id); if (a === "keep") { dockApi.add(ctx.id); toast(`${APP_BY_ID[ctx.id].name} se queda en el Dock`, { icon: "keep" }); } }} onClose={() => setCtx(null)} />}
    </div>
  );
}
/* -------------------- Desktop (icons + drop + context menu) -------------------- */
function Desktop({ shifted, openApp, openItem, settings, update, widgetApi }) {
  const desk = useVfs(() => vfs.node(DESKTOP));
  const trashCount = useVfs(s => s.trash.length);
  const clipboard = useVfs(s => s.clipboard);
  const [ctx, setCtx] = useSh(null);        // { x, y, item }  (item null = zona vacía)
  const [sel, setSel] = useSh(null);
  const [renaming, setRenaming] = useSh(null);
  const [tmp, setTmp] = useSh("");
  const [props, setProps] = useSh(null);
  const [trashHot, setTrashHot] = useSh(false);
  const items = desk ? desk.children || [] : [];
  const apps = [
    { id: "files", icon: "folder", color: APP_BY_ID.files.color, label: "Archivos" },
    { id: "browser", icon: "language", color: APP_BY_ID.browser.color, label: "Navegador" },
    { id: "launchpad", icon: "apps", color: APP_BY_ID.launchpad.color, label: "Aplicaciones" },
  ];
  const EMPTY = [
    { id: "newfolder", label: "Nueva carpeta", icon: "create_new_folder" },
    { id: "newtxt", label: "Nuevo documento de texto", icon: "note_add" },
    ...(clipboard ? [{ id: "paste", label: `Pegar (${clipboard.ids.length})`, icon: "content_paste" }] : []),
    { sep: true },
    { id: "widget", label: "Añadir widget", icon: "widgets" },
    ...(settings.iconPos && Object.keys(settings.iconPos).length ? [{ id: "arrange", label: "Ordenar iconos", icon: "grid_view" }] : []),
    { id: "wall", label: "Cambiar fondo", icon: "wallpaper" },
    { id: "theme", label: settings.theme === "dark" ? "Modo claro" : "Modo oscuro", icon: settings.theme === "dark" ? "light_mode" : "dark_mode" },
    { sep: true },
    { id: "emptytrash", label: "Vaciar papelera", icon: "delete_sweep", danger: true },
  ];
  const [wmenu, setWmenu] = useSh(null);
  const startRename = (id) => { setRenaming(id); setTmp(vfs.node(id)?.name || ""); };
  const commitRename = () => { if (renaming && tmp.trim()) vfs.rename(renaming, tmp.trim()); setRenaming(null); };
  const onEmpty = async (id, x, y) => {
    if (id === "newfolder") startRename(vfs.mkdir(DESKTOP));
    else if (id === "newtxt") startRename(await vfs.create(DESKTOP, "Nuevo documento.txt", ""));
    else if (id === "paste") { const n = await vfs.paste(DESKTOP); if (n) toast(`${n} elemento(s) pegado(s) en el escritorio`); }
    else if (id === "widget") setWmenu({ x, y });
    else if (id === "arrange") update("iconPos", {});
    else if (id === "wall") openApp("settings");
    else if (id === "theme") update("theme", settings.theme === "dark" ? "light" : "dark");
    else if (id === "emptytrash") vfs.emptyTrash();
  };
  const helpers = { openItem, update, startRename, showProps: setProps, parentId: DESKTOP };

  // ---- iconos con posición libre: se arrastran a cualquier celda de una cuadrícula y se recuerdan en Ajustes ----
  const GRID = { w: 100, h: 96 }, DESK_MIME = "application/x-sotos-desk";
  const iconsRef = useRh(null);
  const [vh, setVh] = useSh(window.innerHeight);
  useEh(() => { const r = () => setVh(window.innerHeight); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);
  const rows = Math.max(1, Math.floor((vh - 150) / GRID.h));
  const keys = [...apps.map(a => "app:" + a.id), ...items.map(it => it.id), "trash"];
  const saved = settings.iconPos || {};
  const cells = (() => { // posición de cada icono: la guardada o la siguiente celda libre (por columnas)
    const out = {}, used = new Set(); const k = (c, r) => c + ":" + r;
    for (const key of keys) { const p = saved[key]; if (p && Number.isInteger(p.c) && Number.isInteger(p.r) && !used.has(k(p.c, p.r))) { out[key] = p; used.add(k(p.c, p.r)); } }
    let i = 0; for (const key of keys) { if (out[key]) continue; let c, r; do { c = Math.floor(i / rows); r = i % rows; i++; } while (used.has(k(c, r))); out[key] = { c, r }; used.add(k(c, r)); }
    return out;
  })();
  const at = (key) => ({ position: "absolute", left: cells[key].c * GRID.w, top: cells[key].r * GRID.h });
  const startDeskDrag = (e, key) => { const r = e.currentTarget.getBoundingClientRect(); e.dataTransfer.setData(DESK_MIME, JSON.stringify({ key, dx: e.clientX - r.left, dy: e.clientY - r.top })); e.dataTransfer.effectAllowed = "copyMove"; };
  const isDesk = (e) => [...e.dataTransfer.types].includes(DESK_MIME);
  const dropOnDesk = (e) => {
    let d; try { d = JSON.parse(e.dataTransfer.getData(DESK_MIME)); } catch { return; }
    const box = iconsRef.current.getBoundingClientRect();
    let c = Math.max(0, Math.round((e.clientX - d.dx - box.left) / GRID.w)), r = Math.min(rows - 1, Math.max(0, Math.round((e.clientY - d.dy - box.top) / GRID.h)));
    const taken = (c2, r2) => keys.some(k => k !== d.key && cells[k].c === c2 && cells[k].r === r2);
    if (taken(c, r)) { // la celda está ocupada: la libre más cercana
      let best = null; for (let cc = 0; cc < c + 3; cc++) for (let rr = 0; rr < rows; rr++) if (!taken(cc, rr)) { const dist = Math.hypot(cc - c, rr - r); if (!best || dist < best.dist) best = { c: cc, r: rr, dist }; }
      if (best) ({ c, r } = best);
    }
    // fijar también los demás donde están ahora, para que no se reacomoden
    const next = {}; for (const k of keys) next[k] = { c: cells[k].c, r: cells[k].r }; next[d.key] = { c, r };
    update("iconPos", next);
  };
  const deskDrop = dropTarget(DESKTOP);

  // teclado sobre el icono seleccionado
  const deskActive = useRh(false);
  useEh(() => {
    const down = (e) => { deskActive.current = !!(e.target.closest && e.target.closest(".desk-layer")); };
    document.addEventListener("mousedown", down, true); return () => document.removeEventListener("mousedown", down, true);
  }, []);
  useEh(() => {
    const key = (e) => {
      if (!sel || renaming || !deskActive.current || e.target.closest("input,textarea,[contenteditable=true]")) return;
      const n = vfs.node(sel); if (!n) return;
      if (e.key === "Delete") runItemAction("trash", [n], helpers);
      else if (e.key === "F2") startRename(sel);
      else if (e.key === "Enter") openItem(n);
      else if (e.ctrlKey && e.key.toLowerCase() === "c") vfs.clip("copy", [sel]);
      else if (e.ctrlKey && e.key.toLowerCase() === "x") vfs.clip("cut", [sel]);
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [sel, renaming]);

  return (
    <div className="desk-layer" {...deskDrop}
      onDragOver={e => { if (isDesk(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; return; } deskDrop.onDragOver(e); }}
      onDrop={e => { if (isDesk(e)) { e.preventDefault(); dropOnDesk(e); return; } deskDrop.onDrop(e); }}
      onMouseDown={e => { if (e.target === e.currentTarget || e.target.classList.contains("desk-icons")) setSel(null); }}
      onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item: null }); }}>
      <div className="desk-icons free" ref={iconsRef} style={{ left: shifted ? 92 : 14 }}>
        {apps.map(ic => (
          <div key={ic.label} className="desk-icon" style={at("app:" + ic.id)} draggable onDragStart={e => { e.dataTransfer.setData(APP_MIME, ic.id); startDeskDrag(e, "app:" + ic.id); }} onDoubleClick={() => openApp(ic.id)} onClick={() => TOUCH() && openApp(ic.id)}>
            <Tile icon={ic.icon} color={ic.color} app={ic.id} /><span className="lbl">{ic.label}</span>
          </div>
        ))}
        {items.map(it => (
          <div key={it.id} className={"desk-icon" + (sel === it.id ? " sel" : "") + (clipboard?.mode === "cut" && clipboard.ids.includes(it.id) ? " cut" : "")}
            style={at(it.id)} draggable={renaming !== it.id}
            onDragStart={e => { dragIds(e, [it.id]); startDeskDrag(e, it.id); }}
            {...(it.type === "folder" ? dropTarget(it.id) : {})}
            onMouseDown={() => setSel(it.id)}
            onClick={() => TOUCH() && renaming !== it.id && openItem(it)}
            onDoubleClick={() => openItem(it)}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSel(it.id); setCtx({ x: e.clientX, y: e.clientY, item: it }); }}>
            <div style={{ width: 52, height: 50, display: "grid", placeItems: "center" }}><NodeGlyph node={it} size={44} /></div>
            {renaming === it.id
              ? <input className="rename-input" autoFocus value={tmp} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                  onFocus={e => { const i = e.target.value.lastIndexOf("."); e.target.setSelectionRange(0, i > 0 && it.type !== "folder" ? i : e.target.value.length); }}
                  onChange={e => setTmp(e.target.value)} onBlur={commitRename}
                  onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }} />
              : <span className="lbl">{it.name}</span>}
          </div>
        ))}
        <div className={"desk-icon desk-trash" + (trashHot ? " sel" : "")} style={at("trash")} draggable onDragStart={e => startDeskDrag(e, "trash")} onDoubleClick={() => openApp("trash")} onClick={() => TOUCH() && openApp("trash")}
          onDragOver={e => { if ([...e.dataTransfer.types].includes("application/x-sotos-ids")) { e.preventDefault(); setTrashHot(true); } }}
          onDragLeave={() => setTrashHot(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setTrashHot(false); try { const ids = JSON.parse(e.dataTransfer.getData("application/x-sotos-ids")); runItemAction("trash", ids.map(vfs.node).filter(Boolean), helpers); } catch {} }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item: null }); }}>
          <div style={{ position: "relative" }}>
            <Tile icon={trashCount ? "delete" : "delete_sweep"} color="#7d8590" app="trash" />
            {trashCount > 0 && <span className="trash-badge">{trashCount}</span>}
          </div>
          <span className="lbl">Papelera</span>
        </div>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.item ? itemMenu([ctx.item], { canPaste: !!clipboard }) : EMPTY}
        onSelect={(id) => ctx.item ? runItemAction(id, [ctx.item], helpers) : onEmpty(id, ctx.x, ctx.y)} onClose={() => setCtx(null)} />}
      {props && <PropertiesModal id={props} onClose={() => setProps(null)} />}
      {wmenu && <ContextMenu x={wmenu.x} y={wmenu.y}
        items={WIDGET_TYPES.map(t => ({ id: t.id, label: t.name, icon: t.icon }))}
        onSelect={(id) => widgetApi.add(id)} onClose={() => setWmenu(null)} />}
    </div>
  );
}

/* -------------------- Boot -------------------- */
// espera a la animación mínima Y a que el sistema de archivos esté listo
function BootScreen({ onDone, quick, task }) {
  const [err, setErr] = useSh(null);
  const [slow, setSlow] = useSh(false);
  useEh(() => {
    let live = true;
    const min = new Promise(r => setTimeout(r, quick ? 300 : 2200));
    const t = setTimeout(() => live && setSlow(true), 3500);
    Promise.all([min, task()]).then(([, v]) => live && onDone(v)).catch(e => live && setErr(e.message || String(e)));
    return () => { live = false; clearTimeout(t); };
  }, []);
  return (
    <div className="boot">
      <div className="boot-logo"><BrandMark size={116} variant="tile" spin /></div>
      <div className="boot-name">Sotos</div>
      {!err && <div className="boot-bar"><div className="boot-fill" /></div>}
      <div className="boot-tag">{err ? "No se pudo iniciar el almacenamiento: " + err : slow ? "Preparando tus archivos por primera vez…" : "tu ordenador en la nube"}</div>
      {err && <button className="tb-btn" style={{ marginTop: 14 }} onClick={() => location.reload()}>Reintentar</button>}
    </div>
  );
}


/* -------------------- Spotlight search -------------------- */
// atajos de Ajustes que el buscador también encuentra
const SETTINGS_HITS = [
  { tab: "perfil", label: "Foto y nombre de perfil", k: "perfil foto avatar nombre imagen" },
  { tab: "cuenta", label: "Cuenta, contraseña y copia de seguridad", k: "cuenta contraseña clave sesión copia seguridad exportar importar cerrar" },
  { tab: "fondo", label: "Fondo de pantalla", k: "fondo pantalla wallpaper imagen" },
  { tab: "apariencia", label: "Apariencia: tema, colores, logo y Grafito", k: "apariencia tema oscuro claro color acento logo grafito tipografía letra ventanas" },
  { tab: "escritorio", label: "Escritorio, Dock e iconos", k: "escritorio dock iconos widgets barra" },
  { tab: "region", label: "Región, idioma y hora", k: "región idioma hora zona fecha moneda" },
  { tab: "acerca", label: "Acerca de Sotos", k: "acerca versión créditos" },
];
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function Spotlight({ onOpen, onApp, onClose }) {
  const [q, setQ] = useSh("");
  const [hi, setHi] = useSh(0);
  const [data, setData] = useSh({ contacts: [], events: [], tasks: [] });
  // contactos, eventos y tareas se cargan una vez al abrir el buscador (solo con cuenta)
  useEh(() => { if (vfs.getState().mode !== "cloud") return; const y = 365 * 864e5;
    Promise.all([api("GET", "contacts").catch(() => ({})), api("GET", `calendar?from=${Date.now() - y}&to=${Date.now() + y}`).catch(() => ({})), api("GET", "tasks").catch(() => ({}))])
      .then(([c, e, t]) => setData({ contacts: c.items || [], events: e.events || [], tasks: t.tasks || [] })); }, []);
  const ql = norm(q.trim());
  const has = (...v) => v.some(x => norm(x).includes(ql));
  const fmtWhen = (ms) => new Date(ms).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const groups = !ql ? [] : [
    ["Aplicaciones", APPS.filter(a => a.id !== "web" && !a.hidden && appAllowed(a.id, vfs.getState().user) && has(a.name)).slice(0, 5).map(a => ({ kind: "app", app: a }))],
    ["Archivos y carpetas", vfs.search(q.trim(), 10).map(n => ({ kind: "file", node: n }))],
    ["Contactos", data.contacts.filter(c => has(c.name, c.email, c.phone, c.company)).slice(0, 5).map(c => ({ kind: "contact", c }))],
    ["Calendario", data.events.filter(e => has(e.title, e.location, e.notes)).sort((a, b) => Math.abs(a.start - Date.now()) - Math.abs(b.start - Date.now())).slice(0, 5).map(e => ({ kind: "event", e }))],
    ["Tareas", data.tasks.filter(t => has(t.title, t.notes)).slice(0, 5).map(t => ({ kind: "task", t }))],
    ["Ajustes", SETTINGS_HITS.filter(s => has(s.label, s.k)).slice(0, 3).map(s => ({ kind: "setting", s }))],
    ["Internet", [{ kind: "web", q: q.trim() }]],
  ].filter(g => g[1].length);
  const results = groups.flatMap(g => g[1]);
  const go = (r) => { if (!r) return;
    if (r.kind === "app") onApp(r.app.id); else if (r.kind === "file") onOpen(r.node);
    else if (r.kind === "contact") onApp("contacts", { contactId: r.c.id }); else if (r.kind === "event") onApp("calendar", { date: r.e.start });
    else if (r.kind === "task") onApp("tasks", { taskId: r.t.id }); else if (r.kind === "setting") onApp("settings", { tab: r.s.tab });
    else if (r.kind === "web") onApp("browser", { url: "https://duckduckgo.com/?q=" + encodeURIComponent(r.q), scName: "Buscar: " + r.q });
    onClose(); };
  useEh(() => { const esc = e => e.key === "Escape" && onClose(); document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, []);
  useEh(() => setHi(0), [q]);
  const row = (r) => r.kind === "app" ? [<Tile icon={r.app.icon} color={r.app.color} size={28} app={r.app.id} />, r.app.name, "Aplicación"]
    : r.kind === "file" ? [<NodeGlyph node={r.node} size={26} />, r.node.name, ["Sotos Drive", ...vfs.pathOf(r.node.id).slice(0, -1).map(p => p.name)].join(" › ")]
    : r.kind === "contact" ? [<Avatar profile={{ name: r.c.name, avatar: r.c.sotos?.avatar }} size={28} />, r.c.name, [r.c.email, r.c.phone].filter(Boolean).join(" · ") || "Contacto"]
    : r.kind === "event" ? [<span className="spot-ic"><Ic name="event" size={18} /></span>, r.e.title, fmtWhen(r.e.start) + (r.e.location ? " · " + r.e.location : "")]
    : r.kind === "task" ? [<span className="spot-ic"><Ic name={r.t.done ? "task_alt" : "radio_button_unchecked"} size={18} /></span>, r.t.title, r.t.due ? "Vence " + fmtWhen(r.t.due) : "Tarea"]
    : r.kind === "setting" ? [<span className="spot-ic"><Ic name="settings" size={18} /></span>, r.s.label, "Ajustes"]
    : [<span className="spot-ic"><Ic name="travel_explore" size={18} /></span>, `Buscar “${r.q}” en internet`, "Abre el Navegador"];
  let n = -1;
  return (
    <div className="spot-overlay" onMouseDown={onClose}>
      <div className="spot" onMouseDown={e => e.stopPropagation()}>
        <div className="spot-input"><Ic name="search" size={22} />
          <input autoFocus placeholder="Buscar en todo Sotos: apps, archivos, contactos, eventos, tareas, ajustes…" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); } if (e.key === "Enter") go(results[hi]); }} /></div>
        {!!results.length && <div className="spot-results">
          {groups.map(([title, rs]) => <React.Fragment key={title}>
            <div className="spot-group">{title}</div>
            {rs.map((r) => { const i = ++n; const [ic, name, sub] = row(r); return (
              <div key={i} className={"spot-row" + (i === hi ? " hi" : "")} onMouseEnter={() => setHi(i)} onClick={() => go(r)}>
                {ic}<div><div className="spot-name">{name}</div><div className="spot-path">{sub}</div></div>
              </div>); })}
          </React.Fragment>)}
        </div>}
        {!q.trim() && <div className="spot-empty">Escribe para buscar · <kbd>Ctrl</kbd> + <kbd>K</kbd> lo abre desde cualquier parte</div>}
      </div>
    </div>
  );
}
/* ============================================================ */
function OS() {
  const [settings, setSettings] = useSh(() => {
    try {
      const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("sotos") || "{}") };
      // migrar la paleta anterior a la de identidad
      if (["#2f6fed", "#34c759", "#8e5cf6", "#ff375f", "#ff8a00", "#0aa5b5"].includes(s.accent)) s.accent = DEFAULTS.accent;
      // enlaces directos: ?tema=grafito|sotos y ?modo=oscuro|claro (útil para mostrar el demo)
      const q = new URLSearchParams(location.search);
      const tema = q.get("tema"), modo = q.get("modo");
      if (tema === "grafito" || tema === "sotos") { s.skin = tema; if (["#c4532f", "#60b25e"].includes(s.accent)) s.accent = tema === "grafito" ? "#60b25e" : "#c4532f";
        const isPhoto = String(s.wallpaper).startsWith("foto-");
        if (tema === "grafito" && !isPhoto && !String(s.wallpaper).startsWith("file:")) s.wallpaper = "foto-usaquen";
        if (tema === "sotos" && isPhoto) s.wallpaper = "paramo"; }
      if (eraOf(tema)) { s.skin = tema; s.accent = eraOf(tema).accent; if (!String(s.wallpaper).startsWith("file:")) s.wallpaper = eraOf(tema).wall; } // ?tema=prado|cristal|vidrio|mosaico|aluminio
      if (modo === "oscuro" || modo === "claro") s.theme = modo === "oscuro" ? "dark" : "light";
      if (tema || modo) { try { localStorage.setItem("sotos", JSON.stringify(s)); } catch {}
        q.delete("tema"); q.delete("modo"); const rest = q.toString(); history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash); } // queda guardado; la dirección vuelve a quedar limpia
      return s;
    } catch { return DEFAULTS; }
  });
  const [profile, setProfileR] = useSh(() => { try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem("sotos_profile") || "{}") }; } catch { return { ...DEFAULT_PROFILE }; } });
  const [dockCfg, setDockCfg] = useSh(() => {
    let d; try { d = JSON.parse(localStorage.getItem("sotos_dock")); } catch {}
    if (!d) return [...DOCK_IDS];
    // apps nuevas (v2.1): añadirlas una sola vez a docks ya personalizados
    if (!localStorage.getItem("sotos_dock_v21")) {
      if (!d.includes("worlds")) d.splice(Math.max(1, d.indexOf("files") + 1), 0, "worlds");
      if (!d.includes("contacts")) d.splice(Math.max(1, d.indexOf("mail") + 1), 0, "contacts");
      try { localStorage.setItem("sotos_dock_v21", "1"); } catch {}
    }
    if (!localStorage.getItem("sotos_dock_v22")) { // Calendario y Tareas (v2.2)
      for (const id of ["tasks", "calendar"]) if (!d.includes(id)) d.splice(Math.max(1, d.indexOf("worlds") + 1), 0, id);
      try { localStorage.setItem("sotos_dock_v22", "1"); } catch {}
    }
    return d;
  });
  const [shortcuts, setShortcuts] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_sc")) || [...DEFAULT_SHORTCUTS]; } catch { return [...DEFAULT_SHORTCUTS]; } });
  const [widgets, setWidgets] = useSh(() => {
    const right = (i) => ({ x: window.innerWidth - 196, y: 48 + i * 196 });
    let ws; try { ws = JSON.parse(localStorage.getItem("sotos_widgets")); } catch {}
    ws = ws || [{ id: "w1", type: "clock" }, { id: "w2", type: "weather" }];
    // los widgets sin posición (o pegados a la esquina, sobre los iconos) van a la columna derecha
    return ws.map((w, i) => (!w.x && !w.y) || w.x < 120 ? { ...w, ...right(i) } : w);
  });
  const [notes, setNotes] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_notes")) || {}; } catch { return {}; } });
  const [wins, setWins] = useSh([]);
  useVfs(s => s.rev); // re-render ante cambios de archivos (títulos de ventana)
  const [stage, setStage] = useSh("boot");
  const quickBoot = useRh(!!localStorage.getItem("sotos_in"));
  const [env, setEnv] = useSh({ server: false, registration: "open" });
  const user = useVfs(s => s.user);
  const lastUser = (() => { try { return JSON.parse(localStorage.getItem("sotos_last_user")); } catch { return null; } })();
  const [spot, setSpot] = useSh(false);
  const [start, setStart] = useSh(false); // menú Inicio / pantalla de mosaicos (temas de época)
  const [acct, setAcct] = useSh(null); // panel de la cuenta (clic en la foto): dónde se abre
  const [shareId, setShareId] = useSh(null);
  const [sendId, setSendId] = useSh(null), [versionsId, setVersionsId] = useSh(null);
  useEh(() => { const f = (e) => setVersionsId(e.detail); window.addEventListener("sotos-versions", f); return () => window.removeEventListener("sotos-versions", f); }, []);
  const [moveIds, setMoveIds] = useSh(null);
  useEh(() => { const f = (e) => { setDockCfg(d => d.includes("f:" + e.detail) ? d : [...d, "f:" + e.detail]); toast(`Carpeta «${vfs.node(e.detail)?.name}» agregada al Dock`, { icon: "create_new_folder" }); }; window.addEventListener("sotos-dock-folder", f); return () => window.removeEventListener("sotos-dock-folder", f); }, []);
  useEh(() => { const f = (e) => setMoveIds(e.detail); window.addEventListener("sotos-moveto", f); return () => window.removeEventListener("sotos-moveto", f); }, []);
  useEh(() => { const f = (e) => setSendId(e.detail); window.addEventListener("sotos-sendto", f); return () => window.removeEventListener("sotos-sendto", f); }, []);
  const [demoWelcome, setDemoWelcome] = useSh(() => { try { return !localStorage.getItem("sotos_demo_seen"); } catch { return true; } });
  const zTop = useRh(10);

  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const update = useCh((k, v) => setSettings(s => { const n = { ...s, [k]: v }; save("sotos", n); return n; }), []);
  const setProfile = useCh((p) => setProfileR(prev => { const n = { ...prev, ...p }; save("sotos_profile", n); return n; }), []);
  useEh(() => save("sotos_dock", dockCfg), [dockCfg]);
  const dockCfgRef = useRh(dockCfg); dockCfgRef.current = dockCfg;
  useEh(() => save("sotos_sc", shortcuts), [shortcuts]);
  useEh(() => save("sotos_widgets", widgets), [widgets]);
  useEh(() => save("sotos_notes", notes), [notes]);

  const widgetApi = {
    add: (type) => setWidgets(ws => [...ws, { id: "w" + Date.now().toString(36), type, x: window.innerWidth - 220, y: 60 + (ws.length % 4) * 180 }]),
    remove: (id) => setWidgets(ws => ws.filter(w => w.id !== id)),
    move: (id, x, y) => setWidgets(ws => ws.map(w => w.id === id ? { ...w, x, y } : w)),
  };
  const setNote = (id, v) => setNotes(n => ({ ...n, [id]: v }));

  setRegion(settings.region); // la región la leen fmtDate, el reloj y los nombres de archivo
  useEh(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", settings.theme);
    r.setAttribute("data-skin", baseSkin(settings.skin || "sotos"));
    if (eraOf(settings.skin)?.base) r.setAttribute("data-variant", settings.skin); else r.removeAttribute("data-variant"); // Núcleo: estructura de Prado con su arte
    setBrandLogo(settings.logo);
    r.setAttribute("data-wallgray", settings.skin === "grafito" && settings.wallGray !== false ? "1" : "0");
    r.style.setProperty("--accent", settings.accent);
    r.style.setProperty("--ui", `"${settings.font}", system-ui, sans-serif`);
    Object.entries(WIN_STYLES[settings.winStyle]).forEach(([k, v]) => r.style.setProperty(k, v));
    if (settings.skin === "grafito" || eraOf(settings.skin)) ["--win-radius", "--win-shadow", "--win-border", "--ui"].forEach(k => r.style.removeProperty(k)); // las épocas traen sus propias ventanas y letra
  }, [settings.theme, settings.accent, settings.font, settings.winStyle, settings.skin, settings.wallGray, settings.logo]);

  // fondo: degradado de la lista o imagen del usuario ("file:<id>")
  const wallFileId = String(settings.wallpaper).startsWith("file:") ? settings.wallpaper.slice(5) : null;
  const fileWall = useObjectUrl(stage !== "boot" ? wallFileId : null);
  const wallId = wallFileId ? null : (isWall(settings.wallpaper) ? settings.wallpaper : "paramo");
  const [artWall, setArtWall] = useSh(null);
  useEh(() => { let live = true; if (wallId) wallUrl(wallId).then(u => live && setArtWall(u)); return () => { live = false; }; }, [wallId]);
  const wallSrc = wallFileId ? fileWall : artWall;
  const wallpaper = { css: wallSrc ? `center / cover no-repeat url("${wallSrc}"), var(--wall-fallback)` : "var(--wall-fallback)" };

  const dockApi = {
    remove: (id) => setDockCfg(d => d.filter(x => x !== id)),
    add: (id) => setDockCfg(d => d.includes(id) ? d : [...d, id]),
    insert: (id, i) => setDockCfg(d => { const x = d.filter(v => v !== id); x.splice(Math.min(i, x.length), 0, id); return x; }),
    has: (id) => dockCfgRef.current.includes(id),
    reorder: (arr) => setDockCfg(arr),
  };
  const scApi = {
    add: (sc) => setShortcuts(s => [...s, sc]),
    remove: (name) => setShortcuts(s => s.filter(x => x.name !== name)),
  };

  const focus = useCh((id) => setWins(ws => ws.map(w => w.id === id ? { ...w, z: ++zTop.current, minimized: false } : w)), []);
  const openApp = useCh((appId, payload) => {
    if (!APP_BY_ID[appId]) return; playUi("abrir");
    if (!appAllowed(appId, vfs.getState().user)) { toast(APP_BY_ID[appId].adminOnly ? "Solo para administradores" : "El administrador ocultó esta app para tu cuenta", { error: true }); return; }
    setWins(ws => {
      const key = appId + (payload && payload.fileId ? ":" + payload.fileId : "") + (payload && payload.url ? ":" + payload.url : "") + (payload && payload.sharedNode ? ":s" + payload.sharedNode.id : "");
      const existing = ws.find(w => w.key === key);
      if (existing) return ws.map(w => w.id === existing.id ? { ...w, z: ++zTop.current, minimized: false, payload: payload || w.payload } : w);
      const app = APP_BY_ID[appId]; const n = ws.length;
      const w = Math.min(app.size.w, window.innerWidth - 80);
      const h = Math.min(app.size.h, window.innerHeight - 90);
      return [...ws, { id: appId + "-" + Date.now(), key, appId, payload: payload || null,
        x: Math.max(20 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--desk-left")) || 0), (window.innerWidth - w) / 2 + (n % 5) * 26 - 60),
        y: Math.max(46, (window.innerHeight - h) / 2 + (n % 5) * 22 - 40),
        w, h, z: ++zTop.current, minimized: false, maximized: false }];
    });
  }, []);
  // cerrar: primero la animación de salida, luego se quita del estado
  const closing = useRh(new Set());
  const close = id => { if (closing.current.has(id)) return; closing.current.add(id); playUi("cerrar"); animateWinOut(id).then(() => { closing.current.delete(id); setWins(ws => ws.filter(w => w.id !== id)); }); };
  const min = id => { playUi("minimizar"); setWins(ws => ws.map(w => w.id === id ? { ...w, minimized: true } : w)); };
  const max = id => { playUi("maximizar"); setWins(ws => ws.map(w => w.id === id ? { ...w, maximized: !w.maximized } : w)); };
  const setRect = (id, patch) => setWins(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w));
  const winAction = useCh((id, a) => {
    if (a === "close") return close(id);
    if (a === "min") return setWins(ws => ws.map(w => w.id === id ? { ...w, minimized: true } : w));
    if (a === "max") return setWins(ws => ws.map(w => w.id === id ? { ...w, maximized: !w.maximized } : w));
    const cs = getComputedStyle(document.documentElement), L = parseInt(cs.getPropertyValue("--desk-left")) || 0, B = parseInt(cs.getPropertyValue("--desk-bottom")) || 84;
    const half = Math.floor((window.innerWidth - L) / 2), top = 30, h = window.innerHeight - top - B;
    animateWinGeometry(id);
    setWins(ws => ws.map(w => w.id === id ? { ...w, maximized: false, minimized: false, x: a === "left" ? L : L + half, y: top, w: half, h, z: ++zTop.current } : w));
  }, []);

  // abrir un nodo del sistema de archivos con la app adecuada
  Vault.useVaultGesture(openApp); // 5 pulsaciones al logo de Aplicaciones abren la bóveda secreta
  const defaultsRef = useRh({}); defaultsRef.current = settings.defaults || {}; // Panel de control → Programas predeterminados
  const openItem = useCh((n) => {
    if (!n) return;
    if (n.type === "folder") return openApp("files", { folderId: n.id });
    const ext = vfs.extOf(n.name), usable = (id) => APP_BY_ID[id] && appAllowed(id, vfs.getState().user);
    const pref = defaultsRef.current[ext];
    if (pref && usable(pref)) return openApp(pref, { fileId: n.id });
    const app = ROUTE[n.type] || APPS.find(a => a.ext && a.opens?.includes(ext) && usable(a.id))?.id; // sin app propia: la primera app del SDK que lo abre
    if (app) return openApp(app, { fileId: n.id });
    toast(`No hay una app para abrir “${n.name}”`, { icon: "help", action: { label: "Descargar", run: () => vfs.download(n.id) } });
  }, [openApp]);
  // abrir el destino de una notificación: un mundo (y pestaña) o algo compartido conmigo
  const openLink = useCh((link) => {
    if (!link) return;
    if (link.update) return openUpdate();
    if (link.inbox) return openApp("files", { place: "inbox", nonce: Date.now() });
    if (link.app === "calendar") return openApp("calendar", { date: link.date, nonce: Date.now() });
    if (link.app === "tasks") return openApp("tasks", { list: link.list, nonce: Date.now() });
    if (link.app && APP_BY_ID[link.app]) return openApp(link.app); // avisos del sistema (papelera, espacio)
    if (link.world) return openApp("worlds", { worldId: link.world, tab: link.tab || "wall", nonce: Date.now() });
    if (link.share) {
      const app = { docx: "docs", xlsx: "sheets", csv: "sheets", pptx: "slides" }[link.node?.type];
      if (app) return openApp(app, { share: link.share, sharedNode: link.node, fileId: "share:" + link.share });
      window.open(`${location.origin}${location.pathname}#/s/${link.share}`, "_blank", "noopener");
    }
  }, [openApp]);
  // «Actualizar Sotos» se abre desde cualquier parte con openUpdate()
  const [updOpen, setUpdOpen] = useSh(false);
  useEh(() => { const f = () => setUpdOpen(true); window.addEventListener("sotos-update", f); return () => window.removeEventListener("sotos-update", f); }, []);
  // tocar un aviso del celular o del computador (service worker) abre el lugar del aviso
  useEh(() => {
    const f = (e) => openLink(e.detail); window.addEventListener("sotos-open-link", f);
    const m = /^#abrir=(.+)$/.exec(location.hash); if (m && stage === "desktop") { try { openLink(JSON.parse(decodeURIComponent(m[1]))); } catch {} history.replaceState(null, "", location.pathname + location.search); }
    return () => window.removeEventListener("sotos-open-link", f);
  }, [openLink, stage]);

  // nuevos documentos en blanco (archivos Office válidos desde el primer momento)
  const newDoc = useCh(async (kind) => {
    const docs = vfs.resolve("/Documentos") || vfs.getState().root;
    const { blankFile } = await import("./office.js");
    const { name, blob } = await blankFile(kind);
    const id = await vfs.create(docs.id, name, blob);
    openItem(vfs.node(id));
  }, [openItem]);

  useEh(() => {
    if (stage !== "desktop") return;
    if (!wins.length) openApp("files");
    prefetchApps();
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === " " || e.key.toLowerCase() === "k")) { e.preventDefault(); setSpot(s => !s); } };
    const o = (e) => openItem(vfs.node(e.detail));
    const sh = (e) => setShareId(e.detail);
    const sp = () => setSpot(true);
    const ow = (e) => e.detail?.app && openApp(e.detail.app, e.detail.payload || { fileId: e.detail.fileId }); // "abrir con" desde el menú contextual
    window.addEventListener("sotos-open-with", ow);
    document.addEventListener("keydown", k); window.addEventListener("sotos-open", o); window.addEventListener("sotos-share", sh); window.addEventListener("sotos-spotlight", sp);
    return () => { document.removeEventListener("keydown", k); window.removeEventListener("sotos-open", o); window.removeEventListener("sotos-open-with", ow); window.removeEventListener("sotos-share", sh); window.removeEventListener("sotos-spotlight", sp); };
  }, [stage]);

  // arranque: ¿hay servidor? ¿hay sesión? → nube; si no, invitado recordado o pantalla de acceso
  const bootTask = useCh(async () => { const r = await bootInner(); try { vfs.migrateSampleVideos(); } catch {} await loadInstalled().catch(() => {}); return r; }, []);
  const [, reInstalled] = useSh(0);
  useEh(() => subscribeInstalled(() => reInstalled(x => x + 1)), []);
  const bootInner = useCh(async () => {
    if (DEMO) { await vfs.init(); localStorage.setItem("sotos_in", "1"); return "desktop"; } // demo: directo al escritorio, como invitado
    const server = await hasServer();
    let me = null, registration = "open", canRecover = false;
    if (server) { try { const r = await api("GET", "auth/me"); me = r.user; registration = r.registration; canRecover = !!r.canRecover; } catch {} }
    const resetToken = server ? new URLSearchParams(location.search).get("restablecer") : null; // enlace del correo de recuperación
    setEnv({ server, registration, canRecover, resetToken });
    if (resetToken) return "login";
    if (me) { await vfs.init({ user: me }); return "desktop"; }
    if (quickBoot.current && localStorage.getItem("sotos_mode") !== "cloud") { await vfs.init(); return "desktop"; }
    return "login";
  }, []);
  const enterAccount = useCh(async (u) => {
    await vfs.init({ user: u });
    localStorage.setItem("sotos_in", "1"); localStorage.setItem("sotos_mode", "cloud");
    localStorage.setItem("sotos_last_user", JSON.stringify({ name: u.name, email: u.email }));
    setProfile({ name: u.name, avatar: u.avatar || null }); setWins([]); setStage("desktop");
  }, []);
  const enterGuest = useCh(async () => {
    await vfs.init();
    localStorage.setItem("sotos_in", "1"); localStorage.setItem("sotos_mode", "guest");
    setWins([]); setStage("desktop");
  }, []);
  useEh(() => { const h = () => logoutRef.current?.(); window.addEventListener("sotos-ir-a-login", h); return () => window.removeEventListener("sotos-ir-a-login", h); }, []);
  const logoutRef = useRh(null);
  const logout = useCh(async () => {
    if (vfs.getState().mode === "cloud") { await vfs.flush().catch(() => {}); await api("POST", "auth/logout").catch(() => {}); }
    localStorage.removeItem("sotos_in"); setWins([]); quickBoot.current = false; setStage("login");
  }, []);

  // temas de época: sonido al entrar y al salir, mosaicos al entrar (Mosaico), Ctrl+Esc abre Inicio, «abrir» desde el menú Inicio
  const prevStage = useRh(stage);
  useEh(() => {
    const era = eraOf(settings.skin);
    if (era && stage === "desktop" && prevStage.current !== "desktop") { playEra(era.sound, "entrar"); if (era.start === "screen") setStart(true); }
    if (era && stage === "login" && prevStage.current === "desktop") playEra(era.sound, "salir");
    if (stage !== "desktop") setStart(false);
    prevStage.current = stage;
  }, [stage]);
  useEh(() => { setStart(false); }, [settings.skin]);
  useEh(() => {
    const key = (e) => { if (e.ctrlKey && e.key === "Escape" && isWinSkin(document.documentElement.dataset.skin)) { e.preventDefault(); setStart(s => !s); } };
    const open = (e) => openItem(e.detail);
    document.addEventListener("keydown", key); window.addEventListener("sotos-open-item", open);
    return () => { document.removeEventListener("keydown", key); window.removeEventListener("sotos-open-item", open); };
  }, [openItem]);
  const taskWin = useCh((a, id) => {
    if (a === "desktop") return setWins(ws => ws.map(w => ({ ...w, minimized: true })));
    if (a === "min") return min(id);
    focus(id);
  }, []);

  // gancho de automatización (capturas y pruebas de extremo a extremo); solo en desarrollo
  useEh(() => {
    if (!import.meta.env.DEV) return;
    window.__sotos = { vfs, openApp, openItem, winAction, update, setWins, spotlight: setSpot, share: setShareId };
  });

  const running = new Set(wins.map(w => w.appId));
  const inboxCount = useInboxCount(), worldsUnread = Worlds.useWorldsUnread();
  const badges = { files: inboxCount, worlds: worldsUnread };
  // apps cuyas ventanas están todas minimizadas: el indicador del dock se encoge y se pone gris
  const minimizedApps = new Set([...running].filter(a => wins.filter(w => w.appId === a).every(w => w.minimized)));
  const top = wins.reduce((a, b) => (!a || b.z > a.z) && !b.minimized ? b : a, null);
  const activeApp = top ? APP_BY_ID[top.appId] : null;

  const shownProfile = user ? { ...profile, name: user.name, avatar: profile.avatar || user.avatar || null } : profile;
  logoutRef.current = logout;
  const storeProps = { openApp, openItem, newDoc, settings, update, profile: shownProfile, setProfile, shortcuts, scApi, dockApi, dockCfg, user, env, onLogout: logout, openSpotlight: () => setSpot(true) };

  if (stage === "boot") return <BootScreen quick={quickBoot.current} task={bootTask} onDone={(s) => setStage(s)} />;
  if (stage === "login") return <LoginScreen wallpaper={wallpaper} server={env.server} registration={env.registration} canRecover={env.canRecover} resetToken={env.resetToken} lastUser={lastUser} onAccount={enterAccount} onGuest={enterGuest} />;

  return (
    <div id="os" data-screen-label="Escritorio">
      <div className="wallpaper" style={{ background: wallpaper.css }} />
      <Desktop shifted={settings.dock === "left" || settings.skin === "grafito"} openApp={openApp} openItem={openItem} settings={settings} update={update} widgetApi={widgetApi} />
      {widgets.map(w => (
        <Widget key={w.id} w={w} note={notes[w.id]} onNote={setNote}
          onMove={widgetApi.move} onClose={widgetApi.remove} onOpen={openItem} />
      ))}
      {wins.map(win => {
        const app = APP_BY_ID[win.appId];
        const Comp = APP_COMPONENTS[app.comp];
        const extra = { ...storeProps, ...(win.payload || {}), winId: win.id, appId: win.appId, setWinTitle: (t) => setRect(win.id, { customTitle: t ? String(t).slice(0, 80) : null }), closeWin: () => close(win.id) };
        const fnode = win.payload && win.payload.fileId ? vfs.node(win.payload.fileId) : null;
        const title = win.customTitle ? win.customTitle : fnode ? fnode.name : win.payload?.sharedNode ? win.payload.sharedNode.name + " · compartido" : (win.payload && win.payload.scName) ? win.payload.scName : app.name;
        return (
          <Win key={win.id} win={{ ...win, title }} app={app} focused={top && top.id === win.id}
            onFocus={() => focus(win.id)} onClose={() => close(win.id)} onMin={() => min(win.id)} onMax={() => max(win.id)}
            onMove={(x, y) => setRect(win.id, { x, y })} onResize={(w, h) => setRect(win.id, { w, h })}>
            {Comp ? <AppGuard name={app.name} onClose={() => close(win.id)}><React.Suspense fallback={<div className="app app-loading"><Ic name="progress_activity" size={26} /></div>}><Comp {...extra} /></React.Suspense></AppGuard> : <EmptyState icon="error" text={"App no encontrada: " + app.comp} />}
          </Win>
        );
      })}
      {isWinSkin(settings.skin) ? <>
        <Taskbar skin={baseSkin(settings.skin)} wins={wins} topId={top?.id} order={dockCfg} running={running} badges={badges} profile={shownProfile} settings={settings}
          startOpen={start} onStart={() => { if (!start) playUi("inicio"); setStart(s => !s); }} onApp={(id) => { setStart(false); openApp(id); }} onWin={taskWin} onLogout={logout} onSearch={() => setSpot(true)}
          tray={<><NotificationBell onOpenLink={openLink} /><TransfersIndicator /><SyncIndicator /><BatteryIndicator /></>} />
        {start && eraOf(settings.skin).start === "menu" && <StartMenu skin={baseSkin(settings.skin)} profile={shownProfile} order={dockCfg} onApp={openApp} onOpenFolder={(id) => openApp("files", { folderId: id, nonce: Date.now() })} onLogout={logout} onClose={() => setStart(false)} onSearchAll={() => setSpot(true)} onAccount={() => { setStart(false); setAcct("bottom-left"); }} />}
        {start && eraOf(settings.skin).start === "screen" && <StartScreen profile={shownProfile} order={dockCfg} badges={badges} wallSrc={wallSrc} onApp={(id) => { setStart(false); openApp(id); }} onDesktop={() => setStart(false)} onLogout={logout} onAccount={() => setAcct("top-right")} />}
      </> : <>
        <MenuBar activeApp={activeApp} settings={settings} update={update} profile={shownProfile} onApp={openApp} onNew={newDoc} onLogout={logout} onSearch={() => setSpot(true)} onOpenLink={openLink} onAccount={() => setAcct(a => a ? null : "top-right")} />
        <Dock position={settings.skin === "grafito" ? "left rail" : settings.skin === "aluminio" ? "bottom shelf" : settings.dock} order={dockCfg} running={running} minimized={minimizedApps} badges={badges} onApp={openApp} dockApi={dockApi} />
      </>}
      {acct && <AccountPanel profile={shownProfile} anchor={acct} onClose={() => setAcct(null)} onApp={openApp} onLogout={logout} />}
      {spot && <Spotlight onOpen={openItem} onApp={openApp} onClose={() => setSpot(false)} />}
      {shareId && <ShareDialog id={shareId} onClose={() => setShareId(null)} />}
      {sendId && <SendToDialog nodeId={sendId} onClose={() => setSendId(null)} />}
      {moveIds && <MoveToDialog ids={moveIds} onClose={() => setMoveIds(null)} />}
      {versionsId && <VersionsDialog id={versionsId} onClose={() => setVersionsId(null)} />}
      <GlobalContextMenu openApp={openApp} winAction={winAction} />
      {DEMO && demoWelcome && <DemoWelcome onApp={openApp} onClose={() => { setDemoWelcome(false); try { localStorage.setItem("sotos_demo_seen", "1"); } catch {} }} />}
      {updOpen && <UpdateDialog onClose={() => setUpdOpen(false)} />}
      <UpdatePrompt user={user} />
      <Toasts />
      <FilePickerHost />
    </div>
  );
}

export { OS };
