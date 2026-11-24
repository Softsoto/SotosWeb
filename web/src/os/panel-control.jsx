/* ============================================================
   Sotos — Panel de control
   Vista por categorías o por íconos, barra de direcciones con
   atrás/adelante, búsqueda y applets que hacen cosas de verdad:
   desinstalar programas, programas predeterminados, seguridad y
   mantenimiento, copias, cuentas, personalización, sonido (prueba de
   altavoces y micrófono), dispositivos, fecha y hora, almacenamiento.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Modal, toast, Avatar, EmptyState, Tile, copyText } from "./ui.jsx";
import { EraObject, ICON_OBJECT } from "./iconos-objetos.jsx";
import { useEra } from "./iconos-epoca.jsx";
import { APPS, ROUTE, ACCENTS, appAllowed } from "./data.jsx";
import * as vfs from "./vfs.js";
import { useVfs, fmtSize, fmtDate } from "./vfs.js";
import { api, sotosVersion } from "./api.js";
import { setInstalled, subscribeInstalled, installDate, loadInstalled } from "./installed.js";
import { Row, Segmented, RegionPanel, AccountPanel, BackupRows, WallThumb, SKINS, applySkin } from "./apps4.jsx";
import { ERAS } from "./epocas.js";
import { playEra, eraSoundsOn, setEraSounds } from "./sonidos.js";
import { WALLS, PHOTO_WALLS, ERA_WALLS } from "./wallpapers.js";
import { Sessions } from "./cuenta.jsx";
import { SotosMark } from "./logo.jsx";
const { useState, useEffect, useRef } = React;

/* ---------------- catálogo ---------------- */
const APPLETS = {
  seguridad:       { name: "Seguridad y mantenimiento", icon: "health_and_safety", k: "seguridad mantenimiento problemas estado alertas avisos" },
  copias:          { name: "Copias de seguridad", icon: "backup", k: "copia respaldo backup restaurar importar exportar" },
  sistema:         { name: "Sistema", icon: "computer", k: "sistema versión procesador memoria pantalla navegador equipo información acerca actualizaciones" },
  herramientas:    { name: "Herramientas administrativas", icon: "admin_panel_settings", k: "administración registro eventos usuarios servidor monitor", admin: true },
  programas:       { name: "Programas y características", icon: "apps", k: "programas desinstalar quitar aplicaciones apps instaladas tamaño" },
  predeterminados: { name: "Programas predeterminados", icon: "open_in_new", k: "predeterminado abrir con asociar extensión tipo de archivo" },
  cuentas:         { name: "Cuentas de usuario", icon: "manage_accounts", k: "cuenta usuario contraseña foto nombre dos pasos verificación" },
  sesiones:        { name: "Sesiones abiertas", icon: "devices", k: "sesiones dispositivos cerrar sesión", cloud: true },
  personalizacion: { name: "Personalización", icon: "palette", k: "tema apariencia color acento oscuro claro época" },
  fondo:           { name: "Fondo de escritorio", icon: "wallpaper", k: "fondo pantalla imagen foto paisaje" },
  sonido:          { name: "Sonido", icon: "volume_up", k: "sonido altavoces audio micrófono grabación esquema" },
  dispositivos:    { name: "Dispositivos", icon: "devices_other", k: "dispositivos cámara micrófono batería red pantalla mando hardware" },
  reloj:           { name: "Fecha y hora", icon: "schedule", k: "fecha hora reloj zona horaria 24 horas relojes" },
  region:          { name: "Región e idioma", icon: "language", k: "región idioma formato fecha zona horaria extensiones" },
  almacenamiento:  { name: "Almacenamiento", icon: "cloud", k: "almacenamiento espacio disco liberar papelera caché archivos grandes" },
};
const CATS = [
  { id: "sistema", name: "Sistema y seguridad", icon: "shield", tasks: [["Revisar el estado de tu Sotos", "seguridad"], ["Hacer una copia de seguridad", "copias"], ["Ver la versión y el equipo", "sistema"]], items: ["seguridad", "copias", "sistema", "herramientas"] },
  { id: "programas", name: "Programas", icon: "apps", tasks: [["Desinstalar un programa", "programas"], ["Elegir con qué se abre cada archivo", "predeterminados"]], items: ["programas", "predeterminados"] },
  { id: "cuentas", name: "Cuentas de usuario", icon: "contacts", tasks: [["Cambiar la contraseña o la foto", "cuentas"], ["Ver dónde está abierta tu cuenta", "sesiones"]], items: ["cuentas", "sesiones"] },
  { id: "apariencia", name: "Apariencia y personalización", icon: "palette", tasks: [["Cambiar el tema", "personalizacion"], ["Cambiar el fondo de escritorio", "fondo"]], items: ["personalizacion", "fondo"] },
  { id: "hardware", name: "Hardware y sonido", icon: "speaker", tasks: [["Probar altavoces y micrófono", "sonido"], ["Ver los dispositivos", "dispositivos"]], items: ["sonido", "dispositivos"] },
  { id: "reloj", name: "Reloj y región", icon: "schedule", tasks: [["Cambiar la fecha, la hora o la zona", "reloj"], ["Cambiar el idioma y los formatos", "region"]], items: ["reloj", "region"] },
  { id: "almacen", name: "Almacenamiento", icon: "cloud", tasks: [["Liberar espacio", "almacenamiento"]], items: ["almacenamiento"] },
];
const catOf = (id) => CATS.find(c => c.items.includes(id));
const usableApplet = (id, user) => { const a = APPLETS[id]; return a && (!a.admin || user?.role === "admin") && (!a.cloud || !!user); };

function CpIcon({ icon, size = 40 }) {
  const era = useEra(); const obj = era && era !== "mosaico" && ICON_OBJECT[icon];
  return obj ? <span className="cp-ico obj" style={{ width: size, height: size }}><EraObject app={obj} era={era} size={size} /></span>
    : <span className="cp-ico" style={{ width: size, height: size }}><Ic name={icon} size={Math.round(size * 0.6)} /></span>;
}
const Link = ({ children, onClick, title }) => <button type="button" className="cp-link" title={title} onClick={onClick}>{children}</button>;
const Head = ({ title, sub }) => <><h2 className="cp-h">{title}</h2>{sub && <p className="cp-sub-h">{sub}</p>}</>;

/* ============================================================ */
export function ControlPanelApp(props) {
  const { applet, nonce, setWinTitle, openApp } = props;
  const me = useVfs(s => s.user);
  const [hist, setHist] = useState({ list: [applet || "home"], at: 0 });
  const [q, setQ] = useState("");
  const [view, setView] = useState(() => { try { return localStorage.getItem("sotos_cp_view") || "cat"; } catch { return "cat"; } });
  const first = useRef(true);
  const page = hist.list[hist.at];
  const go = (p) => { setQ(""); setHist(h => h.list[h.at] === p ? h : { list: [...h.list.slice(0, h.at + 1), p], at: h.at + 1 }); };
  useEffect(() => { if (first.current) { first.current = false; return; } if (applet) go(applet); }, [applet, nonce]);
  const cur = APPLETS[page], cat = page.startsWith("cat:") ? CATS.find(c => "cat:" + c.id === page) : cur ? catOf(page) : null;
  useEffect(() => { setWinTitle?.(cur ? cur.name : cat ? cat.name : null); }, [page]);
  const setV = (v) => { setView(v); try { localStorage.setItem("sotos_cp_view", v); } catch {} };
  const ok = (id) => usableApplet(id, me);
  const crumbs = [["Panel de control", "home"], ...(cat ? [[cat.name, "cat:" + cat.id]] : []), ...(cur ? [[cur.name, page]] : [])];
  const ctx = { ...props, go, me };

  let body;
  if (q.trim()) body = <Results q={q} go={go} ok={ok} />;
  else if (page === "home") body = <Home view={view} setView={setV} go={go} ok={ok} />;
  else if (page.startsWith("cat:")) body = cat ? <CategoryPage cat={cat} go={go} ok={ok} /> : null;
  else if (!ok(page)) body = <EmptyState icon="block" text={APPLETS[page]?.admin ? "Solo las cuentas administradoras pueden abrir esto" : "Esto necesita una cuenta: inicia sesión"} />;
  else body = <Applet id={page} ctx={ctx} />;

  return (
    <div className="app cp">
      <div className="cp-bar">
        <button className="tb-btn icon" title="Atrás" disabled={hist.at === 0} onClick={() => setHist(h => ({ ...h, at: h.at - 1 }))}><Ic name="arrow_back" /></button>
        <button className="tb-btn icon" title="Adelante" disabled={hist.at >= hist.list.length - 1} onClick={() => setHist(h => ({ ...h, at: h.at + 1 }))}><Ic name="arrow_forward" /></button>
        <div className="cp-crumbs" role="navigation" aria-label="Ubicación">
          <span className="cp-crumb-ico"><Tile icon="tune" color="#3b6e8f" app="control" size={18} /></span>
          {crumbs.map(([label, to], i) => <React.Fragment key={to}><Ic name="chevron_right" size={16} className="cp-sep" /><button className="cp-crumb" onClick={() => go(to)}>{label}</button></React.Fragment>)}
        </div>
        <div className="search-box cp-search"><Ic name="search" size={16} /><input placeholder="Buscar en el Panel de control" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar en el Panel de control" /></div>
      </div>
      <div className="cp-body">
        <aside className="cp-side app-side">
          <button className={"cp-side-link" + (page === "home" && !q ? " on" : "")} onClick={() => go("home")}>Inicio del Panel de control</button>
          {cat && cat.items.filter(ok).map(id => <button key={id} className={"cp-side-link" + (page === id ? " on" : "")} onClick={() => go(id)}>{APPLETS[id].name}</button>)}
          <div className="cp-side-sep">Ver también</div>
          <button className="cp-side-link" onClick={() => openApp("settings")}>Ajustes</button>
          <button className="cp-side-link" onClick={() => openApp("store")}>Tienda</button>
          {me?.role === "admin" && <button className="cp-side-link" onClick={() => openApp("admin")}>Administración</button>}
          <button className="cp-side-link" onClick={() => openApp("trash")}>Papelera</button>
        </aside>
        <main className="cp-main scroll">{body}</main>
      </div>
    </div>
  );
}

function Home({ view, setView, go, ok }) {
  const all = Object.keys(APPLETS).filter(ok).sort((a, b) => APPLETS[a].name.localeCompare(APPLETS[b].name, "es"));
  return <div className="cp-home">
    <div className="cp-home-head"><h1>Ajusta la configuración de tu Sotos</h1>
      <label className="cp-view">Ver por: <select value={view} onChange={e => setView(e.target.value)}><option value="cat">Categoría</option><option value="big">Íconos grandes</option><option value="small">Íconos pequeños</option></select></label></div>
    {view === "cat" ? <div className="cp-cats">{CATS.filter(c => c.items.some(ok)).map(c =>
      <div key={c.id} className="cp-cat">
        <button className="cp-cat-ico" onClick={() => go("cat:" + c.id)} aria-label={c.name}><CpIcon icon={c.icon} size={52} /></button>
        <div><button className="cp-cat-name" onClick={() => go("cat:" + c.id)}>{c.name}</button>
          {c.tasks.filter(([, to]) => ok(to)).map(([label, to]) => <Link key={label} onClick={() => go(to)}>{label}</Link>)}</div>
      </div>)}</div>
      : <div className={"cp-icons " + view}>{all.map(id => <button key={id} className="cp-icon-item" onClick={() => go(id)}><CpIcon icon={APPLETS[id].icon} size={view === "big" ? 34 : 20} /><span>{APPLETS[id].name}</span></button>)}</div>}
  </div>;
}
function CategoryPage({ cat, go, ok }) {
  return <div className="cp-catpage">{cat.items.filter(ok).map(id => <div key={id} className="cp-cat">
    <button className="cp-cat-ico" onClick={() => go(id)} aria-label={APPLETS[id].name}><CpIcon icon={APPLETS[id].icon} size={44} /></button>
    <div><button className="cp-cat-name" onClick={() => go(id)}>{APPLETS[id].name}</button>
      <div className="cp-desc">{DESC[id]}</div></div></div>)}</div>;
}
const DESC = {
  seguridad: "Revisa de un vistazo la seguridad de tu cuenta, el espacio, la sincronización y las copias.",
  copias: "Descarga todos tus archivos, contactos, calendario y tareas en un .zip, o restaura una copia.",
  sistema: "Versión de Sotos, datos de este equipo y del servidor, y búsqueda de actualizaciones.",
  herramientas: "Registro de eventos, usuarios, copias y apps del servidor.",
  programas: "Mira lo que tienes instalado, cuánto ocupa y desinstala lo que no uses.",
  predeterminados: "Elige qué app abre cada tipo de archivo.",
  cuentas: "Contraseña, foto, verificación en dos pasos y conexión de otros dispositivos.",
  sesiones: "Ve en qué navegadores está abierta tu cuenta y cierra las que no reconozcas.",
  personalizacion: "Temas de escritorio, modo oscuro y color de acento.",
  fondo: "Ilustraciones, fondos de época y fotos de Colombia.",
  sonido: "Prueba los altavoces y el micrófono y elige los sonidos del sistema.",
  dispositivos: "Pantalla, cámaras, micrófonos, batería, red y mandos de juego de este equipo.",
  reloj: "Reloj, formato de 12 o 24 horas, relojes de otras zonas y comprobación de la hora.",
  region: "Zona horaria, formato de fecha, idioma y extensiones de archivo.",
  almacenamiento: "Qué ocupa espacio, archivos más grandes, papelera y copia local del navegador.",
};
function Results({ q, go, ok }) {
  const words = q.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(/\s+/).filter(Boolean);
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const hits = Object.keys(APPLETS).filter(ok).filter(id => { const t = norm(APPLETS[id].name + " " + APPLETS[id].k + " " + DESC[id]); return words.every(w => t.includes(w)); });
  if (!hits.length) return <EmptyState icon="search_off" text={`Nada coincide con «${q}»`} />;
  return <div className="cp-catpage">{hits.map(id => <div key={id} className="cp-cat"><button className="cp-cat-ico" onClick={() => go(id)} aria-label={APPLETS[id].name}><CpIcon icon={APPLETS[id].icon} size={40} /></button>
    <div><button className="cp-cat-name" onClick={() => go(id)}>{APPLETS[id].name}</button><div className="cp-desc">{DESC[id]}</div></div></div>)}</div>;
}

function Applet({ id, ctx }) {
  switch (id) {
    case "programas": return <Programas {...ctx} />;
    case "predeterminados": return <Predeterminados {...ctx} />;
    case "sistema": return <Sistema {...ctx} />;
    case "seguridad": return <Seguridad {...ctx} />;
    case "copias": return <Copias {...ctx} />;
    case "herramientas": return <Herramientas {...ctx} />;
    case "cuentas": return <Cuentas {...ctx} />;
    case "sesiones": return <><Head title="Sesiones abiertas" sub="Lugares donde tu cuenta tiene la sesión iniciada. Cierra las que no reconozcas." /><Sessions onBack={() => ctx.go("cuentas")} /></>;
    case "personalizacion": return <Personalizacion {...ctx} />;
    case "fondo": return <Fondo {...ctx} />;
    case "sonido": return <Sonido {...ctx} />;
    case "dispositivos": return <Dispositivos {...ctx} />;
    case "reloj": return <Reloj {...ctx} />;
    case "region": return <RegionPanel settings={ctx.settings} update={ctx.update} />;
    case "almacenamiento": return <Almacenamiento {...ctx} />;
    default: return null;
  }
}

/* ---------------- Programas y características ---------------- */
function Programas({ me, openApp, go }) {
  const [, tick] = useState(0); useEffect(() => subscribeInstalled(() => tick(x => x + 1)), []);
  const [ver, setVer] = useState(null); useEffect(() => { sotosVersion().then(setVer); }, []);
  const [sel, setSel] = useState(null), [sort, setSort] = useState({ k: "name", d: 1 }), [ask, setAsk] = useState(null), [wipe, setWipe] = useState(true), [busy, setBusy] = useState(null), [q, setQ] = useState("");
  const admin = me?.role === "admin";
  const rows = APPS.filter(a => !a.hidden && a.id !== "web" && appAllowed(a.id, me)).map(a => ({ a,
    kind: a.ext ? "SDK" : a.store ? "Tienda" : "Sotos",
    publisher: a.ext ? (a.author || "—") : "Sotos",
    date: a.store ? (installDate(a.id) || a.serverInstalled || null) : null,
    size: a.bytes ?? null, version: a.version || (a.store ? "—" : ver || "—") }))
    .filter(r => !q || (r.a.name + " " + r.publisher).toLowerCase().includes(q.toLowerCase()));
  const key = { name: r => r.a.name.toLowerCase(), publisher: r => r.publisher.toLowerCase(), date: r => r.date || 0, size: r => r.size || 0, version: r => String(r.version) };
  rows.sort((x, y) => { const a = key[sort.k](x), b = key[sort.k](y); return (typeof a === "string" ? a.localeCompare(b, "es") : a - b) * sort.d; });
  const s = rows.find(r => r.a.id === sel);
  const total = rows.reduce((n, r) => n + (r.size || 0), 0);
  const col = (k, label) => <button className={"cp-th" + (sort.k === k ? " on" : "")} onClick={() => setSort(o => ({ k, d: o.k === k ? -o.d : 1 }))}>{label}{sort.k === k && <Ic name={sort.d > 0 ? "arrow_drop_up" : "arrow_drop_down"} size={18} />}</button>;
  const hasData = (a) => a.ext && a.permissions?.includes("storage");
  const uninstall = async () => {
    const a = ask.a; setAsk(null); setBusy(`Desinstalando ${a.name}…`);
    try {
      if (ask.server) { await api("DELETE", "apps/" + a.id); await loadInstalled(); toast(`${a.name} se quitó del servidor`, { icon: "delete" }); }
      else {
        if (wipe && hasData(a)) { setBusy(`Borrando los datos de ${a.name}…`); const { keys } = await api("GET", `apps/${a.id}/storage`); for (const k of keys) await api("DELETE", `apps/${a.id}/storage/${encodeURIComponent(k)}`); }
        await setInstalled(a.id, false); toast(`${a.name} se desinstaló`, { icon: "check" });
      }
      setSel(null);
    } catch (e) { toast(e.message, { error: true }); }
    setBusy(null);
  };
  return <>
    <Head title="Desinstalar o cambiar un programa" sub="Para desinstalar un programa, selecciónalo en la lista y haz clic en Desinstalar. Las apps que vienen con Sotos no se desinstalan; el administrador puede ocultarlas por cuenta." />
    <div className="cp-toolbar">
      {s ? <>
        <button className="tb-btn" onClick={() => openApp(s.a.id)}><Ic name="open_in_new" /> Abrir</button>
        {s.kind !== "Sotos" && <button className="tb-btn" onClick={() => { setWipe(true); setAsk({ a: s.a }); }}><Ic name="delete" /> Desinstalar</button>}
        {admin && s.kind === "SDK" && <button className="tb-btn danger" onClick={() => setAsk({ a: s.a, server: true })}><Ic name="dns" /> Quitar del servidor</button>}
        {s.kind === "Sotos" && <span className="faint cp-note">Forma parte de Sotos</span>}
      </> : <span className="faint cp-note">Selecciona un programa</span>}
      <span style={{ flex: 1 }} />
      <div className="search-box" style={{ width: 200 }}><Ic name="search" size={16} /><input placeholder="Buscar programas" value={q} onChange={e => setQ(e.target.value)} /></div>
    </div>
    <div className="cp-table" role="grid">
      <div className="cp-tr head">{col("name", "Nombre")}{col("publisher", "Editor")}{col("date", "Se instaló el")}{col("size", "Tamaño")}{col("version", "Versión")}</div>
      {rows.map(r => <div key={r.a.id} role="row" tabIndex={0} className={"cp-tr" + (sel === r.a.id ? " sel" : "")} onClick={() => setSel(r.a.id)} onDoubleClick={() => openApp(r.a.id)} onKeyDown={e => e.key === "Enter" && openApp(r.a.id)}>
        <span className="cp-name"><Tile icon={r.a.icon} color={r.a.color} app={r.a.id} size={20} />{r.a.name}{r.kind !== "Sotos" && <em className="cp-tag">{r.kind}</em>}</span>
        <span>{r.publisher}</span><span>{r.date ? new Date(r.date).toLocaleDateString("es") : r.kind === "Sotos" ? "Con el sistema" : "—"}</span>
        <span>{r.size != null ? fmtSize(r.size) : "—"}</span><span>{r.version}</span></div>)}
    </div>
    <div className="cp-foot"><Ic name="apps" size={20} /><div><b>Programas instalados</b><span className="faint">{rows.length} programas{total ? ` · las apps del SDK ocupan ${fmtSize(total)} en el servidor` : ""}</span></div>
      <span style={{ flex: 1 }} /><Link onClick={() => openApp("store")}>Conseguir más en la Tienda</Link>{admin && <Link onClick={() => openApp("admin", { tab: "apps", nonce: Date.now() })}>Instalar una app desde un .zip</Link>}</div>
    {ask && <Modal title={ask.server ? `¿Quitar ${ask.a.name} del servidor?` : `Desinstalar ${ask.a.name}`} icon="delete" onClose={() => setAsk(null)} width={440}
      actions={<><button className="tb-btn" onClick={() => setAsk(null)}>Cancelar</button><button className="tb-btn danger" onClick={uninstall}>{ask.server ? "Quitar para todos" : "Desinstalar"}</button></>}>
      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{ask.server
        ? <>Se borra la app del servidor y desaparece para <b>todas las cuentas</b>, con los datos que guardó cada persona. No se puede deshacer; para volver a tenerla hay que instalar el .zip otra vez.</>
        : <>Se quita de tu escritorio, tu menú Inicio y la lista de «Abrir con». Puedes volver a instalarla desde la Tienda.</>}</div>
      {!ask.server && hasData(ask.a) && <label className="cp-check"><input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)} /> Borrar también los datos que guardó (ajustes, historial)</label>}
    </Modal>}
    {busy && <Modal title="Programas y características" icon="hourglass_top" onClose={() => {}} width={380}><div className="cp-busy"><div className="cp-progress"><i /></div>{busy}</div></Modal>}
  </>;
}

/* ---------------- Programas predeterminados ---------------- */
const COMMON = ["docx", "xlsx", "csv", "pptx", "pdf", "txt", "md", "json", "html", "png", "jpg", "gif", "webp", "svg", "mp3", "wav", "ogg", "mp4", "webm", "mkv", "drawio", "excalidraw", "epub", "zip"];
const KIND = { docx: "Documento", xlsx: "Hoja de cálculo", csv: "Datos separados por comas", pptx: "Presentación", pdf: "Documento PDF", txt: "Texto", code: "Código o texto con formato", img: "Imagen", audio: "Audio", video: "Vídeo", drawio: "Diagrama", excalidraw: "Pizarra", zip: "Archivo comprimido", file: "Archivo" };
function Predeterminados({ me, settings, update }) {
  const [, tick] = useState(0); useEffect(() => subscribeInstalled(() => tick(x => x + 1)), []);
  const defs = settings.defaults || {};
  const sdk = APPS.filter(a => a.ext && appAllowed(a.id, me));
  const exts = [...new Set([...COMMON, ...sdk.flatMap(a => a.opens || [])])];
  const rows = exts.map(ext => { const t = vfs.typeOf("x." + ext), own = ROUTE[t];
    const cands = [...(own && appAllowed(own, me) ? [own] : []), ...sdk.filter(a => a.opens?.includes(ext) && a.id !== own).map(a => a.id)];
    return { ext, kind: KIND[t] || "Archivo", cands, cur: cands.includes(defs[ext]) ? defs[ext] : cands[0] }; }).filter(r => r.cands.length);
  const name = (id) => APPS.find(a => a.id === id)?.name || id;
  const set = (ext, v) => update("defaults", { ...defs, [ext]: v });
  const custom = Object.keys(defs).length;
  return <>
    <Head title="Elige con qué se abre cada tipo de archivo" sub="Al hacer doble clic en un archivo, Sotos lo abre con la app elegida. Siempre puedes usar «Abrir con» desde el menú del archivo." />
    <div className="cp-table assoc">
      <div className="cp-tr head"><span>Extensión</span><span>Tipo</span><span>Se abre con</span></div>
      {rows.map(r => <div key={r.ext} className="cp-tr">
        <span><code>.{r.ext}</code></span><span>{r.kind}</span>
        <span>{r.cands.length > 1 ? <select className="sc-input" style={{ margin: 0 }} value={r.cur} onChange={e => set(r.ext, e.target.value)}>{r.cands.map(id => <option key={id} value={id}>{name(id)}</option>)}</select>
          : <span className="cp-assoc-one"><Tile icon={APPS.find(a => a.id === r.cur)?.icon} color={APPS.find(a => a.id === r.cur)?.color} app={r.cur} size={18} />{name(r.cur)}</span>}</span>
      </div>)}
    </div>
    <div className="cp-foot"><Ic name="info" size={20} /><span className="faint">Aparecen más opciones al instalar apps del SDK que abren archivos (por ejemplo, un lector de libros para .epub).</span><span style={{ flex: 1 }} />
      <button className="tb-btn" disabled={!custom} onClick={() => { update("defaults", {}); toast("Se restablecieron los programas predeterminados", { icon: "restart_alt" }); }}>Restablecer</button></div>
  </>;
}

/* ---------------- Sistema ---------------- */
const browserName = () => { const ua = navigator.userAgent; return /Edg\//.test(ua) ? "Microsoft Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\/(\d+)/.test(ua) ? "Firefox " + RegExp.$1 : /Chrome\/(\d+)/.test(ua) ? "Chrome " + RegExp.$1 : /Safari\//.test(ua) ? "Safari" : "Navegador"; };
const osName = () => { const ua = navigator.userAgent; return /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS / iPadOS" : /Windows NT 10/.test(ua) ? "Windows 10 u 11" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Desconocido"; };
const dur = (s) => s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} días`;
function Sistema({ me, openApp }) {
  const sync = useVfs(s => s.sync), mode = useVfs(s => s.mode);
  const [ver, setVer] = useState(null), [est, setEst] = useState(null), [stats, setStats] = useState(null), [upd, setUpd] = useState(null), [checking, setChecking] = useState(false);
  const admin = me?.role === "admin";
  useEffect(() => { sotosVersion().then(setVer); navigator.storage?.estimate?.().then(setEst).catch(() => {}); if (admin) api("GET", "admin/stats").then(setStats).catch(() => {}); }, []);
  const conn = navigator.connection;
  const groups = [
    ["Edición de Sotos", [["Versión", ver ? `Sotos ${ver}` : "Sin servidor (solo en el navegador)"], ["Licencia", "MIT · © 2026 Sebastian Sotomontes"]]],
    ["Este equipo", [["Sistema operativo", osName()], ["Navegador", browserName()], ["Procesador", navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} núcleos lógicos` : "El navegador no lo informa"],
      ["Memoria", navigator.deviceMemory ? `Al menos ${navigator.deviceMemory} GB` : "El navegador no lo informa"], ["Pantalla", `${screen.width} × ${screen.height} · escala ${Math.round(devicePixelRatio * 100)} % · ${screen.colorDepth} bits`],
      ["Conexión", navigator.onLine ? (conn?.effectiveType ? `En línea · ${conn.effectiveType.toUpperCase()}${conn.downlink ? ` · ~${conn.downlink} Mb/s` : ""}` : "En línea") : "Sin conexión"],
      ["Idioma y zona", `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`],
      ["Espacio del navegador", est ? `${fmtSize(est.usage)} usados de ${fmtSize(est.quota)} disponibles` : "—"]]],
    ["Cuenta", [["Usuario", me ? `${me.name} (${me.email})` : "Invitado"], ["Tipo", me ? (admin ? "Administrador" : "Usuario estándar") : "Sin cuenta: todo vive en este navegador"],
      ["Servidor", mode === "cloud" ? location.host : "—"], ["Espacio en la nube", sync.quota ? `${fmtSize(vfs.usedBytes())} de ${fmtSize(sync.quota)}` : "—"]]],
    ...(stats ? [["Servidor", [["Node.js", stats.server.node], ["Memoria del proceso", fmtSize(stats.server.memory)], ["Encendido hace", dur(stats.server.uptime)],
      ["Disco", stats.disk ? `${fmtSize(stats.disk.free)} libres de ${fmtSize(stats.disk.total)}` : "—"], ["Cuentas", `${stats.users} (${stats.seen24h} activas en 24 h)`]]]] : []),
  ];
  const report = () => groups.map(([g, rows]) => `${g}\n` + rows.map(([k, v]) => `  ${k}: ${v}`).join("\n")).join("\n\n");
  const check = async () => { setChecking(true); try { setUpd(await api("GET", "admin/update?force=1")); } catch (e) { toast(e.message, { error: true }); } setChecking(false); };
  return <>
    <div className="cp-sys-head"><div><Head title="Información básica de tu Sotos" /></div><SotosMark size={64} variant="tile" /></div>
    {groups.map(([g, rows]) => <section key={g} className="cp-sys"><h3>{g}</h3>{rows.map(([k, v]) => <div key={k} className="cp-kv"><span>{k}</span><b>{v}</b></div>)}</section>)}
    {upd && <div className={"cp-alert " + (upd.error ? "info" : upd.newer ? "warn" : "ok")}><Ic name={upd.newer ? "system_update_alt" : upd.error ? "cloud_off" : "check_circle"} />
      <div>{upd.error || (upd.newer ? <>Sotos <b>{upd.latest}</b> está disponible. <Link onClick={() => openApp("admin", { tab: "servidor", nonce: Date.now() })}>Instalarla</Link></> : `Sotos ${upd.current} es la última versión.`)}</div></div>}
    <div className="cp-actions">
      <button className="tb-btn" onClick={() => copyText(report()).then(() => toast("Informe del sistema copiado", { icon: "content_copy" })).catch(() => toast("No se pudo copiar", { error: true }))}><Ic name="content_copy" /> Copiar informe</button>
      {admin && <button className="tb-btn" disabled={checking} onClick={check}><Ic name="system_update_alt" /> {checking ? "Buscando…" : "Buscar actualizaciones"}</button>}
    </div>
  </>;
}

/* ---------------- Seguridad y mantenimiento ---------------- */
const DAY = 86400_000;
function Seguridad({ me, go, openApp }) {
  const sync = useVfs(s => s.sync), trash = useVfs(s => s.trash) || [];
  const [ses, setSes] = useState(null), [upd, setUpd] = useState(null), [bk, setBk] = useState(null), [tfa, setTfa] = useState(null);
  const admin = me?.role === "admin";
  useEffect(() => {
    if (!me) return;
    api("GET", "auth/sessions").then(r => setSes(r.items.length)).catch(() => {});
    api("GET", "auth/2fa").then(r => setTfa(!!r.enabled)).catch(() => setTfa(!!me.twoFactor));
    if (admin) { api("GET", "admin/update").then(setUpd).catch(() => {}); api("GET", "admin/backups").then(setBk).catch(() => {}); }
  }, [me?.id]);
  const used = vfs.usedBytes(), quota = sync.quota, pct = quota ? Math.round(used / quota * 100) : 0;
  const trashBytes = trash.reduce((n, t) => n + vfs.folderSize(t.node), 0);
  const lastLocal = Number((() => { try { return localStorage.getItem("sotos_last_backup"); } catch { return 0; } })()) || null;
  const secure = location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const lastSrv = bk?.items?.find(i => i.complete);
  const checks = [
    me && tfa !== null && { sev: tfa ? "ok" : "warn", title: "Verificación en dos pasos", text: tfa ? "Activa: además de la contraseña se pide un código del celular." : "Desactivada. Con ella nadie entra a tu cuenta aunque adivine la contraseña.", act: !tfa && ["Activarla", () => go("cuentas")] },
    me && ses != null && { sev: ses > 4 ? "warn" : "ok", title: "Sesiones abiertas", text: `Tu cuenta está abierta en ${ses} lugar${ses === 1 ? "" : "es"}.`, act: ["Revisar", () => go("sesiones")] },
    { sev: secure ? "ok" : "warn", title: "Conexión", text: secure ? "Cifrada (HTTPS) o dentro de este mismo equipo." : "Sin cifrar (http). En una red ajena alguien podría ver lo que envías: pide al administrador que active HTTPS." },
    me && { sev: sync.status === "ok" ? "ok" : sync.status === "syncing" ? "info" : "warn", title: "Sincronización", text: { ok: "Todo está guardado en la nube.", syncing: `Enviando ${sync.pending} cambio(s)…`, offline: `Sin conexión: ${sync.pending} cambio(s) esperando.`, auth: "La sesión caducó: vuelve a iniciar sesión.", full: "Te quedaste sin espacio: los cambios no se están guardando." }[sync.status] || "—", act: sync.status !== "ok" && sync.status !== "syncing" && ["Sincronizar ahora", () => vfs.flush()] },
    { sev: pct > 90 ? "bad" : pct > 75 ? "warn" : "ok", title: "Espacio", text: quota ? `${fmtSize(used)} de ${fmtSize(quota)} (${pct} %).` : `${fmtSize(used)} en este navegador.`, act: pct > 75 && ["Liberar espacio", () => go("almacenamiento")] },
    { sev: trashBytes > 100 * 1048576 ? "info" : "ok", title: "Papelera", text: trash.length ? `${trash.length} elemento(s) que ocupan ${fmtSize(trashBytes)}.` : "Vacía.", act: trash.length > 0 && ["Abrir la papelera", () => openApp("trash")] },
    { sev: !lastLocal ? "info" : Date.now() - lastLocal > 30 * DAY ? "warn" : "ok", title: "Tu copia de seguridad", text: lastLocal ? `Última copia descargada en este equipo: ${fmtDate(lastLocal)}.` : "Aún no has descargado una copia de tus archivos desde este equipo.", act: ["Hacer una copia", () => go("copias")] },
    upd && { sev: upd.error ? "info" : upd.newer ? "warn" : "ok", title: "Actualizaciones de Sotos", text: upd.error || (upd.newer ? `Sotos ${upd.latest} está disponible (este servidor tiene la ${upd.current}).` : `Sotos ${upd.current} está al día.`), act: upd.newer && ["Instalar", () => openApp("admin", { tab: "servidor", nonce: Date.now() })] },
    bk && { sev: !lastSrv ? "warn" : Date.now() - lastSrv.finished > 2 * DAY ? "warn" : "ok", title: "Copias del servidor", text: lastSrv ? `Última copia completa: ${fmtDate(lastSrv.finished)}.` : "El servidor todavía no tiene copias de seguridad.", act: ["Ver copias", () => openApp("admin", { tab: "copias", nonce: Date.now() })] },
  ].filter(Boolean);
  const issues = checks.filter(c => c.sev === "warn" || c.sev === "bad").length;
  const ICON = { ok: "check_circle", warn: "warning", bad: "error", info: "info" };
  return <>
    <Head title="Revisa el estado de tu Sotos" />
    <div className={"cp-alert " + (issues ? "warn" : "ok")}><Ic name={issues ? "flag" : "verified_user"} /><div>{issues ? `${issues} elemento${issues > 1 ? "s requieren" : " requiere"} tu atención.` : "No se encontraron problemas."}</div></div>
    <div className="cp-checks">{checks.map(c => <div key={c.title} className={"cp-checkrow " + c.sev}><Ic name={ICON[c.sev]} /><div><b>{c.title}</b><span>{c.text}</span></div>{c.act && <button className="tb-btn" onClick={c.act[1]}>{c.act[0]}</button>}</div>)}</div>
  </>;
}

/* ---------------- Copias de seguridad ---------------- */
function Copias({ me, openApp }) {
  const admin = me?.role === "admin";
  const [bk, setBk] = useState(null), [running, setRunning] = useState(false);
  useEffect(() => { if (admin) api("GET", "admin/backups").then(setBk).catch(() => {}); }, []);
  const run = async () => { setRunning(true); try { setBk(await api("POST", "admin/backups")); toast("Copia del servidor terminada", { icon: "backup" }); } catch (e) { toast(e.message, { error: true }); } setRunning(false); };
  return <>
    <Head title="Haz una copia de seguridad de tus cosas" sub="La copia es un .zip con tus archivos (con sus carpetas), contactos, calendario, tareas y ajustes. Restaurarla no borra nada: lo importado va a una carpeta nueva." />
    <BackupRows />
    {admin && <section className="cp-sys"><h3>Copias del servidor</h3>
      {!bk ? <div className="faint">Cargando…</div> : <>
        <div className="cp-kv"><span>Programación</span><b>{bk.hour != null ? `Todos los días a las ${String(bk.hour).padStart(2, "0")}:00 · se guardan ${bk.keep}` : "Sin programar"}</b></div>
        <div className="cp-kv"><span>Carpeta</span><b><code>{bk.dir}</code></b></div>
        {bk.lastError && <div className="cp-kv"><span>Último error</span><b className="cp-bad">{bk.lastError}</b></div>}
        {(bk.items || []).slice(0, 5).map(i => <div key={i.name} className="cp-kv"><span>{i.name.replace("_", " ").replace(/-(\d\d)-(\d\d)$/, ":$1:$2").replace(/-(\d\d)$/, ":$1")}</span><b>{i.complete ? `${i.size ? fmtSize(i.size) + " · " : ""}${i.reason || "completa"}` : "incompleta"}</b></div>)}
        <div className="cp-actions"><button className="tb-btn" disabled={running || bk.running} onClick={run}><Ic name="backup" /> {running || bk.running ? "Haciendo la copia…" : "Hacer una copia ahora"}</button>
          <button className="tb-btn" onClick={() => openApp("admin", { tab: "copias", nonce: Date.now() })}>Más opciones (copia fuera del servidor)</button></div>
      </>}
    </section>}
  </>;
}

/* ---------------- Herramientas administrativas ---------------- */
function Herramientas({ openApp }) {
  const tools = [["monitoring", "Monitor del servidor", "Cuentas, sesiones, espacio, memoria y disco.", "resumen"], ["group", "Usuarios", "Crear, desactivar o eliminar cuentas, cuotas y apps visibles.", "usuarios"],
    ["history", "Registro de eventos", "Quién hizo qué y cuándo en la administración.", "registro"], ["backup", "Copias del servidor", "Copias diarias y copia fuera del servidor.", "copias"],
    ["extension", "Apps del servidor", "Instalar apps del SDK desde un .zip.", "apps"], ["dns", "Servidor y actualizaciones", "Registro de cuentas, correo del sistema y actualizar Sotos.", "servidor"]];
  return <>
    <Head title="Herramientas administrativas" sub="Accesos a la administración de este servidor de Sotos." />
    <div className="cp-tools">{tools.map(([icon, name, desc, tab]) => <button key={tab} className="cp-tool" onClick={() => openApp("admin", { tab, nonce: Date.now() })}><CpIcon icon={icon} size={32} /><span><b>{name}</b><span className="faint">{desc}</span></span></button>)}
      <button className="cp-tool" onClick={() => openApp("terminal")}><CpIcon icon="terminal" size={32} /><span><b>Terminal</b><span className="faint">Comandos sobre tus archivos.</span></span></button></div>
  </>;
}

/* ---------------- Cuentas de usuario ---------------- */
function Cuentas({ me, user, env, onLogout, profile, openApp }) {
  const admin = me?.role === "admin"; const [users, setUsers] = useState(null);
  useEffect(() => { if (admin) api("GET", "admin/users").then(r => setUsers(r.items)).catch(() => {}); }, []);
  return <>
    <Head title="Cambia tu cuenta de usuario" />
    <div className="cp-acct"><Avatar profile={profile} size={64} />
      <div><b>{profile?.name || "Invitado"}</b><span className="faint">{me ? me.email : "Sin cuenta"}</span>
        <span className="cp-badges">{me && <em>{admin ? "Administrador" : "Usuario estándar"}</em>}{me?.twoFactor && <em>Dos pasos</em>}</span></div>
      <div className="cp-acct-links"><Link onClick={() => openApp("settings", { tab: "perfil" })}>Cambiar tu foto o tu nombre</Link>{me && <Link onClick={() => openApp("control", { applet: "sesiones", nonce: Date.now() })}>Ver dónde está abierta tu cuenta</Link>}</div>
    </div>
    <AccountPanel user={user} env={env} onLogout={onLogout} />
    {admin && users && <section className="cp-sys"><h3>Otras cuentas de este servidor</h3>
      <div className="cp-users">{users.filter(u => u.id !== me.id).map(u => <button key={u.id} className={"cp-user" + (u.disabled ? " off" : "")} onClick={() => openApp("admin", { tab: "usuarios", nonce: Date.now() })}>
        <Avatar profile={{ name: u.name, avatar: u.avatar }} size={36} /><span><b>{u.name}</b><span className="faint">{u.role === "admin" ? "Administrador" : "Usuario estándar"}{u.disabled ? " · desactivada" : ""}</span></span></button>)}
        <button className="cp-user add" onClick={() => openApp("admin", { tab: "usuarios", nonce: Date.now() })}><Ic name="person_add" size={22} /><span><b>Crear una cuenta</b><span className="faint">o administrar las existentes</span></span></button></div>
    </section>}
  </>;
}

/* ---------------- Personalización y fondo ---------------- */
function Personalizacion({ settings, update, go }) {
  const skin = settings.skin || "sotos";
  return <>
    <Head title="Cambia el aspecto de tu escritorio" sub="Un tema cambia a la vez el fondo, las ventanas, los íconos y los sonidos." />
    <div className="skin-grid">{SKINS().map(k => <button key={k.v} className={"skin-card" + (skin === k.v ? " on" : "")} onClick={() => applySkin(settings, update, k.v)}>
      <span className={"skin-prev skin-prev-" + k.v + (settings.theme === "dark" ? " dark" : "")}><i /><b /><em /></span>
      <span className="skin-name">{k.label}{k.year && <span className="skin-year">{k.year}</span>}{skin === k.v && <Ic name="check_circle" size={16} />}</span>
      <span className="skin-desc">{k.desc}</span></button>)}</div>
    <div className="cp-strip">
      <button onClick={() => go("fondo")}><CpIcon icon="wallpaper" size={36} /><b>Fondo de escritorio</b><span className="faint">{String(settings.wallpaper).startsWith("file:") ? "Imagen propia" : "Cambiar"}</span></button>
      <button onClick={() => update("theme", settings.theme === "dark" ? "light" : "dark")}><CpIcon icon={settings.theme === "dark" ? "dark_mode" : "light_mode"} size={36} /><b>Modo {settings.theme === "dark" ? "oscuro" : "claro"}</b><span className="faint">Cambiar a {settings.theme === "dark" ? "claro" : "oscuro"}</span></button>
      <button onClick={() => go("sonido")}><CpIcon icon="volume_up" size={36} /><b>Sonidos</b><span className="faint">{ERAS[skin] ? (eraSoundsOn() ? ERAS[skin].name : "Apagados") : "Solo en temas de época"}</span></button>
    </div>
    <Row label="Color de acento" desc="Botones, selección y resaltados">
      <div style={{ display: "flex", gap: 8 }}>{ACCENTS.map(c => <button key={c} className={"cp-swatch" + (settings.accent === c ? " on" : "")} style={{ "--sw": c }} aria-label={"Acento " + c} onClick={() => update("accent", c)}>{settings.accent === c && <Ic name="check" size={16} />}</button>)}</div>
    </Row>
  </>;
}
function Fondo({ settings, update }) {
  return <>
    <Head title="Elige el fondo de escritorio" sub="También puedes usar una foto tuya: clic derecho sobre una imagen en Archivos → Usar como fondo." />
    <div className="wall-group">Ilustraciones y épocas</div>
    <div className="wall-grid">{[...WALLS, ...ERA_WALLS].map(w => <WallThumb key={w.id} w={w} on={settings.wallpaper === w.id} onPick={() => update("wallpaper", w.id)} />)}</div>
    <div className="wall-group">Fotos de Colombia <span className="faint">· libres de derechos (CC0)</span></div>
    <div className="wall-grid">{PHOTO_WALLS.map(w => <WallThumb key={w.id} w={w} on={settings.wallpaper === w.id} onPick={() => update("wallpaper", w.id)} />)}</div>
  </>;
}

/* ---------------- Sonido ---------------- */
const EVENTS = [["entrar", "Iniciar sesión"], ["salir", "Cerrar sesión"], ["abrir", "Abrir un programa"], ["cerrar", "Cerrar un programa"], ["minimizar", "Minimizar"], ["maximizar", "Maximizar"], ["inicio", "Menú Inicio"], ["aviso", "Notificación"], ["error", "Error"], ["vaciar", "Vaciar la papelera"]];
const useDevices = () => {
  const [list, setList] = useState(null);
  const load = () => navigator.mediaDevices?.enumerateDevices ? navigator.mediaDevices.enumerateDevices().then(setList).catch(() => setList([])) : setList([]);
  useEffect(() => { load(); navigator.mediaDevices?.addEventListener?.("devicechange", load); return () => navigator.mediaDevices?.removeEventListener?.("devicechange", load); }, []);
  return [list, load];
};
function Sonido({ settings }) {
  const [tab, setTab] = useState("rep"); const [devs, reload] = useDevices();
  return <>
    <Head title="Sonido" />
    <div className="cp-tabs" role="tablist">{[["rep", "Reproducción"], ["grab", "Grabación"], ["son", "Sonidos"]].map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? "on" : ""} onClick={() => setTab(v)}>{l}</button>)}</div>
    {tab === "rep" && <Speakers devs={devs} />}
    {tab === "grab" && <Mic devs={devs} reload={reload} />}
    {tab === "son" && <Esquema skin={settings.skin} />}
  </>;
}
function Speakers({ devs }) {
  const outs = (devs || []).filter(d => d.kind === "audiooutput"), [side, setSide] = useState(null), [vol, setVol] = useState(0.5), [dev, setDev] = useState("");
  const test = async () => {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return toast("Este navegador no puede reproducir sonido sintetizado", { error: true });
    const a = new C(); if (dev && a.setSinkId) await a.setSinkId(dev).catch(() => {});
    const beep = (pan, at) => { const o = a.createOscillator(), g = a.createGain(), p = a.createStereoPanner(); o.frequency.value = 660; p.pan.value = pan; const t = a.currentTime + at;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * vol + 0.0001, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); o.connect(g); g.connect(p); p.connect(a.destination); o.start(t); o.stop(t + 0.6); };
    beep(-1, 0); beep(1, 0.8); setSide("izq"); setTimeout(() => setSide("der"), 800); setTimeout(() => { setSide(null); a.close(); }, 1600);
  };
  return <div className="cp-snd">
    <div className="cp-kv"><span>Salida</span><b>{outs.length ? <select className="sc-input" style={{ margin: 0 }} value={dev} onChange={e => setDev(e.target.value)}>{outs.map((d, i) => <option key={d.deviceId || i} value={d.deviceId === "default" ? "" : d.deviceId}>{d.label || `Salida ${i + 1}`}</option>)}</select> : "La predeterminada del equipo"}</b></div>
    <div className="cp-kv"><span>Volumen de la prueba</span><b><input type="range" min={0} max={1} step={0.05} value={vol} onChange={e => setVol(+e.target.value)} aria-label="Volumen de la prueba" /></b></div>
    <div className="cp-spk"><span className={side === "izq" ? "on" : ""}><Ic name="speaker" size={34} />Izquierdo</span><button className="tb-btn primary" disabled={!!side} onClick={test}><Ic name="play_arrow" /> Probar</button><span className={side === "der" ? "on" : ""}><Ic name="speaker" size={34} />Derecho</span></div>
    <div className="faint cp-note">Suena primero el altavoz izquierdo y después el derecho. Si un lado no suena, revisa el cable o el balance del equipo.</div>
  </div>;
}
function Mic({ devs, reload }) {
  const ins = (devs || []).filter(d => d.kind === "audioinput"), [dev, setDev] = useState(""), [level, setLevel] = useState(0), [on, setOn] = useState(false), [peak, setPeak] = useState(0);
  const st = useRef(null);
  const stop = () => { const s = st.current; if (!s) return; cancelAnimationFrame(s.raf); s.stream.getTracks().forEach(t => t.stop()); s.ctx.close().catch(() => {}); st.current = null; setOn(false); setLevel(0); };
  useEffect(() => stop, []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: dev ? { deviceId: { exact: dev } } : true }); reload();
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize); st.current = { stream, ctx, raf: 0 }; setOn(true); setPeak(0);
      const tickL = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; const v = Math.min(1, Math.sqrt(s / buf.length) * 4); setLevel(v); setPeak(p => Math.max(p, v)); if (st.current) st.current.raf = requestAnimationFrame(tickL); };
      tickL();
    } catch (e) { toast(e.name === "NotAllowedError" ? "El navegador no dio permiso para usar el micrófono" : e.name === "NotFoundError" ? "No hay ningún micrófono conectado" : e.message, { error: true }); }
  };
  return <div className="cp-snd">
    <div className="cp-kv"><span>Micrófono</span><b>{ins.length ? <select className="sc-input" style={{ margin: 0 }} value={dev} disabled={on} onChange={e => setDev(e.target.value)}>{ins.map((d, i) => <option key={d.deviceId || i} value={d.deviceId === "default" ? "" : d.deviceId}>{d.label || `Micrófono ${i + 1}`}</option>)}</select> : devs ? "No se encontró ningún micrófono" : "…"}</b></div>
    <div className="cp-meter" aria-label="Nivel del micrófono"><i style={{ width: Math.round(level * 100) + "%" }} /><em style={{ left: Math.round(peak * 100) + "%" }} /></div>
    <div className="cp-actions">{on ? <button className="tb-btn" onClick={stop}><Ic name="stop" /> Detener</button> : <button className="tb-btn primary" onClick={start}><Ic name="mic" /> Probar el micrófono</button>}</div>
    <div className="faint cp-note">{on ? (peak > 0.15 ? "Se oye bien. Habla normal: la barra debería llegar a la mitad." : "Habla cerca del micrófono…") : "Al probarlo, el navegador te pedirá permiso. Nada se graba ni se envía: el sonido solo se mide aquí."}{ins.length && !ins[0].label ? " Los nombres de los micrófonos aparecen después de dar permiso." : ""}</div>
  </div>;
}
function Esquema({ skin }) {
  const [, tick] = useState(0); const [set, setSet] = useState(ERAS[skin] ? skin : "vidrio"); const on = eraSoundsOn();
  return <div className="cp-snd">
    {!ERAS[skin] && <div className="cp-alert info"><Ic name="info" /><div>Los sonidos del sistema suenan con los temas de época (Prado, Cristal, Vidrio, Mosaico y Aluminio). Aquí puedes escucharlos igual.</div></div>}
    <div className="cp-kv"><span>Sonidos del sistema</span><b><Segmented value={on ? "y" : "n"} onChange={v => { setEraSounds(v === "y"); tick(x => x + 1); }} options={[{ v: "y", label: "Activados", icon: "volume_up" }, { v: "n", label: "Apagados", icon: "volume_off" }]} /></b></div>
    <div className="cp-kv"><span>Esquema para escuchar</span><b><select className="sc-input" style={{ margin: 0 }} value={set} onChange={e => setSet(e.target.value)}>{Object.entries(ERAS).map(([v, e]) => <option key={v} value={v}>{e.name} ({e.year})</option>)}</select></b></div>
    <div className="cp-events">{EVENTS.map(([ev, label]) => <div key={ev} className="cp-event"><Ic name="music_note" size={18} /><span>{label}</span><button className="tb-btn" disabled={!on} title={on ? "Escuchar" : "Los sonidos están apagados"} onClick={() => playEra(set, ev)}><Ic name="play_arrow" /> Probar</button></div>)}</div>
    {!on && <div className="faint cp-note">Activa los sonidos para escucharlos.</div>}
  </div>;
}

/* ---------------- Dispositivos ---------------- */
function Dispositivos({ openApp }) {
  const [devs, reload] = useDevices(); const [bat, setBat] = useState(null), [cam, setCam] = useState(false), [pads, setPads] = useState([]), [, tick] = useState(0);
  useEffect(() => {
    let b = null; const upd = () => setBat({ level: b.level, charging: b.charging, time: b.charging ? b.chargingTime : b.dischargingTime });
    navigator.getBattery?.().then(x => { b = x; upd(); ["levelchange", "chargingchange"].forEach(e => b.addEventListener(e, upd)); }).catch(() => {});
    const gp = () => setPads([...(navigator.getGamepads?.() || [])].filter(Boolean).map(p => p.id));
    gp(); window.addEventListener("gamepadconnected", gp); window.addEventListener("gamepaddisconnected", gp);
    const net = () => tick(x => x + 1); window.addEventListener("online", net); window.addEventListener("offline", net);
    return () => { if (b) ["levelchange", "chargingchange"].forEach(e => b.removeEventListener(e, upd)); window.removeEventListener("gamepadconnected", gp); window.removeEventListener("gamepaddisconnected", gp); window.removeEventListener("online", net); window.removeEventListener("offline", net); };
  }, []);
  const by = (k) => (devs || []).filter(d => d.kind === k);
  const conn = navigator.connection, fine = matchMedia("(pointer: fine)").matches, touch = navigator.maxTouchPoints > 0;
  const hrs = (s) => !isFinite(s) || !s ? "" : s < 3600 ? ` · ${Math.round(s / 60)} min` : ` · ${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min`;
  const cards = [
    ["monitor", "Pantalla", [`${screen.width} × ${screen.height}`, `Escala ${Math.round(devicePixelRatio * 100)} % · ${screen.colorDepth} bits`, screen.orientation?.type?.startsWith("portrait") ? "Vertical" : "Horizontal"]],
    ["mouse", "Entrada", [fine ? "Ratón o panel táctil" : "Sin puntero fino", touch ? `Pantalla táctil (${navigator.maxTouchPoints} puntos)` : "Sin pantalla táctil", "Teclado"]],
    ["photo_camera", "Cámaras", by("videoinput").length ? by("videoinput").map((d, i) => d.label || `Cámara ${i + 1}`) : ["Ninguna detectada"], by("videoinput").length > 0 && ["Probar", () => setCam(true)]],
    ["mic", "Micrófonos", by("audioinput").filter(d => d.deviceId !== "default").map((d, i) => d.label || `Micrófono ${i + 1}`).concat(by("audioinput").length ? [] : ["Ninguno detectado"])],
    ["speaker", "Altavoces y auriculares", by("audiooutput").filter(d => d.deviceId !== "default").map((d, i) => d.label || `Salida ${i + 1}`).concat(by("audiooutput").length ? [] : ["La salida predeterminada"])],
    ["battery_full", "Batería", bat ? [`${Math.round(bat.level * 100)} %${bat.charging ? " · cargando" : ""}${hrs(bat.time)}`] : ["Sin batería o el navegador no la informa"]],
    ["wifi", "Red", [navigator.onLine ? "Conectado" : "Sin conexión", conn?.effectiveType ? `Calidad ${conn.effectiveType.toUpperCase()}${conn.downlink ? ` · ~${conn.downlink} Mb/s` : ""}${conn.rtt ? ` · ${conn.rtt} ms` : ""}` : "El navegador no informa la velocidad"]],
    ["sports_esports", "Mandos de juego", pads.length ? pads : ["Ninguno (pulsa un botón del mando para que aparezca)"]],
  ];
  const noLabels = (devs || []).some(d => !d.label && d.kind !== "audiooutput");
  return <>
    <Head title="Dispositivos de este equipo" sub="Lo que el navegador deja ver de este computador o celular. Los dispositivos conectados aparecen al momento." />
    <div className="cp-devs">{cards.map(([icon, name, lines, act]) => <div key={name} className="cp-dev"><CpIcon icon={icon} size={36} /><div><b>{name}</b>{lines.map((l, i) => <span key={i} className="faint">{l}</span>)}{act && <button className="tb-btn" onClick={act[1]}>{act[0]}</button>}</div></div>)}</div>
    {noLabels && <div className="faint cp-note">Los nombres de cámaras y micrófonos aparecen cuando el navegador tiene permiso: prueba la cámara o el micrófono una vez.</div>}
    <div className="cp-actions"><button className="tb-btn" onClick={reload}><Ic name="refresh" /> Volver a buscar</button>{APPS.find(a => a.id === "diagnostico") && <button className="tb-btn" onClick={() => openApp(appAllowed("diagnostico", vfs.getState().user) ? "diagnostico" : "store")}><Ic name="build" /> Diagnóstico completo</button>}</div>
    {cam && <CamTest onClose={() => { setCam(false); reload(); }} />}
  </>;
}
function CamTest({ onClose }) {
  const v = useRef(null), [err, setErr] = useState(null);
  useEffect(() => { let s = null; navigator.mediaDevices.getUserMedia({ video: true }).then(x => { s = x; if (v.current) v.current.srcObject = x; }).catch(e => setErr(e.name === "NotAllowedError" ? "El navegador no dio permiso para usar la cámara." : e.message)); return () => s?.getTracks().forEach(t => t.stop()); }, []);
  return <Modal title="Prueba de la cámara" icon="photo_camera" onClose={onClose} width={520} actions={<button className="tb-btn primary" onClick={onClose}>Listo</button>}>
    {err ? <div className="cp-alert warn"><Ic name="videocam_off" /><div>{err}</div></div> : <video ref={v} className="cp-cam" autoPlay muted playsInline />}
    <div className="faint cp-note">La imagen se ve solo aquí; no se graba ni se envía.</div>
  </Modal>;
}

/* ---------------- Fecha y hora ---------------- */
const ZONES = (() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return ["America/Bogota", "America/Mexico_City", "America/New_York", "Europe/Madrid", "UTC"]; } })();
const partsIn = (d, tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).formatToParts(d).map(x => [x.type, +x.value || 0])); return { h: p.hour % 24, m: p.minute, s: p.second }; };
function Clock({ now, tz, size = 150 }) {
  const { h, m, s } = partsIn(now, tz), r = size / 2;
  const hand = (deg, len, w, cls) => <line className={cls} x1={r} y1={r} x2={r + len * Math.sin(deg * Math.PI / 180)} y2={r - len * Math.cos(deg * Math.PI / 180)} strokeWidth={w} strokeLinecap="round" />;
  return <svg className="cp-clock" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${h}:${String(m).padStart(2, "0")}`}>
    <circle cx={r} cy={r} r={r - 3} className="face" />
    {Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return <line key={i} className="tick" x1={r + (r - 10) * Math.sin(a)} y1={r - (r - 10) * Math.cos(a)} x2={r + (r - (i % 3 ? 15 : 20)) * Math.sin(a)} y2={r - (r - (i % 3 ? 15 : 20)) * Math.cos(a)} strokeWidth={i % 3 ? 1.5 : 3} />; })}
    {hand((h % 12) * 30 + m / 2, r * 0.5, size / 30, "hh")}{hand(m * 6 + s / 10, r * 0.72, size / 45, "mh")}{size > 90 && hand(s * 6, r * 0.8, 1.2, "sh")}
    <circle cx={r} cy={r} r={size / 40} className="pin" />
  </svg>;
}
function Reloj({ settings, update, go }) {
  const [now, setNow] = useState(new Date()); useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const [drift, setDrift] = useState(null), [add, setAdd] = useState("");
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone, tz = settings.region?.timeZone && settings.region.timeZone !== "auto" ? settings.region.timeZone : here;
  const extra = (settings.extraClocks || []).filter(z => ZONES.includes(z)).slice(0, 3);
  const check = async () => { setDrift("…"); try { const t0 = Date.now(); const r = await fetch("/api/health", { cache: "no-store" }); const t1 = Date.now(); const d = Date.parse(r.headers.get("date")); if (!d) throw new Error(); setDrift(d + 500 - (t0 + t1) / 2); } catch { setDrift("error"); } };
  useEffect(() => { check(); }, []);
  const offset = (z) => { const a = partsIn(now, z), b = partsIn(now, tz); let d = (a.h * 60 + a.m) - (b.h * 60 + b.m); if (d > 720) d -= 1440; if (d < -720) d += 1440; return d === 0 ? "misma hora" : `${d > 0 ? "+" : "−"}${Math.floor(Math.abs(d) / 60)} h${Math.abs(d) % 60 ? " " + (Math.abs(d) % 60) + " min" : ""}`; };
  const fmt = (z) => now.toLocaleTimeString("es", { timeZone: z, hour: "2-digit", minute: "2-digit", hour12: !settings.clock24 });
  return <>
    <Head title="Fecha y hora" />
    <div className="cp-time">
      <Clock now={now} tz={tz} />
      <div><div className="cp-big">{now.toLocaleTimeString("es", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: !settings.clock24 })}</div>
        <div className="cp-date">{now.toLocaleDateString("es", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        <div className="faint">Zona horaria: {tz.replace(/_/g, " ")}{tz === here ? " (la del equipo)" : ""} · <Link onClick={() => go("region")}>Cambiar</Link></div></div>
    </div>
    <Row label="Formato de la hora" desc="En la barra de tareas, los widgets y aquí"><Segmented value={settings.clock24 ? "y" : "n"} onChange={v => update("clock24", v === "y")} options={[{ v: "y", label: "24 horas" }, { v: "n", label: "12 horas" }]} /></Row>
    <Row label="Hora de este equipo" desc={drift === null || drift === "…" ? "Comparando con el servidor…" : drift === "error" ? "No se pudo comparar con el servidor" : Math.abs(drift) < 2000 ? "Está en hora (comparada con el servidor de Sotos)." : `Va ${Math.round(Math.abs(drift) / 1000)} s ${drift > 0 ? "atrasada" : "adelantada"} respecto al servidor. Corrígela en la configuración de tu equipo.`}>
      <button className="tb-btn" onClick={check}><Ic name="sync" /> Comprobar</button></Row>
    <section className="cp-sys"><h3>Relojes adicionales</h3>
      <div className="cp-clocks">{extra.map(z => <div key={z} className="cp-clock-card"><Clock now={now} tz={z} size={74} /><div><b>{z.split("/").pop().replace(/_/g, " ")}</b><span>{fmt(z)}</span><span className="faint">{offset(z)}</span></div>
        <button className="tb-btn icon" title="Quitar" onClick={() => update("extraClocks", extra.filter(x => x !== z))}><Ic name="close" size={16} /></button></div>)}</div>
      {extra.length < 3 && <div className="cp-actions"><select className="sc-input" style={{ margin: 0, width: 260 }} value={add} onChange={e => setAdd(e.target.value)}><option value="">Elige una zona…</option>{ZONES.filter(z => !extra.includes(z) && z !== tz).map(z => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select>
        <button className="tb-btn" disabled={!add} onClick={() => { update("extraClocks", [...extra, add]); setAdd(""); }}><Ic name="add" /> Agregar reloj</button></div>}
    </section>
  </>;
}

/* ---------------- Almacenamiento ---------------- */
const GROUPS = [["Documentos", ["docx", "xlsx", "csv", "pptx", "pdf", "txt", "code", "drawio", "excalidraw"], "doc"], ["Imágenes", ["img"], "img"], ["Música", ["audio"], "aud"], ["Vídeos", ["video"], "vid"], ["Comprimidos", ["zip"], "zip"]];
function Almacenamiento({ me, openApp }) {
  const root = useVfs(s => s.root), trash = useVfs(s => s.trash) || [], sync = useVfs(s => s.sync), mode = useVfs(s => s.mode);
  const [est, setEst] = useState(null), [cache, setCache] = useState(null), [ask, setAsk] = useState(null), [, tick] = useState(0);
  useEffect(() => { navigator.storage?.estimate?.().then(setEst).catch(() => {}); vfs.cacheBytes().then(setCache).catch(() => setCache(0)); }, []);
  const by = Object.fromEntries(GROUPS.map(g => [g[0], 0])); let other = 0; const files = [];
  vfs.walk(n => { if (n.children || n.type === "folder") return; const sz = n.size || 0; files.push(n); const g = GROUPS.find(g => g[1].includes(n.type)); if (g) by[g[0]] += sz; else other += sz; }, root || undefined);
  const trashBytes = trash.reduce((n, t) => n + vfs.folderSize(t.node), 0);
  const parts = [...GROUPS.map(g => [g[0], by[g[0]], g[2]]), ["Otros", other, "oth"], ["Papelera", trashBytes, "trash"]].filter(p => p[1] > 0);
  const used = parts.reduce((n, p) => n + p[1], 0), cap = mode === "cloud" ? sync.quota : est?.quota;
  const big = files.filter(n => n.size > 0).sort((a, b) => b.size - a.size).slice(0, 10);
  const doAsk = async () => { const a = ask; setAsk(null); try { if (a === "trash") { await vfs.emptyTrash(); toast("Papelera vaciada", { icon: "delete_forever" }); } else { await vfs.clearCache(); setCache(await vfs.cacheBytes()); toast("Se borró la copia local; los archivos se vuelven a bajar al abrirlos", { icon: "cleaning_services" }); } } catch (e) { toast(e.message, { error: true }); } tick(x => x + 1); };
  return <>
    <Head title="Almacenamiento" sub={mode === "cloud" ? "Tus archivos están en el servidor; este navegador guarda una copia de lo que abres para que cargue rápido." : "Como invitado, tus archivos viven solo en este navegador."} />
    <div className="cp-disk"><div className="cp-disk-head"><CpIcon icon="cloud" size={40} /><div><b>{mode === "cloud" ? "Tu espacio en la nube" : "Este navegador"}</b><span className="faint">{fmtSize(used)} usados{cap ? ` de ${fmtSize(cap)} · ${fmtSize(Math.max(0, cap - used))} libres` : ""}</span></div></div>
      <div className="cp-stack" role="img" aria-label="Uso del espacio por tipo">{parts.map(([l, v, c]) => <i key={l} className={"k-" + c} style={{ width: Math.max(0.6, v / (cap || used || 1) * 100) + "%" }} title={`${l}: ${fmtSize(v)}`} />)}</div>
      <div className="cp-legend">{parts.map(([l, v, c]) => <span key={l}><i className={"k-" + c} />{l} <b>{fmtSize(v)}</b></span>)}</div></div>
    <Row label="Papelera" desc={trash.length ? `${trash.length} elemento(s), ${fmtSize(trashBytes)}. Se vacía sola a los 30 días.` : "Vacía"}>
      <div style={{ display: "flex", gap: 6 }}><button className="tb-btn" onClick={() => openApp("trash")}>Abrir</button><button className="tb-btn danger" disabled={!trash.length} onClick={() => setAsk("trash")}><Ic name="delete_forever" /> Vaciar</button></div></Row>
    {mode === "cloud" && <Row label="Copia local en este navegador" desc={cache == null ? "Calculando…" : `${fmtSize(cache)}. Borrarla libera espacio en este equipo; nada se pierde en la nube.`}>
      <button className="tb-btn" disabled={!cache || sync.pending > 0} title={sync.pending ? "Espera a que se suban los cambios" : ""} onClick={() => setAsk("cache")}><Ic name="cleaning_services" /> Borrar copia local</button></Row>}
    <section className="cp-sys"><h3>Archivos más grandes</h3>
      {!big.length ? <div className="faint">No hay archivos todavía.</div> : big.map(n => <div key={n.id} className="cp-bigfile"><span className="cp-bf-name" title={vfs.pathString(n.id)}>{n.name}<span className="faint">{vfs.pathString(vfs.parentOf(n.id)?.id || vfs.ROOT) || "/"}</span></span><b>{fmtSize(n.size)}</b>
        <button className="tb-btn icon" title="Mostrar en Archivos" onClick={() => openApp("files", { folderId: vfs.parentOf(n.id)?.id })}><Ic name="folder_open" size={17} /></button>
        <button className="tb-btn icon" title="Mover a la papelera" onClick={() => { vfs.trash([n.id]); toast(`«${n.name}» se movió a la papelera`, { icon: "delete" }); }}><Ic name="delete" size={17} /></button></div>)}
    </section>
    {ask && <Modal title={ask === "trash" ? "¿Vaciar la papelera?" : "¿Borrar la copia local?"} icon={ask === "trash" ? "delete_forever" : "cleaning_services"} onClose={() => setAsk(null)} width={420}
      actions={<><button className="tb-btn" onClick={() => setAsk(null)}>Cancelar</button><button className="tb-btn danger" onClick={doAsk}>{ask === "trash" ? "Vaciar para siempre" : "Borrar"}</button></>}>
      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{ask === "trash" ? <>Se borrarán para siempre {trash.length} elemento(s) ({fmtSize(trashBytes)}). <b>No se puede deshacer.</b></> : "Se borra lo que este navegador guardó para abrir rápido tus archivos. Tus archivos siguen en la nube y se vuelven a bajar cuando los abras."}</div>
    </Modal>}
  </>;
}
