/* ============================================================
   Sotos — selector de archivos del sistema (abrir, guardar y elegir carpeta)
   El mismo en todas las apps: Sotos Drive con sus carpetas, recientes y búsqueda, y
   «Desde este equipo» para traer algo del disco.
     const nodes = await pickFiles({ title, types: ["img"], multiple: true });     // abrir
     const dest  = await pickFiles({ mode: "save", name: "Informe.docx" });         // → { folderId, name }
     const dir   = await pickFiles({ mode: "folder" });                             // → nodo de la carpeta
   Devuelve null si se cancela. Para el contenido de un nodo: vfs.read(node.id) → Blob.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import * as vfs from "./vfs.js";
import { fmtSize, fmtDate } from "./vfs.js";
import { Ic, Modal, toast } from "./ui.jsx";
import { NodeGlyph } from "./files-ui.jsx";
const { useState, useEffect, useMemo, useRef, useSyncExternalStore } = React;

/* ---------- petición en curso (una a la vez) ---------- */
let current = null; const subs = new Set();
const emit = () => subs.forEach(f => f());
export function pickFiles(opts = {}) {
  if (current) current.resolve(null);
  return new Promise(resolve => { current = { opts, resolve: (v) => { current = null; emit(); resolve(v); } }; emit(); });
}
/** archivos del equipo o de Sotos convertidos a File (para apps que esperan File) */
export async function pickAsFiles(opts = {}) {
  const r = await pickFiles({ ...opts, allowDevice: true }); if (!r) return null;
  return Promise.all(r.map(async n => n instanceof File ? n : new File([await vfs.read(n.id)], n.name, { type: vfs.mimeOf ? vfs.mimeOf(n.name) : "" })));
}

const LAST = "sotos_picker_last";
const SIDE = [["Sotos Drive", null, "cloud"], ["Escritorio", "Escritorio", "desktop_windows"], ["Documentos", "Documentos", "description"], ["Imágenes", "Imágenes", "image"], ["Música", "Música", "music_note"], ["Vídeos", "Vídeos", "movie"], ["Descargas", "Descargas", "download"]];
const matches = (n, types, exts) => n.type === "folder" || ((!types || types.includes(n.type)) && (!exts || exts.includes(vfs.extOf(n.name))));

export function FilePickerHost() {
  const req = useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => current);
  if (!req) return null;
  return <Picker key={req.opts.title || req.opts.mode || "p"} {...req.opts} done={req.resolve} />;
}

function Picker({ mode = "open", title, types = null, exts = null, multiple = false, name: defName = "", allowDevice = true, start = null, done }) {
  const root = vfs.useVfs(s => s.root);
  const findTop = (nm) => (root.children || []).find(c => c.type === "folder" && c.name === nm)?.id;
  const startAt = () => { const last = (() => { try { return localStorage.getItem(LAST); } catch { return null; } })(); const cand = start || (types?.length === 1 && { img: "Imágenes", audio: "Música", video: "Vídeos" }[types[0]] && findTop({ img: "Imágenes", audio: "Música", video: "Vídeos" }[types[0]])) || last; return cand && vfs.node(cand)?.type === "folder" ? cand : vfs.ROOT; };
  const [cwd, setCwd] = useState(startAt), [sel, setSel] = useState([]), [q, setQ] = useState(""), [view, setView] = useState("folder"), [fname, setFname] = useState(defName);
  const [listView, setListView] = useState(false), [replace, setReplace] = useState(null);
  const dev = useRef(null); const nameIn = useRef(null);
  const folder = vfs.node(cwd) || root;
  const pickFolder = mode === "folder";
  const items = useMemo(() => {
    let list;
    if (q.trim()) list = vfs.search(q.trim(), 200);
    else if (view === "recent") { list = []; vfs.walk(n => { if (n.type !== "folder" && n.id !== vfs.ROOT) list.push(n); }); list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0)); list = list.slice(0, 60); }
    else list = [...(folder.children || [])];
    const inTrash = (n) => vfs.pathOf(n.id)[0]?.name === "Papelera";
    list = list.filter(n => n.name !== "Papelera" && (view !== "recent" && !q.trim() || !inTrash(n)) && (pickFolder ? n.type === "folder" : matches(n, types, exts)));
    return list.sort((a, b) => (a.type === "folder") !== (b.type === "folder") ? (a.type === "folder" ? -1 : 1) : view === "recent" && !q ? 0 : a.name.localeCompare(b.name, "es", { numeric: true }));
  }, [folder, q, view, types, exts, pickFolder]);
  useEffect(() => { if (mode === "save") setTimeout(() => { const el = nameIn.current; if (!el) return; el.focus(); const dot = fname.lastIndexOf("."); el.setSelectionRange(0, dot > 0 ? dot : fname.length); }, 30); }, []);

  const remember = (id) => { try { localStorage.setItem(LAST, id); } catch {} };
  const open = (id) => { setCwd(id); setSel([]); setQ(""); setView("folder"); setReplace(null); };
  const crumbs = vfs.pathOf(cwd);
  const finish = (val) => { remember(mode === "save" || pickFolder ? cwd : (vfs.parentOf(val?.[0]?.id)?.id || cwd)); done(val); };
  const confirm = async () => {
    if (mode === "save") {
      const nm = fname.trim(); if (!nm || /[\\/:*?"<>|]/.test(nm)) return toast("Escribe un nombre válido", { error: true });
      const clash = (folder.children || []).find(c => c.name.toLowerCase() === nm.toLowerCase() && c.type !== "folder");
      if (clash && replace !== clash.id) { setReplace(clash.id); return; } // primer clic avisa; el segundo reemplaza
      return finish({ folderId: cwd, name: nm, replaceId: clash?.id || null });
    }
    if (pickFolder) return finish(sel.length ? vfs.node(sel[0]) : folder);
    const nodes = sel.map(vfs.node).filter(n => n && n.type !== "folder"); if (nodes.length) finish(nodes);
  };
  const click = (n, e) => {
    if (n.type === "folder" && !pickFolder) { setSel([]); return; }
    if (multiple && (e.ctrlKey || e.metaKey)) setSel(s => s.includes(n.id) ? s.filter(x => x !== n.id) : [...s, n.id]);
    else setSel([n.id]);
    if (mode === "save" && n.type !== "folder") setFname(n.name);
  };
  const dbl = (n) => { if (n.type === "folder") open(n.id); else if (mode === "open") finish([n]); else if (mode === "save") { setFname(n.name); } };
  const newFolder = () => { const nm = vfs.uniqueName(folder, "Carpeta nueva"); const id = vfs.mkdir(cwd, nm); if (id) { toast(`Carpeta «${nm}» creada`, { icon: "create_new_folder" }); } };
  const fromDevice = (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) finish(f); };
  const can = mode === "save" ? !!fname.trim() : pickFolder ? true : sel.some(id => vfs.node(id)?.type !== "folder");
  const heading = title || (mode === "save" ? "Guardar como" : pickFolder ? "Elegir carpeta" : multiple ? "Abrir archivos" : "Abrir archivo");
  const accept = exts ? exts.map(x => "." + x).join(",") : types?.length ? types.map(t => ({ img: "image/*", audio: "audio/*", video: "video/*", pdf: ".pdf", docx: ".docx,.doc,.odt,.rtf", xlsx: ".xlsx,.xls,.ods,.csv", pptx: ".pptx,.ppt,.odp" }[t] || "")).filter(Boolean).join(",") : undefined;

  return <Modal title={heading} icon={mode === "save" ? "save" : pickFolder ? "folder_open" : "file_open"} onClose={() => done(null)} width={820}
    actions={<>
      {mode === "open" && allowDevice && <button className="tb-btn" style={{ marginRight: "auto" }} onClick={() => dev.current?.click()}><Ic name="computer" /> Desde este equipo</button>}
      <button className="tb-btn" onClick={() => done(null)}>Cancelar</button>
      <button className="tb-btn primary" disabled={!can} onClick={confirm}>{mode === "save" ? (replace ? "Reemplazar" : "Guardar") : pickFolder ? "Elegir esta carpeta" : "Abrir"}</button></>}>
    <input ref={dev} type="file" multiple={multiple} accept={accept} style={{ display: "none" }} onChange={fromDevice} />
    <div className="fp">
      <nav className="fp-side">
        <button className={"fp-place" + (view === "recent" && !q ? " on" : "")} onClick={() => { setView("recent"); setQ(""); setSel([]); }}><Ic name="schedule" size={18} /> Recientes</button>
        {SIDE.map(([label, nm, icon]) => { const id = nm ? findTop(nm) : vfs.ROOT; if (!id) return null;
          return <button key={label} className={"fp-place" + (view !== "recent" && !q && cwd === id ? " on" : "")} onClick={() => open(id)}><Ic name={icon} size={18} /> {label}</button>; })}
      </nav>
      <div className="fp-main">
        <div className="fp-bar">
          <button className="tb-btn icon" title="Subir un nivel" disabled={cwd === vfs.ROOT || view === "recent"} onClick={() => open(vfs.parentOf(cwd)?.id || vfs.ROOT)}><Ic name="arrow_upward" size={18} /></button>
          <div className="fp-crumbs">{view === "recent" && !q ? <span>Recientes</span> : q ? <span>Resultados de «{q}»</span> : <>
            <button onClick={() => open(vfs.ROOT)}>Sotos Drive</button>
            {crumbs.map(n => <React.Fragment key={n.id}><Ic name="chevron_right" size={16} /><button onClick={() => open(n.id)}>{n.name}</button></React.Fragment>)}</>}</div>
          {(mode === "save" || pickFolder) && view !== "recent" && <button className="tb-btn icon" title="Carpeta nueva" onClick={newFolder}><Ic name="create_new_folder" size={18} /></button>}
          <button className="tb-btn icon" title={listView ? "Vista de iconos" : "Vista de lista"} onClick={() => setListView(v => !v)}><Ic name={listView ? "grid_view" : "view_list"} size={18} /></button>
          <div className="search-box" style={{ width: 190 }}><Ic name="search" size={16} /><input placeholder="Buscar" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <div className={"fp-items" + (listView ? " list" : "")} onClick={e => { if (e.target === e.currentTarget) setSel([]); }}>
          {!items.length && <div className="fp-empty"><Ic name={q ? "search_off" : "folder_off"} size={34} /><div>{q ? "Nada coincide con la búsqueda" : pickFolder ? "No hay subcarpetas" : "No hay archivos de este tipo aquí"}</div></div>}
          {items.map(n => <button key={n.id} className={"fp-item" + (sel.includes(n.id) ? " sel" : "") + (n.type === "folder" ? " dir" : "")} onClick={e => click(n, e)} onDoubleClick={() => dbl(n)} title={vfs.pathString(n.id)}>
            <span className="fp-glyph"><NodeGlyph node={n} size={listView ? 22 : 44} /></span>
            <span className="fp-name">{n.name}</span>
            {listView && <span className="fp-meta faint">{n.type === "folder" ? `${(n.children || []).length} elemento(s)` : fmtSize(n.size || 0)}</span>}
            {listView && <span className="fp-meta faint">{n.mtime ? fmtDate(n.mtime) : ""}</span>}
          </button>)}
        </div>
        {mode === "save" && <div className="fp-save"><span>Nombre</span><input ref={nameIn} className="sc-input" value={fname} onChange={e => { setFname(e.target.value); setReplace(null); }} onKeyDown={e => e.key === "Enter" && can && confirm()} style={{ margin: 0, flex: 1 }} /></div>}
        {mode === "save" && replace && <div className="fp-hint" style={{ color: "var(--danger, #b3412b)" }}><Ic name="warning" size={16} /> Ya existe «{fname.trim()}» en esta carpeta. Pulsa «Reemplazar» para sobrescribirlo.</div>}
        {mode === "open" && multiple && <div className="fp-hint faint">Ctrl + clic para elegir varios · doble clic abre</div>}
      </div>
    </div>
  </Modal>;
}
