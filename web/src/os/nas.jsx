/* ============================================================
   Sotos — Carpetas del NAS
   Las carpetas compartidas del servidor (Música, Fotos, Vídeos…), tal como están en el disco.
   Ver, descargar, copiar a tus archivos y, si eres administrador, subir, crear, renombrar,
   guardar desde tus archivos y mandar a la papelera del NAS.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, toast, EmptyState, SideItem, Toolbar, FileGlyph, ContextMenu, Modal } from "./ui.jsx";
import { api } from "./api.js";
import { fmtSize, fmtDate } from "./vfs.js";
import * as vfs from "./vfs.js";
import { pickFiles } from "./filepicker.jsx";
const { useState, useEffect, useRef, useCallback } = React;

const fileUrl = (p, dl) => "/api/nas/file?p=" + encodeURIComponent(p) + (dl ? "&dl=1" : "");
const join = (dir, name) => dir.replace(/\/$/, "") + "/" + name;
const ROOT_ICON = (n) => /m[uú]sica|music/i.test(n) ? "music_note" : /foto|photo|imag/i.test(n) ? "image" : /v[ií]deo|video|pel/i.test(n) ? "movie" : /famil|home|casa/i.test(n) ? "home" : "folder_shared";
const PREVIEW = { img: "img", video: "video", audio: "audio", pdf: "pdf", txt: "txt", md: "txt" };

/** pedir un nombre (nueva carpeta, renombrar) */
function NameDialog({ title, icon, initial = "", okLabel, onOk, onClose }) {
  const [v, setV] = useState(initial);
  const submit = (e) => { e.preventDefault(); const s = v.trim(); if (s) onOk(s); };
  return <Modal title={title} icon={icon} onClose={onClose} width={400}>
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <input className="nas-input" autoFocus value={v} onChange={e => setV(e.target.value)} aria-label="Nombre" onFocus={e => { const i = e.target.value.lastIndexOf("."); e.target.setSelectionRange(0, i > 0 ? i : e.target.value.length); }} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="tb-btn" onClick={onClose}>Cancelar</button>
        <button className="tb-btn primary" disabled={!v.trim()}>{okLabel}</button>
      </div>
    </form>
  </Modal>;
}

function ConfirmDialog({ title, text, okLabel, onOk, onClose }) {
  return <Modal title={title} icon="delete" onClose={onClose} width={420}>
    <p style={{ margin: "0 0 14px" }}>{text}</p>
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button className="tb-btn" onClick={onClose}>Cancelar</button>
      <button className="tb-btn danger" onClick={onOk}>{okLabel}</button>
    </div>
  </Modal>;
}

function Preview({ entry, path, onClose }) {
  const url = fileUrl(path), kind = PREVIEW[entry.type];
  const [text, setText] = useState(null);
  useEffect(() => { if (kind !== "txt") return; fetch(url, { headers: { range: "bytes=0-200000" } }).then(r => r.text()).then(setText).catch(() => setText("No se pudo leer el archivo.")); }, [url, kind]);
  return <div className="nas-preview">
    <div className="nas-preview-bar"><b title={entry.name}>{entry.name}</b><span className="faint">{fmtSize(entry.size)}</span>
      <a className="tb-btn" href={fileUrl(path, true)} download={entry.name}><Ic name="download" size={16} /> Descargar</a>
      <button className="tb-btn icon" title="Cerrar vista previa" aria-label="Cerrar vista previa" onClick={onClose}><Ic name="close" size={18} /></button></div>
    <div className="nas-preview-body">
      {kind === "img" && <img src={url} alt={entry.name} />}
      {kind === "video" && <video src={url} controls autoPlay playsInline />}
      {kind === "audio" && <div className="nas-audio"><Ic name="music_note" size={64} /><audio src={url} controls autoPlay /></div>}
      {kind === "pdf" && <iframe src={url} title={entry.name} />}
      {kind === "txt" && <pre>{text ?? "Cargando…"}</pre>}
    </div>
  </div>;
}

export function NasApp({ openItem }) {
  const cloud = vfs.getState().mode === "cloud";
  const [info, setInfo] = useState(null), [cwd, setCwd] = useState(null), [list, setList] = useState(null), [err, setErr] = useState(null);
  const [view, setView] = useState("grid"), [q, setQ] = useState(""), [sel, setSel] = useState(null), [preview, setPreview] = useState(null);
  const [ctx, setCtx] = useState(null), [dialog, setDialog] = useState(null), [busy, setBusy] = useState(0);
  const upInput = useRef(null), loadSeq = useRef(0);

  useEffect(() => { if (!cloud) return; api("GET", "nas").then(r => { setInfo(r); if (r.enabled && r.roots.length) setCwd("/" + r.roots[0]); }).catch(e => setInfo({ enabled: false, reason: e.message })); }, [cloud]);
  const load = useCallback((p = cwd) => { if (!p) return; const seq = ++loadSeq.current; setErr(null);
    api("GET", "nas/list?p=" + encodeURIComponent(p)).then(r => { if (seq === loadSeq.current) { setList(r.entries); setSel(null); } }).catch(e => { if (seq === loadSeq.current) { setErr(e.message); setList([]); } }); }, [cwd]);
  useEffect(() => { setList(null); setPreview(null); setQ(""); load(cwd); }, [cwd]);

  if (!cloud) return <div className="app"><EmptyState icon="cloud_off" text="Las carpetas del NAS necesitan una cuenta de Sotos (no funcionan como invitado)." /></div>;
  if (!info) return <div className="app"><EmptyState icon="dns" text="Buscando las carpetas del NAS…" /></div>;
  if (!info.enabled) return <div className="app"><EmptyState icon="dns" text={info.reason || "Este servidor no tiene carpetas del NAS conectadas. El administrador puede montarlas en el contenedor (consulta docker-compose.nas.yml)."} /></div>;

  const write = info.writable, segs = (cwd || "").split("/").filter(Boolean);
  const items = (list || []).filter(e => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  const pathOf = (e) => join(cwd, e.name);
  const open = (e) => { if (e.dir) setCwd(pathOf(e)); else if (PREVIEW[e.type]) setPreview(e); else window.open(fileUrl(pathOf(e), true), "_blank"); };
  const run = async (fn, okMsg, icon = "check_circle") => { setBusy(b => b + 1); try { const r = await fn(); if (okMsg) toast(okMsg instanceof Function ? okMsg(r) : okMsg, { icon }); load(); return r; } catch (e) { toast(e.message, { error: true }); } finally { setBusy(b => b - 1); } };

  const toMine = (e) => run(() => api("POST", "nas/import", { p: pathOf(e) }), r => `Copiado a tus archivos, carpeta ${r.folder}`, "cloud_done");
  const upload = async (files) => { for (const f of files) await run(() => api("PUT", `nas/upload?p=${encodeURIComponent(cwd)}&name=${encodeURIComponent(f.name)}`, f), r => `Subido al NAS: ${r.name}`, "cloud_upload"); };
  const fromMine = async () => { const picked = await pickFiles({ title: "Guardar en el NAS", multiple: true }); if (!picked) return;
    for (const n of picked) { if (n instanceof File) await upload([n]); else await run(() => api("POST", "nas/export", { nodeId: n.id, p: cwd }), r => `Guardado en el NAS: ${r.name}`, "save"); } };
  const menu = (e) => [
    { id: "open", label: e.dir ? "Abrir" : PREVIEW[e.type] ? "Ver" : "Descargar", icon: e.dir ? "folder_open" : PREVIEW[e.type] ? "visibility" : "download" },
    ...(!e.dir ? [{ id: "download", label: "Descargar", icon: "download" }, { id: "mine", label: "Copiar a mis archivos", icon: "cloud_done" }] : []),
    ...(write ? [{ sep: true }, { id: "rename", label: "Renombrar", icon: "edit" }, { id: "delete", label: "Mover a la papelera del NAS", icon: "delete", danger: true }] : []),
  ];
  const act = (id, e) => {
    if (id === "open") return open(e);
    if (id === "download") { const a = document.createElement("a"); a.href = fileUrl(pathOf(e), true); a.download = e.name; a.click(); return; }
    if (id === "mine") return toMine(e);
    if (id === "rename") return setDialog({ kind: "rename", e });
    if (id === "delete") return setDialog({ kind: "delete", e });
  };
  const onKey = (ev) => {
    if (dialog || !sel) return; const e = items.find(x => x.name === sel); if (!e) return;
    if (ev.key === "Enter") { ev.preventDefault(); open(e); }
    if (ev.key === "Delete" && write) { ev.preventDefault(); setDialog({ kind: "delete", e }); }
    if (ev.key === "F2" && write) { ev.preventDefault(); setDialog({ kind: "rename", e }); }
  };
  const meta = (e) => e.dir ? "Carpeta" : fmtSize(e.size);
  const cell = (e) => ({ key: e.name, tabIndex: 0, className: (view === "list" ? "file-row" : "file-cell") + (sel === e.name ? " sel" : ""),
    onClick: () => setSel(e.name), onDoubleClick: () => open(e), onFocus: () => setSel(e.name),
    onContextMenu: (ev) => { ev.preventDefault(); setSel(e.name); setCtx({ x: ev.clientX, y: ev.clientY, e }); } });
  const glyph = (e, size) => <FileGlyph type={e.dir ? "folder" : e.type} size={size} src={e.type === "img" && e.size < 8 * 1024 * 1024 ? fileUrl(pathOf(e)) : undefined} />;

  return <div className="app nas-app" onKeyDown={onKey}>
    <input ref={upInput} type="file" multiple hidden onChange={ev => { const f = [...ev.target.files]; ev.target.value = ""; upload(f); }} />
    <div className="app-side">
      <div className="side-group">
        <div className="side-label">Carpetas del NAS</div>
        {info.roots.map(r => <SideItem key={r} icon={ROOT_ICON(r)} label={r} active={segs[0] === r} onClick={() => setCwd("/" + r)} />)}
      </div>
      <div className="side-group"><div className="faint nas-note">{write ? "Puedes subir, renombrar y borrar. Lo que borras va a la papelera del NAS." : "Solo lectura: puedes ver, descargar y copiar a tus archivos."}</div></div>
    </div>
    <div className="app-main">
      <Toolbar>
        <button className="tb-btn icon" title="Subir un nivel" aria-label="Subir un nivel" disabled={segs.length < 2} style={{ opacity: segs.length > 1 ? 1 : .4 }} onClick={() => setCwd("/" + segs.slice(0, -1).join("/"))}><Ic name="arrow_upward" /></button>
        <div className="breadcrumb">{segs.map((s, i) => <React.Fragment key={i}>{i > 0 && <Ic name="chevron_right" size={16} className="sep" />}
          <span className="crumb" style={{ cursor: "pointer" }} onClick={() => setCwd("/" + segs.slice(0, i + 1).join("/"))}>{s}</span></React.Fragment>)}</div>
        <div className="tb-spacer" />
        {busy > 0 && <Ic name="progress_activity" className="spin" size={18} />}
        {write && <button className="tb-btn" onClick={() => setDialog({ kind: "mkdir" })} title="Nueva carpeta"><Ic name="create_new_folder" /> Carpeta</button>}
        {write && <button className="tb-btn" onClick={() => upInput.current.click()} title="Subir archivos de este equipo"><Ic name="cloud_upload" /> Subir</button>}
        {write && <button className="tb-btn" onClick={fromMine} title="Guardar archivos de Sotos en esta carpeta"><Ic name="save" /> Desde Sotos</button>}
        <button className="tb-btn icon" title="Actualizar" aria-label="Actualizar" onClick={() => load()}><Ic name="refresh" /></button>
        <button className="tb-btn icon" title={view === "grid" ? "Vista de lista" : "Vista de iconos"} aria-label="Cambiar vista" onClick={() => setView(v => v === "grid" ? "list" : "grid")}><Ic name={view === "grid" ? "view_list" : "grid_view"} /></button>
        <div className="search-box" style={{ minWidth: 120, width: 170 }}><Ic name="search" size={17} /><input placeholder={`Buscar en ${segs[segs.length - 1] || "el NAS"}`} value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar en esta carpeta" /></div>
      </Toolbar>
      <div className="nas-body">
        <div className="files-body" onDragOver={write ? (e) => e.preventDefault() : undefined} onDrop={write ? (e) => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) upload(f); } : undefined}>
          {list === null ? <EmptyState icon="hourglass_empty" text="Cargando…" /> : err ? <EmptyState icon="error" text={err} /> :
            !items.length ? <EmptyState icon="folder_open" text={q ? "Nada coincide con la búsqueda." : "Esta carpeta está vacía."} /> :
            view === "grid" ? <div className="file-grid">{items.map(e => <div {...cell(e)}><div className="ic">{glyph(e, 46)}</div><div className="fname" title={e.name}>{e.name}</div><div className="fmeta">{meta(e)}</div></div>)}</div>
            : <div className="file-list">
                <div className="file-row head"><span>Nombre</span><span>Modificado</span><span>Tipo</span><span style={{ textAlign: "right" }}>Tamaño</span></div>
                {items.map(e => <div {...cell(e)}><span className="fl-name">{glyph(e, 20)}<span className="fname">{e.name}</span></span><span>{fmtDate(e.mtime)}</span><span>{e.dir ? "Carpeta" : (e.name.split(".").pop() || "").toUpperCase()}</span><span style={{ textAlign: "right" }}>{e.dir ? "" : fmtSize(e.size)}</span></div>)}
              </div>}
        </div>
        {preview && <Preview entry={preview} path={pathOf(preview)} onClose={() => setPreview(null)} />}
      </div>
    </div>
    {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={menu(ctx.e)} onClose={() => setCtx(null)} onSelect={(id) => { const e = ctx.e; setCtx(null); act(id, e); }} />}
    {dialog?.kind === "mkdir" && <NameDialog title="Nueva carpeta en el NAS" icon="create_new_folder" initial="Nueva carpeta" okLabel="Crear" onClose={() => setDialog(null)}
      onOk={(name) => { setDialog(null); run(() => api("POST", "nas/mkdir", { p: cwd, name }), `Carpeta creada: ${name}`, "create_new_folder"); }} />}
    {dialog?.kind === "rename" && <NameDialog title="Renombrar" icon="edit" initial={dialog.e.name} okLabel="Renombrar" onClose={() => setDialog(null)}
      onOk={(name) => { const e = dialog.e; setDialog(null); if (name !== e.name) run(() => api("POST", "nas/rename", { p: pathOf(e), name }), `Renombrado a ${name}`, "edit"); }} />}
    {dialog?.kind === "delete" && <ConfirmDialog title="Mover a la papelera del NAS" okLabel="Mover a la papelera" onClose={() => setDialog(null)}
      text={`«${dialog.e.name}» irá a la papelera de la carpeta compartida. Desde DSM puedes recuperarlo mientras no la vacíes.`}
      onOk={() => { const e = dialog.e; setDialog(null); if (preview?.name === e.name) setPreview(null); run(() => api("POST", "nas/delete", { p: pathOf(e) }), "Movido a la papelera del NAS", "delete"); }} />}
  </div>;
}
