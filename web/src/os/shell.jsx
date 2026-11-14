/* ============================================================
   Sotos OS — shell: boot, login, menu bar, dock, window manager
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { APPS, APP_BY_ID, DOCK_IDS, ROUTE, WALLPAPERS, DEFAULT_SHORTCUTS } from "./data.jsx";
import { SotosLogo } from "./logo.jsx";
import { Tile, Ic, Win, EmptyState, FileGlyph, ContextMenu, Avatar, toast, Toasts } from "./ui.jsx";
import { WIDGET_TYPES, Widget } from "./widgets.jsx";
import * as vfs from "./vfs.js";
import { useVfs, DESKTOP } from "./vfs.js";
import { NodeGlyph, dragIds, dropTarget, itemMenu, runItemAction, PropertiesModal, useObjectUrl, ShareDialog } from "./files-ui.jsx";
import { LoginScreen } from "./auth-ui.jsx";
import { api, hasServer } from "./api.js";
import * as Apps1 from "./apps1.jsx";
import * as Apps2 from "./apps2.jsx";
import * as Apps3 from "./apps3.jsx";
import * as Apps4 from "./apps4.jsx";
import * as Apps5 from "./apps5.jsx";
import * as Games from "./games.jsx";
import * as Term from "./terminal.jsx";

// registro de componentes de app (antes se resolvían con window[app.comp])
const APP_COMPONENTS = { ...Apps1, ...Apps2, ...Apps3, ...Apps4, ...Apps5, ...Games, ...Term };
const DEFAULT_PROFILE = { name: "Invitado", avatar: null };
const { useState: useSh, useEffect: useEh, useRef: useRh, useCallback: useCh } = React;

const DEFAULTS = { theme: "light", accent: "#2f6fed", wallpaper: "azure", dock: "bottom", font: "Onest", winStyle: "soft", clock24: true };
const WIN_STYLES = {
  soft:  { "--win-radius": "12px", "--win-shadow": "0 18px 50px -12px rgba(16,24,40,.4), 0 4px 12px -4px rgba(16,24,40,.2)", "--win-border": "1px solid var(--border)" },
  sharp: { "--win-radius": "4px",  "--win-shadow": "0 14px 40px -14px rgba(16,24,40,.45)", "--win-border": "1px solid var(--border-strong)" },
  flat:  { "--win-radius": "10px", "--win-shadow": "0 0 0 1px var(--border)", "--win-border": "1px solid var(--border-strong)" },
};

/* -------------------- Menu bar -------------------- */
function MenuBar({ activeApp, settings, update, profile, onApp, onNew, onLogout, onSearch }) {
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
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: !settings.clock24 });
  const date = now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

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
      <div className="brand" onClick={() => onApp("settings")} style={{ cursor: "pointer" }}><SotosLogo size={19} badge={false} />Sotos</div>
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
        <div className="ti" title="Buscar" onClick={onSearch}><Ic name="search" /></div>
        <SyncIndicator />
        <BatteryIndicator />
        <div className="ti" title="Cerrar sesión" onClick={onLogout}><Ic name="power_settings_new" /></div>
        <div className="ti" title="Mi perfil" onClick={() => onApp("settings")} style={{ padding: "0 4px" }}><Avatar profile={profile} size={20} /></div>
        <div className="ti clock" onMouseDown={e => e.stopPropagation()} onClick={() => { setCal(c => !c); setMenu(null); }}>
          <span style={{ textTransform: "capitalize" }}>{date}</span> &nbsp;{time}
        </div>
        {cal && <CalendarPopover now={now} month={calMonth} setMonth={setCalMonth} clock24={settings.clock24} />}
      </div>
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
function Dock({ position, order, running, onApp, dockApi }) {
  const [ctx, setCtx] = useSh(null);
  const drag = useRh(null);
  const onDrop = (i) => {
    const from = drag.current; if (from == null || from === i) return;
    const arr = [...order]; const [m] = arr.splice(from, 1); arr.splice(i, 0, m); dockApi.reorder(arr);
    drag.current = null;
  };
  return (
    <div className={"dock " + position}>
      {order.map((id, i) => {
        if (id === "__div__") return <div key={"d" + i} className="divider" />;
        const app = APP_BY_ID[id]; if (!app) return null;
        return (
          <button key={id} className="dock-item" draggable
            onClick={() => onApp(id)}
            onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, id }); }}
            onDragStart={() => { drag.current = i; }}
            onDragOver={e => e.preventDefault()} onDrop={() => onDrop(i)}>
            <Tile icon={app.icon} color={app.color} />
            <span className="dock-tip">{app.name}</span>
            {running.has(id) && <span className="run-dot" />}
          </button>
        );
      })}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y}
        items={[{ id: "remove", label: "Quitar del Dock", icon: "remove_circle", danger: true }]}
        onSelect={() => dockApi.remove(ctx.id)} onClose={() => setCtx(null)} />}
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
    { id: "files", icon: "folder", color: "#4a90e2", label: "Archivos" },
    { id: "browser", icon: "language", color: "#0aa5b5", label: "Navegador" },
    { id: "launchpad", icon: "apps", color: "#0a84ff", label: "Aplicaciones" },
  ];
  const EMPTY = [
    { id: "newfolder", label: "Nueva carpeta", icon: "create_new_folder" },
    { id: "newtxt", label: "Nuevo documento de texto", icon: "note_add" },
    ...(clipboard ? [{ id: "paste", label: `Pegar (${clipboard.ids.length})`, icon: "content_paste" }] : []),
    { sep: true },
    { id: "widget", label: "Añadir widget", icon: "widgets" },
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
    else if (id === "wall") openApp("settings");
    else if (id === "theme") update("theme", settings.theme === "dark" ? "light" : "dark");
    else if (id === "emptytrash") vfs.emptyTrash();
  };
  const helpers = { openItem, update, startRename, showProps: setProps, parentId: DESKTOP };

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
    <div className="desk-layer" {...dropTarget(DESKTOP)}
      onMouseDown={e => { if (e.target === e.currentTarget || e.target.classList.contains("desk-icons")) setSel(null); }}
      onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item: null }); }}>
      <div className="desk-icons" style={{ left: shifted ? 92 : 14 }}>
        {apps.map(ic => (
          <div key={ic.label} className="desk-icon" onDoubleClick={() => openApp(ic.id)}>
            <Tile icon={ic.icon} color={ic.color} /><span className="lbl">{ic.label}</span>
          </div>
        ))}
        {items.map(it => (
          <div key={it.id} className={"desk-icon" + (sel === it.id ? " sel" : "") + (clipboard?.mode === "cut" && clipboard.ids.includes(it.id) ? " cut" : "")}
            draggable={renaming !== it.id}
            onDragStart={e => dragIds(e, [it.id])}
            {...(it.type === "folder" ? dropTarget(it.id) : {})}
            onMouseDown={() => setSel(it.id)}
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
        <div className={"desk-icon desk-trash" + (trashHot ? " sel" : "")} onDoubleClick={() => openApp("trash")}
          onDragOver={e => { if ([...e.dataTransfer.types].includes("application/x-sotos-ids")) { e.preventDefault(); setTrashHot(true); } }}
          onDragLeave={() => setTrashHot(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setTrashHot(false); try { const ids = JSON.parse(e.dataTransfer.getData("application/x-sotos-ids")); runItemAction("trash", ids.map(vfs.node).filter(Boolean), helpers); } catch {} }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item: null }); }}>
          <div style={{ position: "relative" }}>
            <Tile icon={trashCount ? "delete" : "delete_outline"} color="#7d8590" />
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
      <div className="boot-logo"><SotosLogo size={120} animate badge={false} /></div>
      <div className="boot-name">Sotos</div>
      {!err && <div className="boot-bar"><div className="boot-fill" /></div>}
      <div className="boot-tag">{err ? "No se pudo iniciar el almacenamiento: " + err : slow ? "Preparando tus archivos por primera vez…" : "tu ordenador en la nube"}</div>
      {err && <button className="tb-btn" style={{ marginTop: 14 }} onClick={() => location.reload()}>Reintentar</button>}
    </div>
  );
}


/* -------------------- Spotlight search -------------------- */
function Spotlight({ onOpen, onApp, onClose }) {
  const [q, setQ] = useSh("");
  const [hi, setHi] = useSh(0);
  const ql = q.trim().toLowerCase();
  const results = ql ? [
    ...APPS.filter(a => a.id !== "web" && a.name.toLowerCase().includes(ql)).slice(0, 5).map(a => ({ kind: "app", app: a })),
    ...vfs.search(ql, 12).map(n => ({ kind: "file", node: n })),
  ] : [];
  const go = (r) => { if (!r) return; r.kind === "app" ? onApp(r.app.id) : onOpen(r.node); onClose(); };
  useEh(() => { const esc = e => e.key === "Escape" && onClose(); document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, []);
  useEh(() => setHi(0), [q]);
  return (
    <div className="spot-overlay" onMouseDown={onClose}>
      <div className="spot" onMouseDown={e => e.stopPropagation()}>
        <div className="spot-input"><Ic name="search" size={22} />
          <input autoFocus placeholder="Buscar apps, archivos y carpetas…" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); } if (e.key === "Enter") go(results[hi]); }} /></div>
        {!!results.length && <div className="spot-results">
          {results.map((r, i) => (
            <div key={i} className={"spot-row" + (i === hi ? " hi" : "")} onMouseEnter={() => setHi(i)} onClick={() => go(r)}>
              {r.kind === "app" ? <Tile icon={r.app.icon} color={r.app.color} size={28} /> : <NodeGlyph node={r.node} size={26} />}
              <div><div className="spot-name">{r.kind === "app" ? r.app.name : r.node.name}</div>
                <div className="spot-path">{r.kind === "app" ? "Aplicación" : ["Sotos Drive", ...vfs.pathOf(r.node.id).slice(0, -1).map(p => p.name)].join(" › ")}</div></div>
            </div>
          ))}
        </div>}
        {q.trim() && !results.length && <div className="spot-empty">Sin resultados para “{q}”</div>}
      </div>
    </div>
  );
}

/* ============================================================ */
function OS() {
  const [settings, setSettings] = useSh(() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("sotos") || "{}") }; } catch { return DEFAULTS; } });
  const [profile, setProfileR] = useSh(() => { try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem("sotos_profile") || "{}") }; } catch { return { ...DEFAULT_PROFILE }; } });
  const [dockCfg, setDockCfg] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_dock")) || [...DOCK_IDS]; } catch { return [...DOCK_IDS]; } });
  const [shortcuts, setShortcuts] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_sc")) || [...DEFAULT_SHORTCUTS]; } catch { return [...DEFAULT_SHORTCUTS]; } });
  const [widgets, setWidgets] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_widgets")) || [{ id: "w1", type: "clock", x: 0, y: 0 }, { id: "w2", type: "weather", x: 0, y: 0 }]; } catch { return []; } });
  const [notes, setNotes] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_notes")) || {}; } catch { return {}; } });
  const [wins, setWins] = useSh([]);
  useVfs(s => s.rev); // re-render ante cambios de archivos (títulos de ventana)
  const [stage, setStage] = useSh("boot");
  const quickBoot = useRh(!!localStorage.getItem("sotos_in"));
  const [env, setEnv] = useSh({ server: false, registration: "open" });
  const user = useVfs(s => s.user);
  const lastUser = (() => { try { return JSON.parse(localStorage.getItem("sotos_last_user")); } catch { return null; } })();
  const [spot, setSpot] = useSh(false);
  const [shareId, setShareId] = useSh(null);
  const zTop = useRh(10);

  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const update = useCh((k, v) => setSettings(s => { const n = { ...s, [k]: v }; save("sotos", n); return n; }), []);
  const setProfile = useCh((p) => setProfileR(prev => { const n = { ...prev, ...p }; save("sotos_profile", n); return n; }), []);
  useEh(() => save("sotos_dock", dockCfg), [dockCfg]);
  useEh(() => save("sotos_sc", shortcuts), [shortcuts]);
  useEh(() => save("sotos_widgets", widgets), [widgets]);
  useEh(() => save("sotos_notes", notes), [notes]);

  const widgetApi = {
    add: (type) => setWidgets(ws => [...ws, { id: "w" + Date.now().toString(36), type, x: window.innerWidth - 220, y: 60 + (ws.length % 4) * 180 }]),
    remove: (id) => setWidgets(ws => ws.filter(w => w.id !== id)),
    move: (id, x, y) => setWidgets(ws => ws.map(w => w.id === id ? { ...w, x, y } : w)),
  };
  const setNote = (id, v) => setNotes(n => ({ ...n, [id]: v }));

  useEh(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", settings.theme);
    r.style.setProperty("--accent", settings.accent);
    r.style.setProperty("--ui", `"${settings.font}", system-ui, sans-serif`);
    Object.entries(WIN_STYLES[settings.winStyle]).forEach(([k, v]) => r.style.setProperty(k, v));
  }, [settings.theme, settings.accent, settings.font, settings.winStyle]);

  // fondo: degradado de la lista o imagen del usuario ("file:<id>")
  const wallFileId = String(settings.wallpaper).startsWith("file:") ? settings.wallpaper.slice(5) : null;
  const wallUrl = useObjectUrl(stage !== "boot" ? wallFileId : null);
  const wallpaper = wallFileId
    ? { css: wallUrl ? `center / cover no-repeat url("${wallUrl}"), #1d3aa0` : "#1d3aa0" }
    : WALLPAPERS.find(w => w.id === settings.wallpaper) || WALLPAPERS[0];

  const dockApi = {
    remove: (id) => setDockCfg(d => d.filter(x => x !== id)),
    add: (id) => setDockCfg(d => d.includes(id) ? d : [...d, id]),
    reorder: (arr) => setDockCfg(arr),
  };
  const scApi = {
    add: (sc) => setShortcuts(s => [...s, sc]),
    remove: (name) => setShortcuts(s => s.filter(x => x.name !== name)),
  };

  const focus = useCh((id) => setWins(ws => ws.map(w => w.id === id ? { ...w, z: ++zTop.current, minimized: false } : w)), []);
  const openApp = useCh((appId, payload) => {
    if (!APP_BY_ID[appId]) return;
    setWins(ws => {
      const key = appId + (payload && payload.fileId ? ":" + payload.fileId : "") + (payload && payload.url ? ":" + payload.url : "");
      const existing = ws.find(w => w.key === key);
      if (existing) return ws.map(w => w.id === existing.id ? { ...w, z: ++zTop.current, minimized: false, payload: payload || w.payload } : w);
      const app = APP_BY_ID[appId]; const n = ws.length;
      const w = Math.min(app.size.w, window.innerWidth - 80);
      const h = Math.min(app.size.h, window.innerHeight - 90);
      return [...ws, { id: appId + "-" + Date.now(), key, appId, payload: payload || null,
        x: Math.max(20, (window.innerWidth - w) / 2 + (n % 5) * 26 - 60),
        y: Math.max(46, (window.innerHeight - h) / 2 + (n % 5) * 22 - 40),
        w, h, z: ++zTop.current, minimized: false, maximized: false }];
    });
  }, []);
  const close = id => setWins(ws => ws.filter(w => w.id !== id));
  const min = id => setWins(ws => ws.map(w => w.id === id ? { ...w, minimized: true } : w));
  const max = id => setWins(ws => ws.map(w => w.id === id ? { ...w, maximized: !w.maximized } : w));
  const setRect = (id, patch) => setWins(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w));

  // abrir un nodo del sistema de archivos con la app adecuada
  const openItem = useCh((n) => {
    if (!n) return;
    if (n.type === "folder") return openApp("files", { folderId: n.id });
    const app = ROUTE[n.type];
    if (app) return openApp(app, { fileId: n.id });
    toast(`No hay una app para abrir “${n.name}”`, { icon: "help", action: { label: "Descargar", run: () => vfs.download(n.id) } });
  }, [openApp]);
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
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === " " || e.key.toLowerCase() === "k")) { e.preventDefault(); setSpot(s => !s); } };
    const o = (e) => openItem(vfs.node(e.detail));
    const sh = (e) => setShareId(e.detail);
    document.addEventListener("keydown", k); window.addEventListener("sotos-open", o); window.addEventListener("sotos-share", sh);
    return () => { document.removeEventListener("keydown", k); window.removeEventListener("sotos-open", o); window.removeEventListener("sotos-share", sh); };
  }, [stage]);

  // arranque: ¿hay servidor? ¿hay sesión? → nube; si no, invitado recordado o pantalla de acceso
  const bootTask = useCh(async () => {
    const server = await hasServer();
    let me = null, registration = "open";
    if (server) { try { const r = await api("GET", "auth/me"); me = r.user; registration = r.registration; } catch {} }
    setEnv({ server, registration });
    if (me) { await vfs.init({ user: me }); return "desktop"; }
    if (quickBoot.current && localStorage.getItem("sotos_mode") !== "cloud") { await vfs.init(); return "desktop"; }
    return "login";
  }, []);
  const enterAccount = useCh(async (u) => {
    await vfs.init({ user: u });
    localStorage.setItem("sotos_in", "1"); localStorage.setItem("sotos_mode", "cloud");
    localStorage.setItem("sotos_last_user", JSON.stringify({ name: u.name, email: u.email }));
    setProfile({ name: u.name }); setWins([]); setStage("desktop");
  }, []);
  const enterGuest = useCh(async () => {
    await vfs.init();
    localStorage.setItem("sotos_in", "1"); localStorage.setItem("sotos_mode", "guest");
    setWins([]); setStage("desktop");
  }, []);
  const logout = useCh(async () => {
    if (vfs.getState().mode === "cloud") { await vfs.flush().catch(() => {}); await api("POST", "auth/logout").catch(() => {}); }
    localStorage.removeItem("sotos_in"); setWins([]); quickBoot.current = false; setStage("login");
  }, []);

  const running = new Set(wins.map(w => w.appId));
  const top = wins.reduce((a, b) => (!a || b.z > a.z) && !b.minimized ? b : a, null);
  const activeApp = top ? APP_BY_ID[top.appId] : null;

  const shownProfile = user ? { ...profile, name: user.name } : profile;
  const storeProps = { openApp, openItem, newDoc, settings, update, profile: shownProfile, setProfile, shortcuts, scApi, dockApi, dockCfg, user, env, onLogout: logout, openSpotlight: () => setSpot(true) };

  if (stage === "boot") return <BootScreen quick={quickBoot.current} task={bootTask} onDone={(s) => setStage(s)} />;
  if (stage === "login") return <LoginScreen wallpaper={wallpaper} server={env.server} registration={env.registration} lastUser={lastUser} onAccount={enterAccount} onGuest={enterGuest} />;

  return (
    <div id="os" data-screen-label="Escritorio">
      <div className="wallpaper" style={{ background: wallpaper.css }} />
      <Desktop shifted={settings.dock === "left"} openApp={openApp} openItem={openItem} settings={settings} update={update} widgetApi={widgetApi} />
      {widgets.map(w => (
        <Widget key={w.id} w={w} note={notes[w.id]} onNote={setNote}
          onMove={widgetApi.move} onClose={widgetApi.remove} />
      ))}
      {wins.map(win => {
        const app = APP_BY_ID[win.appId];
        const Comp = APP_COMPONENTS[app.comp];
        const extra = { ...storeProps, ...(win.payload || {}), winId: win.id };
        const fnode = win.payload && win.payload.fileId ? vfs.node(win.payload.fileId) : null;
        const title = fnode ? fnode.name : win.payload?.sharedNode ? win.payload.sharedNode.name + " · compartido" : (win.payload && win.payload.scName) ? win.payload.scName : app.name;
        return (
          <Win key={win.id} win={{ ...win, title }} app={app} focused={top && top.id === win.id}
            onFocus={() => focus(win.id)} onClose={() => close(win.id)} onMin={() => min(win.id)} onMax={() => max(win.id)}
            onMove={(x, y) => setRect(win.id, { x, y })} onResize={(w, h) => setRect(win.id, { w, h })}>
            {Comp ? <Comp {...extra} /> : <EmptyState icon="error" text={"App no encontrada: " + app.comp} />}
          </Win>
        );
      })}
      <MenuBar activeApp={activeApp} settings={settings} update={update} profile={shownProfile} onApp={openApp} onNew={newDoc} onLogout={logout} onSearch={() => setSpot(true)} />
      <Dock position={settings.dock} order={dockCfg} running={running} onApp={openApp} dockApi={dockApi} />
      {spot && <Spotlight onOpen={openItem} onApp={openApp} onClose={() => setSpot(false)} />}
      {shareId && <ShareDialog id={shareId} onClose={() => setShareId(null)} />}
      <Toasts />
    </div>
  );
}

export { OS };
