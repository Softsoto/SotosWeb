/* ============================================================
   Sotos OS — shell: boot, login, menu bar, dock, window manager
   ============================================================ */
import React from "react";
import { APP_BY_ID, DOCK_IDS, ROUTE, WALLPAPERS, FS, DEFAULT_SHORTCUTS } from "./data.jsx";
import { SotosLogo } from "./logo.jsx";
import { Tile, Ic, Win, EmptyState, FileGlyph, ContextMenu, Avatar } from "./ui.jsx";
import { WIDGET_TYPES, Widget } from "./widgets.jsx";
import * as Apps1 from "./apps1.jsx";
import * as Apps2 from "./apps2.jsx";
import * as Apps3 from "./apps3.jsx";
import * as Apps4 from "./apps4.jsx";
import * as Apps5 from "./apps5.jsx";
import * as Games from "./games.jsx";

// registro de componentes de app (antes se resolvían con window[app.comp])
const APP_COMPONENTS = { ...Apps1, ...Apps2, ...Apps3, ...Apps4, ...Apps5, ...Games };
const DEFAULT_PROFILE = { name: "Invitado", avatar: null };
const { useState: useSh, useEffect: useEh, useRef: useRh, useCallback: useCh } = React;

const DEFAULTS = { theme: "light", accent: "#2f6fed", wallpaper: "azure", dock: "bottom", font: "Onest", winStyle: "soft", clock24: true };
const WIN_STYLES = {
  soft:  { "--win-radius": "12px", "--win-shadow": "0 18px 50px -12px rgba(16,24,40,.4), 0 4px 12px -4px rgba(16,24,40,.2)", "--win-border": "1px solid var(--border)" },
  sharp: { "--win-radius": "4px",  "--win-shadow": "0 14px 40px -14px rgba(16,24,40,.45)", "--win-border": "1px solid var(--border-strong)" },
  flat:  { "--win-radius": "10px", "--win-shadow": "0 0 0 1px var(--border)", "--win-border": "1px solid var(--border-strong)" },
};
const jclone = (o) => JSON.parse(JSON.stringify(o));
const getNode = (root, path) => { let n = root; for (const name of path) { n = (n.children || []).find(c => c.name === name); if (!n) return null; } return n; };

/* -------------------- Menu bar -------------------- */
function MenuBar({ activeApp, settings, update, profile, onApp, onLogout, onSearch }) {
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
      { label: "Nuevo documento", icon: "description", act: () => onApp("docs") },
      { label: "Nueva hoja de cálculo", icon: "table_chart", act: () => onApp("sheets") },
      { sep: true },
      { label: "Cerrar sesión", icon: "power_settings_new", act: onLogout },
    ],
    Editar: [
      { label: "Buscar archivos…", icon: "search", act: onSearch },
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
        <div className="ti"><Ic name="wifi" /></div>
        <div className="ti"><Ic name="battery_horiz_075" /></div>
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
function Desktop({ shifted, items, trashCount, openApp, openItem, deskApi, trashApi, settings, update, fsApi, widgetApi }) {
  const [ctx, setCtx] = useSh(null);        // { x, y, item }  (item null = empty area)
  const [renaming, setRenaming] = useSh(null);
  const [tmp, setTmp] = useSh("");
  const apps = [
    { id: "files", icon: "folder", color: "#4a90e2", label: "Archivos" },
    { id: "browser", icon: "language", color: "#0aa5b5", label: "Navegador" },
    { id: "launchpad", icon: "apps", color: "#0a84ff", label: "Aplicaciones" },
  ];
  const onDrop = (e) => {
    e.preventDefault();
    try { const d = JSON.parse(e.dataTransfer.getData("text/sotos-item")); if (d && d.name) deskApi.add(d); } catch (_) {}
  };
  const EMPTY = [
    { id: "newfolder", label: "Nueva carpeta", icon: "create_new_folder" },
    { id: "widget", label: "Añadir widget", icon: "widgets" },
    { id: "wall", label: "Cambiar fondo", icon: "wallpaper" },
    { id: "theme", label: settings.theme === "dark" ? "Modo claro" : "Modo oscuro", icon: settings.theme === "dark" ? "light_mode" : "dark_mode" },
    { sep: true },
    { id: "emptytrash", label: "Vaciar papelera", icon: "delete_sweep", danger: true },
  ];
  const ITEM = [
    { id: "open", label: "Abrir", icon: "open_in_new" },
    { id: "rename", label: "Renombrar", icon: "drive_file_rename_outline" },
    { sep: true },
    { id: "remove", label: "Quitar del escritorio", icon: "delete", danger: true },
  ];
  const [wmenu, setWmenu] = useSh(null);
  const onEmpty = (id, x, y) => {
    if (id === "newfolder") deskApi.add({ name: "Nueva carpeta", type: "folder" });
    else if (id === "widget") setWmenu({ x, y });
    else if (id === "wall") openApp("settings");
    else if (id === "theme") update("theme", settings.theme === "dark" ? "light" : "dark");
    else if (id === "emptytrash") trashApi.empty();
  };
  const onItem = (id, it) => {
    if (id === "open") it.type === "folder" ? openApp("files") : openItem(it);
    else if (id === "rename") { setRenaming(it.id); setTmp(it.name); }
    else if (id === "remove") { trashApi.add(it); deskApi.remove(it.id); }
  };

  return (
    <div className="desk-layer" onDragOver={e => e.preventDefault()} onDrop={onDrop}
      onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item: null }); }}>
      <div className="desk-icons" style={{ left: shifted ? 92 : 14 }}>
        {apps.map(ic => (
          <div key={ic.label} className="desk-icon" onDoubleClick={() => openApp(ic.id)}>
            <Tile icon={ic.icon} color={ic.color} /><span className="lbl">{ic.label}</span>
          </div>
        ))}
        {items.map(it => (
          <div key={it.id} className="desk-icon" onDoubleClick={() => it.type === "folder" ? openApp("files") : openItem(it)}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item: it }); }}>
            <div style={{ width: 46, height: 50, display: "grid", placeItems: "center" }}><FileGlyph type={it.type} css={it.css} src={it.src} size={44} /></div>
            {renaming === it.id
              ? <input className="rename-input" autoFocus value={tmp} onClick={e => e.stopPropagation()} onChange={e => setTmp(e.target.value)}
                  onBlur={() => { if (tmp.trim()) deskApi.rename(it.id, tmp.trim()); setRenaming(null); }}
                  onKeyDown={e => { if (e.key === "Enter") { if (tmp.trim()) deskApi.rename(it.id, tmp.trim()); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} />
              : <span className="lbl">{it.name}</span>}
          </div>
        ))}
        <div className="desk-icon desk-trash" onDoubleClick={() => openApp("trash")}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item: null }); }}>
          <div style={{ position: "relative" }}>
            <Tile icon={trashCount ? "delete" : "delete_outline"} color="#7d8590" />
            {trashCount > 0 && <span className="trash-badge">{trashCount}</span>}
          </div>
          <span className="lbl">Papelera</span>
        </div>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.item ? ITEM : EMPTY}
        onSelect={(id) => ctx.item ? onItem(id, ctx.item) : onEmpty(id, ctx.x, ctx.y)} onClose={() => setCtx(null)} />}
      {wmenu && <ContextMenu x={wmenu.x} y={wmenu.y}
        items={WIDGET_TYPES.map(t => ({ id: t.id, label: t.name, icon: t.icon }))}
        onSelect={(id) => widgetApi.add(id)} onClose={() => setWmenu(null)} />}
    </div>
  );
}

/* -------------------- Boot -------------------- */
function BootScreen({ onDone }) {
  useEh(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, []);
  return (
    <div className="boot">
      <div className="boot-logo"><SotosLogo size={120} animate badge={false} /></div>
      <div className="boot-name">Sotos</div>
      <div className="boot-bar"><div className="boot-fill" /></div>
      <div className="boot-tag">tu ordenador en la nube</div>
    </div>
  );
}

/* -------------------- Login -------------------- */
function LoginScreen({ wallpaper, profile, onLogin }) {
  const [pwd, setPwd] = useSh("");
  const [now] = useSh(new Date());
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="login" style={{ background: wallpaper.css }}>
      <div className="login-veil" />
      <div className="login-clock">
        <div className="lc-time">{time}</div>
        <div className="lc-date" style={{ textTransform: "capitalize" }}>{date}</div>
      </div>
      <div className="login-card">
        <div className="login-avatar"><Avatar profile={profile} size={96} /></div>
        <div className="login-user">{profile.name}</div>
        <div className="login-field">
          <input type="password" autoFocus placeholder="Contraseña" value={pwd}
            onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && onLogin()} />
          <button onClick={onLogin} title="Entrar"><Ic name="arrow_forward" size={20} /></button>
        </div>
        <button className="login-guest" onClick={onLogin}>Entrar como invitado</button>
      </div>
    </div>
  );
}

/* -------------------- Spotlight search -------------------- */
function Spotlight({ search, onOpen, onClose }) {
  const [q, setQ] = useSh("");
  const results = q.trim() ? search(q) : [];
  useEh(() => { const esc = e => e.key === "Escape" && onClose(); document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, []);
  return (
    <div className="spot-overlay" onMouseDown={onClose}>
      <div className="spot" onMouseDown={e => e.stopPropagation()}>
        <div className="spot-input"><Ic name="search" size={22} />
          <input autoFocus placeholder="Buscar archivos y carpetas…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {!!results.length && <div className="spot-results">
          {results.map((r, i) => (
            <div key={i} className="spot-row" onClick={() => { onOpen(r); onClose(); }}>
              <FileGlyph type={r.type} css={r.css} src={r.src} size={26} />
              <div><div className="spot-name">{r.name}</div><div className="spot-path">{["Sotos Drive", ...r.path].join(" › ")}</div></div>
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
  const [fs, setFs] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_fs")) || jclone(FS); } catch { return jclone(FS); } });
  const [profile, setProfileR] = useSh(() => { try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem("sotos_profile") || "{}") }; } catch { return { ...DEFAULT_PROFILE }; } });
  const [dockCfg, setDockCfg] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_dock")) || [...DOCK_IDS]; } catch { return [...DOCK_IDS]; } });
  const [shortcuts, setShortcuts] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_sc")) || [...DEFAULT_SHORTCUTS]; } catch { return [...DEFAULT_SHORTCUTS]; } });
  const [desktopItems, setDesktopItems] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_desk")) || []; } catch { return []; } });
  const [trash, setTrash] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_trash")) || []; } catch { return []; } });
  const [widgets, setWidgets] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_widgets")) || [{ id: "w1", type: "clock", x: 0, y: 0 }, { id: "w2", type: "weather", x: 0, y: 0 }]; } catch { return []; } });
  const [notes, setNotes] = useSh(() => { try { return JSON.parse(localStorage.getItem("sotos_notes")) || {}; } catch { return {}; } });
  const [wins, setWins] = useSh([]);
  const [stage, setStage] = useSh(() => localStorage.getItem("sotos_in") ? "desktop" : "boot");
  const [spot, setSpot] = useSh(false);
  const zTop = useRh(10);

  const update = useCh((k, v) => setSettings(s => { const n = { ...s, [k]: v }; localStorage.setItem("sotos", JSON.stringify(n)); return n; }), []);
  const setProfile = useCh((p) => setProfileR(prev => { const n = { ...prev, ...p }; localStorage.setItem("sotos_profile", JSON.stringify(n)); return n; }), []);
  useEh(() => { try { localStorage.setItem("sotos_fs", JSON.stringify(fs)); } catch (e) {} }, [fs]);
  useEh(() => localStorage.setItem("sotos_dock", JSON.stringify(dockCfg)), [dockCfg]);
  useEh(() => localStorage.setItem("sotos_sc", JSON.stringify(shortcuts)), [shortcuts]);
  useEh(() => { try { localStorage.setItem("sotos_desk", JSON.stringify(desktopItems)); } catch (e) {} }, [desktopItems]);
  useEh(() => { try { localStorage.setItem("sotos_trash", JSON.stringify(trash)); } catch (e) {} }, [trash]);
  useEh(() => { try { localStorage.setItem("sotos_widgets", JSON.stringify(widgets)); } catch (e) {} }, [widgets]);
  useEh(() => { try { localStorage.setItem("sotos_notes", JSON.stringify(notes)); } catch (e) {} }, [notes]);

  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const deskApi = {
    add: (it) => setDesktopItems(d => d.some(x => x.name === it.name) ? d : [...d, { ...it, id: it.id || uid("d") }]),
    remove: (id) => setDesktopItems(d => d.filter(x => x.id !== id)),
    rename: (id, nm) => setDesktopItems(d => d.map(x => x.id === id ? { ...x, name: nm } : x)),
  };
  const trashApi = {
    add: (it) => setTrash(t => [{ ...it, id: uid("t") }, ...t]),
    restore: (id) => setTrash(t => { const it = t.find(x => x.id === id); if (it) deskApi.add({ ...it, id: undefined }); return t.filter(x => x.id !== id); }),
    del: (id) => setTrash(t => t.filter(x => x.id !== id)),
    empty: () => setTrash([]),
  };
  const toTrash = (it) => trashApi.add(it);

  let wseq = widgets.length;
  const widgetApi = {
    add: (type) => setWidgets(ws => {
      const n = ws.filter(w => w.type === type).length;
      const base = 60 + (ws.length % 4) * 188;
      return [...ws, { id: "w" + Date.now().toString(36), type, x: window.innerWidth - 220, y: 60 + (ws.length % 4) * 180 }];
    }),
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

  const wallpaper = WALLPAPERS.find(w => w.id === settings.wallpaper) || WALLPAPERS[0];

  // filesystem API
  const fsApi = {
    add: (path, items) => setFs(r => { const t = jclone(r); const n = getNode(t, path); if (n) { n.children = n.children || []; n.children.unshift(...items); } return t; }),
    remove: (path, name) => setFs(r => { const t = jclone(r); const n = getNode(t, path); if (n) n.children = (n.children || []).filter(c => c.name !== name); return t; }),
    rename: (path, name, nn) => setFs(r => { const t = jclone(r); const n = getNode(t, path); const it = n && (n.children || []).find(c => c.name === name); if (it) it.name = nn; return t; }),
    move: (srcPath, name, destPath) => setFs(r => { const t = jclone(r); const s = getNode(t, srcPath); const i = s && s.children.findIndex(c => c.name === name); if (i == null || i < 0) return t; const d = getNode(t, destPath); if (!d || JSON.stringify(srcPath) === JSON.stringify(destPath)) return t; const [it] = s.children.splice(i, 1); d.children = d.children || []; d.children.push(it); return t; }),
    mkdir: (path) => setFs(r => { const t = jclone(r); const n = getNode(t, path); if (n) { n.children = n.children || []; let nm = "Nueva carpeta", k = 1; while (n.children.some(c => c.name === nm)) nm = "Nueva carpeta " + (++k); n.children.unshift({ name: nm, type: "folder", children: [] }); } return t; }),
  };
  const search = useCh((q) => {
    const out = []; const ql = q.toLowerCase();
    const walk = (node, path) => (node.children || []).forEach(c => {
      if (c.name.toLowerCase().includes(ql)) out.push({ ...c, path });
      if (c.type === "folder") walk(c, [...path, c.name]);
    });
    walk(fs, []); return out.slice(0, 14);
  }, [fs]);

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
    setWins(ws => {
      const key = appId + (payload && payload.file ? ":" + payload.file : "") + (payload && payload.url ? ":" + payload.url : "");
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

  // open a filesystem item in the right app
  const openItem = useCh((r) => {
    if (r.type === "folder") return openApp("files");
    openApp(ROUTE[r.type] || "editor", { file: r.name, type: r.type, src: r.src, css: r.css });
  }, [openApp]);

  useEh(() => { openApp("files"); }, []);

  const login = useCh(() => { localStorage.setItem("sotos_in", "1"); setStage("desktop"); }, []);
  const logout = useCh(() => { localStorage.removeItem("sotos_in"); setStage("boot"); }, []);

  const running = new Set(wins.map(w => w.appId));
  const top = wins.reduce((a, b) => (!a || b.z > a.z) && !b.minimized ? b : a, null);
  const activeApp = top ? APP_BY_ID[top.appId] : null;

  const storeProps = { openApp, settings, update, fs, fsApi, search, profile, setProfile, shortcuts, scApi, dockApi, dockCfg, toTrash, trash, trashApi, deskApi, openSpotlight: () => setSpot(true) };

  if (stage === "boot") return <BootScreen onDone={() => setStage("login")} />;
  if (stage === "login") return <LoginScreen wallpaper={wallpaper} profile={profile} onLogin={login} />;

  return (
    <div id="os" data-screen-label="Escritorio">
      <div className="wallpaper" style={{ background: wallpaper.css }} />
      <Desktop shifted={settings.dock === "left"} items={desktopItems} trashCount={trash.length}
        openApp={openApp} openItem={openItem} deskApi={deskApi} trashApi={trashApi} settings={settings} update={update} fsApi={fsApi} widgetApi={widgetApi} />
      {widgets.map(w => (
        <Widget key={w.id} w={w} note={notes[w.id]} onNote={setNote}
          onMove={widgetApi.move} onClose={widgetApi.remove} />
      ))}
      {wins.map(win => {
        const app = APP_BY_ID[win.appId];
        const Comp = APP_COMPONENTS[app.comp];
        const extra = { ...storeProps, ...(win.payload || {}) };
        const title = win.payload && win.payload.file ? win.payload.file : (win.payload && win.payload.scName) ? win.payload.scName : app.name;
        return (
          <Win key={win.id} win={{ ...win, title }} app={app} focused={top && top.id === win.id}
            onFocus={() => focus(win.id)} onClose={() => close(win.id)} onMin={() => min(win.id)} onMax={() => max(win.id)}
            onMove={(x, y) => setRect(win.id, { x, y })} onResize={(w, h) => setRect(win.id, { w, h })}>
            {Comp ? <Comp {...extra} /> : <EmptyState icon="error" text={"App no encontrada: " + app.comp} />}
          </Win>
        );
      })}
      <MenuBar activeApp={activeApp} settings={settings} update={update} profile={profile} onApp={openApp} onLogout={logout} onSearch={() => setSpot(true)} />
      <Dock position={settings.dock} order={dockCfg} running={running} onApp={openApp} dockApi={dockApi} />
      {spot && <Spotlight search={search} onOpen={openItem} onClose={() => setSpot(false)} />}
    </div>
  );
}

export { OS };
