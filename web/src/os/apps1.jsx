/* ============================================================
   Sotos OS — Archivos, Notas, Hojas, Galería
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { OFFICE_WEB } from "./data.jsx";
import { Ic, SideItem, Toolbar, EmptyState, ContextMenu, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs, ROOT, DESKTOP, fmtSize, fmtDate } from "./vfs.js";
import { NodeGlyph, dragIds, dropTarget, itemMenu, runItemAction, PropertiesModal, useObjectUrl } from "./files-ui.jsx";
import { makeEvaluator, display, parseRef, refName, numToCol, isErr } from "./formula.js";
import { api } from "./api.js";
import { withOnlyOffice } from "./onlyoffice.jsx";
import { InboxView, useInboxCount } from "./inbox.jsx";
import { shownName } from "./region.js";
const { useState: useS1, useRef: useR1, useEffect: useE1, useMemo: useM1, useCallback: useC1 } = React;

/* hook: guardado automático con estado visible */
export function useAutosave(saveFn, delay = 1000) {
  const [status, setStatus] = useS1("saved"); // saved | dirty | saving | error
  const timer = useR1(null), latest = useR1(saveFn); latest.current = saveFn;
  const flush = useC1(async () => {
    clearTimeout(timer.current); setStatus("saving");
    try { await latest.current(); setStatus("saved"); } catch (e) { console.error(e); setStatus("error"); toast("No se pudo guardar: " + e.message, { error: true }); }
  }, []);
  const touch = useC1(() => { setStatus("dirty"); clearTimeout(timer.current); timer.current = setTimeout(flush, delay); }, [flush, delay]);
  useE1(() => () => { if (timer.current) { clearTimeout(timer.current); latest.current().catch(() => {}); } }, []); // guardar al cerrar
  return { status, touch, flush };
}
export function SaveBadge({ status }) {
  const M = { saved: ["cloud_done", "Guardado"], dirty: ["edit", "Cambios sin guardar"], saving: ["sync", "Guardando…"], error: ["error", "Error al guardar"] };
  const [icon, label] = M[status] || M.saved;
  return <span className="faint save-badge" style={{ color: status === "error" ? "#e2483d" : undefined }}><Ic name={icon} size={16} /> {label}</span>;
}

/* ============================================================
   Archivos
   ============================================================ */
const SIDEBAR = [
  { path: "/Escritorio", icon: "desktop_windows", color: "#4a90e2" },
  { path: "/Documentos", icon: "description", color: "#2b579a" },
  { path: "/Imágenes", icon: "image", color: "#ff375f" },
  { path: "/Música", icon: "music_note", color: "#fc3c44" },
  { path: "/Vídeos", icon: "movie", color: "#8e5cf6" },
  { path: "/Descargas", icon: "download", color: "#0aa5b5" },
  { path: "/Proyectos", icon: "rocket_launch", color: "#8e5cf6" },
];
const TYPE_NAME = { folder: "Carpeta", docx: "Word", xlsx: "Excel", csv: "CSV", pptx: "PowerPoint", pdf: "PDF", img: "Imagen", audio: "Audio", video: "Vídeo", txt: "Texto", code: "Código", zip: "Comprimido", file: "Archivo" };

function FilesApp({ openApp, openItem, update, folderId, place }) {
  useVfs(s => s.rev);
  const inboxCount = useInboxCount();
  const clipboard = useVfs(s => s.clipboard);
  const trashCount = useVfs(s => s.trash.length);
  const [cur, setCur] = useS1(folderId && vfs.node(folderId) ? folderId : ROOT);
  const [hist, setHist] = useS1({ back: [], fwd: [] });
  const [sel, setSel] = useS1([]);
  const anchor = useR1(null);
  const [q, setQ] = useS1("");
  const [ctx, setCtx] = useS1(null);
  const [renaming, setRenaming] = useS1(null);
  const [tmpName, setTmpName] = useS1("");
  const [props, setProps] = useS1(null);
  const [hot, setHot] = useS1(null);
  const [newMenu, setNewMenu] = useS1(null);
  const [view, setView] = useS1(() => localStorage.getItem("sotos_files_view") || "grid");
  const [sort, setSort] = useS1(() => { try { return JSON.parse(localStorage.getItem("sotos_files_sort")) || { k: "name", d: 1 }; } catch { return { k: "name", d: 1 }; } });
  const [quota, setQuota] = useS1(null);
  const [special, setSpecial] = useS1(place || null); // "shared" | "inbox"
  useE1(() => { if (place) setSpecial(place); }, [place]);
  const mode = useVfs(s => s.mode), sync = useVfs(s => s.sync);
  const fileInput = useR1(null), dirInput = useR1(null), rootRef = useR1(null);

  useE1(() => { if (folderId && vfs.node(folderId)) go(folderId); }, [folderId]);
  useE1(() => { localStorage.setItem("sotos_files_view", view); }, [view]);
  useE1(() => { localStorage.setItem("sotos_files_sort", JSON.stringify(sort)); }, [sort]);
  useE1(() => { navigator.storage?.estimate?.().then(e => setQuota(e.quota)).catch(() => {}); }, []);

  const node = vfs.node(cur) || vfs.getState().root;
  if (node.id !== cur) setTimeout(() => setCur(node.id));
  const used = vfs.usedBytes();

  // contenido: carpeta actual o búsqueda recursiva
  let items = q.trim()
    ? (() => { const out = []; const ql = q.toLowerCase(); vfs.walk(n => { if (n.id !== node.id && n.name.toLowerCase().includes(ql)) out.push(n); }, node); return out; })()
    : (node.children || []);
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, "es", { numeric: true }),
    mtime: (a, b) => (a.mtime || 0) - (b.mtime || 0),
    size: (a, b) => (a.children ? vfs.folderSize(a) : a.size || 0) - (b.children ? vfs.folderSize(b) : b.size || 0),
    type: (a, b) => (TYPE_NAME[a.type] || "").localeCompare(TYPE_NAME[b.type] || ""),
  }[sort.k];
  items = [...items].sort((a, b) => ((b.type === "folder") - (a.type === "folder")) || cmp(a, b) * sort.d || a.name.localeCompare(b.name));

  const go = (id) => { setSpecial(null); if (id === cur) return; setHist(h => ({ back: [...h.back, cur], fwd: [] })); setCur(id); setSel([]); setQ(""); };
  const back = () => { const b = hist.back; if (!b.length) return; setHist({ back: b.slice(0, -1), fwd: [cur, ...hist.fwd] }); setCur(b[b.length - 1]); setSel([]); };
  const fwd = () => { const f = hist.fwd; if (!f.length) return; setHist({ back: [...hist.back, cur], fwd: f.slice(1) }); setCur(f[0]); setSel([]); };
  const up = () => { const p = vfs.parentOf(cur); if (p) go(p.id); };
  const open = (n) => n.type === "folder" ? go(n.id) : openItem(n);
  const startRename = (id) => { setRenaming(id); setTmpName(vfs.node(id)?.name || ""); };
  const commitRename = () => { if (renaming && tmpName.trim()) vfs.rename(renaming, tmpName.trim()); setRenaming(null); rootRef.current?.focus(); };
  const helpers = { openItem: open, update, startRename, showProps: setProps, parentId: cur };
  const selNodes = () => sel.map(vfs.node).filter(Boolean);

  const click = (e, n, i) => {
    e.stopPropagation();
    if (e.shiftKey && anchor.current != null) { const a = items.findIndex(x => x.id === anchor.current); const [s, t] = [Math.min(a, i), Math.max(a, i)]; setSel(items.slice(s, t + 1).map(x => x.id)); }
    else if (e.ctrlKey || e.metaKey) { setSel(s => s.includes(n.id) ? s.filter(x => x !== n.id) : [...s, n.id]); anchor.current = n.id; }
    else { setSel([n.id]); anchor.current = n.id; }
  };
  const doPaste = async () => { const n = await vfs.paste(cur); if (n) toast(`${n} elemento(s) pegado(s)`, { icon: "content_paste" }); };
  const newFolder = () => startRename(vfs.mkdir(cur));
  const newFile = async (kind) => {
    const { blankFile } = await import("./office.js");
    const { name, blob } = await blankFile(kind);
    const id = await vfs.create(cur, name, blob); setSel([id]); startRename(id);
  };
  const onKey = (e) => {
    if (renaming || e.target.closest("input")) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === "a") { e.preventDefault(); setSel(items.map(x => x.id)); }
    else if (ctrl && k === "c" && sel.length) runItemAction("copy", selNodes(), helpers);
    else if (ctrl && k === "x" && sel.length) runItemAction("cut", selNodes(), helpers);
    else if (ctrl && k === "v") doPaste();
    else if (k === "delete" && sel.length) { runItemAction("trash", selNodes(), helpers); setSel([]); }
    else if (k === "f2" && sel.length === 1) startRename(sel[0]);
    else if (k === "enter" && sel.length === 1) open(vfs.node(sel[0]));
    else if (k === "backspace") up();
    else if (k === "arrowright" || k === "arrowleft" || k === "arrowdown" || k === "arrowup") {
      e.preventDefault(); const i = items.findIndex(x => x.id === sel[sel.length - 1]);
      const cols = view === "list" ? 1 : Math.max(1, Math.floor(((rootRef.current?.querySelector(".file-grid")?.clientWidth || 600) - 32) / 102));
      const d = { arrowright: 1, arrowleft: -1, arrowdown: cols, arrowup: -cols }[k];
      const j = Math.max(0, Math.min(items.length - 1, i < 0 ? 0 : i + d)); if (items[j]) { setSel([items[j].id]); anchor.current = items[j].id; }
    }
  };

  const crumbs = vfs.pathOf(cur);
  const selSize = sel.reduce((s, id) => { const n = vfs.node(id); return s + (n ? (n.children ? vfs.folderSize(n) : n.size || 0) : 0); }, 0);
  const cutIds = clipboard?.mode === "cut" ? clipboard.ids : [];

  const nameCell = (n) => renaming === n.id
    ? <input className="rename-input" autoFocus value={tmpName} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
        onFocus={e => { const i = e.target.value.lastIndexOf("."); e.target.setSelectionRange(0, i > 0 && n.type !== "folder" ? i : e.target.value.length); }}
        onChange={e => setTmpName(e.target.value)} onBlur={commitRename}
        onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setRenaming(null); rootRef.current?.focus(); } }} />
    : <div className="fname" title={n.name}>{shownName(n)}</div>;
  const cellProps = (n, i) => ({
    className: (view === "list" ? "file-row" : "file-cell") + (sel.includes(n.id) ? " sel" : "") + (hot === n.id ? " drop-hot" : "") + (cutIds.includes(n.id) ? " cut" : ""),
    draggable: renaming !== n.id,
    onMouseDown: (e) => { if (e.button === 0 && !sel.includes(n.id)) click(e, n, i); },
    onClick: (e) => click(e, n, i),
    onDoubleClick: () => open(n),
    onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); const s = sel.includes(n.id) ? sel : [n.id]; setSel(s); setCtx({ x: e.clientX, y: e.clientY, nodes: s.map(vfs.node).filter(Boolean) }); },
    onDragStart: (e) => dragIds(e, sel.includes(n.id) ? sel : [n.id]),
    ...(n.type === "folder" ? dropTarget(n.id, { onHot: (h) => setHot(h ? n.id : null) }) : {}),
  });
  const sortBy = (k) => setSort(s => ({ k, d: s.k === k ? -s.d : 1 }));
  const arrow = (k) => sort.k === k ? <Ic name={sort.d > 0 ? "arrow_upward" : "arrow_downward"} size={13} /> : null;

  return (
    <div className="app" ref={rootRef} tabIndex={-1} onKeyDown={onKey} style={{ outline: "none" }}>
      <input ref={fileInput} type="file" multiple style={{ display: "none" }}
        onChange={async e => { const f = [...e.target.files]; e.target.value = ""; if (!f.length) return; const ids = await vfs.importFiles(cur, f); setSel(ids); toast(`${ids.length} archivo(s) subido(s)`, { icon: "cloud_done" }); }} />
      <input ref={dirInput} type="file" webkitdirectory="" style={{ display: "none" }}
        onChange={async e => {
          const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
          const dirs = new Map();
          const dirFor = (parts) => { const key = parts.join("/"); if (!parts.length) return cur; if (dirs.has(key)) return dirs.get(key); const id = vfs.mkdir(dirFor(parts.slice(0, -1)), parts[parts.length - 1]); dirs.set(key, id); return id; };
          for (const f of files) { const parts = (f.webkitRelativePath || f.name).split("/"); await vfs.create(dirFor(parts.slice(0, -1)), parts[parts.length - 1], f); }
          toast(`Carpeta subida (${files.length} archivos)`, { icon: "cloud_done" });
        }} />
      <div className="app-side">
        <div className="side-group">
          <div className="side-label">Favoritos</div>
          <div {...dropTarget(ROOT)}><SideItem icon="cloud" label="Sotos Drive" color="#2f6fed" active={cur === ROOT && !q} onClick={() => go(ROOT)} /></div>
          {SIDEBAR.map(f => { const n = vfs.resolve(f.path); if (!n) return null; return (
            <div key={f.path} {...dropTarget(n.id)}><SideItem icon={f.icon} label={n.name} color={f.color} active={cur === n.id && !q} onClick={() => go(n.id)} /></div>); })}
        </div>
        <div className="side-group">
          <div className="side-label">Ubicaciones</div>
          <SideItem icon="inbox" label={`Recibidos${inboxCount ? ` (${inboxCount})` : ""}`} color="#2f86e0" active={special === "inbox"} onClick={() => setSpecial("inbox")} />
          <SideItem icon="group" label="Compartido conmigo" color="#34c759" active={special === "shared"} onClick={() => setSpecial("shared")} />
          <SideItem icon="delete" label={`Papelera${trashCount ? ` (${trashCount})` : ""}`} color="#7d8590" onClick={() => openApp("trash")} />
        </div>
        <div className="side-group">
          <div className="side-label">Almacenamiento</div>
          <div style={{ padding: "4px 10px" }}>
            {(() => { const q = mode === "cloud" ? sync.quota : quota; return <>
              <div style={{ height: 6, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
                <div style={{ width: q ? Math.max(1.5, Math.min(100, used / q * 100)) + "%" : "2%", height: "100%", background: "var(--accent)" }} /></div>
              <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>{fmtSize(used)} usados{q ? ` de ${fmtSize(q)}` : ""} · {mode === "cloud" ? "en tu nube" : "en este navegador"}</div></>; })()}
          </div>
        </div>
      </div>
      <div className="app-main">
        <Toolbar>
          <button className="tb-btn icon" title="Atrás" disabled={!hist.back.length} style={{ opacity: hist.back.length ? 1 : .4 }} onClick={back}><Ic name="arrow_back" /></button>
          <button className="tb-btn icon" title="Adelante" disabled={!hist.fwd.length} style={{ opacity: hist.fwd.length ? 1 : .4 }} onClick={fwd}><Ic name="arrow_forward" /></button>
          <button className="tb-btn icon" title="Subir un nivel" disabled={cur === ROOT} style={{ opacity: cur !== ROOT ? 1 : .4 }} onClick={up}><Ic name="arrow_upward" /></button>
          <div className="breadcrumb">
            <span className="crumb" {...dropTarget(ROOT)} style={{ cursor: "pointer" }} onClick={() => go(ROOT)}>Sotos Drive</span>
            {crumbs.map(c => (
              <React.Fragment key={c.id}><Ic name="chevron_right" size={16} className="sep" />
                <span className="crumb" {...dropTarget(c.id)} style={{ cursor: "pointer" }} onClick={() => go(c.id)}>{c.name}</span></React.Fragment>
            ))}
          </div>
          <div className="tb-spacer" />
          <button className="tb-btn" title="Nuevo" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setNewMenu({ x: r.left, y: r.bottom + 4 }); }}><Ic name="add" /> Nuevo</button>
          <button className="tb-btn" onClick={() => fileInput.current.click()} title="Subir archivos (o arrástralos aquí)"><Ic name="cloud_upload" /> Subir</button>
          <button className="tb-btn icon" title={view === "grid" ? "Vista de lista" : "Vista de iconos"} onClick={() => setView(v => v === "grid" ? "list" : "grid")}><Ic name={view === "grid" ? "view_list" : "grid_view"} /></button>
          <div className="search-box" style={{ minWidth: 120, width: 170 }}><Ic name="search" size={17} /><input placeholder={`Buscar en ${node.name}`} value={q} onChange={e => setQ(e.target.value)} />
            {q && <Ic name="close" size={15} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}</div>
        </Toolbar>
        {special === "inbox" ? <InboxView openItem={openItem} /> : special === "shared" ? <SharedWithMe openApp={openApp} /> :
        <div className="files-body" {...dropTarget(cur)}
          onMouseDown={e => { if (e.target === e.currentTarget || e.target.classList.contains("file-grid")) { setSel([]); rootRef.current?.focus(); } }}
          onContextMenu={e => { if (e.target.closest(".file-cell,.file-row")) return; e.preventDefault(); setSel([]); setCtx({ x: e.clientX, y: e.clientY, nodes: null }); }}>
          {view === "grid" ? (
            <div className="file-grid">
              {items.map((n, i) => (
                <div key={n.id} {...cellProps(n, i)}>
                  <div className="ic"><NodeGlyph node={n} size={46} /></div>
                  {nameCell(n)}
                  {renaming !== n.id && <div className="fmeta">{q ? vfs.pathOf(n.id).slice(-2, -1).map(p => p.name)[0] || "Sotos Drive" : n.type === "folder" ? `${(n.children || []).length} elementos` : n.online && !n.size ? "en línea" : fmtSize(n.size)}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="file-list">
              <div className="file-row head">
                <span onClick={() => sortBy("name")}>Nombre {arrow("name")}</span><span onClick={() => sortBy("mtime")}>Modificado {arrow("mtime")}</span>
                <span onClick={() => sortBy("type")}>Tipo {arrow("type")}</span><span onClick={() => sortBy("size")} style={{ textAlign: "right" }}>Tamaño {arrow("size")}</span>
              </div>
              {items.map((n, i) => (
                <div key={n.id} {...cellProps(n, i)}>
                  <span className="fl-name"><NodeGlyph node={n} size={20} />{nameCell(n)}</span>
                  <span>{fmtDate(n.mtime)}</span><span>{TYPE_NAME[n.type] || n.type}</span>
                  <span style={{ textAlign: "right" }}>{n.type === "folder" ? `${(n.children || []).length} el.` : n.online && !n.size ? "en línea" : fmtSize(n.size)}</span>
                </div>
              ))}
            </div>
          )}
          {!items.length && <EmptyState icon={q ? "search_off" : "folder_open"} text={q ? "Sin resultados" : "Carpeta vacía · arrastra archivos o carpetas desde tu PC"} />}
        </div>}
        <div className="files-status">
          <span>{items.length} elemento(s){sel.length ? ` · ${sel.length} seleccionado(s) · ${fmtSize(selSize)}` : ""}</span>
          <div className="tb-spacer" />
          <span className="sort-pick">Ordenar:
            <select value={sort.k} onChange={e => setSort({ k: e.target.value, d: 1 })}>
              <option value="name">Nombre</option><option value="mtime">Fecha</option><option value="size">Tamaño</option><option value="type">Tipo</option></select>
            <Ic name={sort.d > 0 ? "arrow_upward" : "arrow_downward"} size={14} style={{ cursor: "pointer" }} onClick={() => setSort(s => ({ ...s, d: -s.d }))} />
          </span>
        </div>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y}
        items={ctx.nodes ? itemMenu(ctx.nodes, { canPaste: !!clipboard }) : [
          { id: "newfolder", label: "Nueva carpeta", icon: "create_new_folder" },
          { id: "new-docx", label: "Nuevo documento de Word", icon: "description" },
          { id: "new-xlsx", label: "Nuevo libro de Excel", icon: "table_chart" },
          { id: "new-pptx", label: "Nueva presentación", icon: "slideshow" },
          { id: "new-txt", label: "Nuevo archivo de texto", icon: "note_add" },
          { sep: true },
          ...(clipboard ? [{ id: "paste", label: `Pegar (${clipboard.ids.length})`, icon: "content_paste" }] : []),
          { id: "upload", label: "Subir archivos…", icon: "upload_file" },
          { id: "uploaddir", label: "Subir carpeta…", icon: "drive_folder_upload" },
          { id: "selectall", label: "Seleccionar todo", icon: "select_all" },
          { sep: true },
          { id: "props-here", label: "Propiedades de la carpeta", icon: "info" },
        ]}
        onSelect={async (id) => {
          if (ctx.nodes) { await runItemAction(id, ctx.nodes, helpers); if (id === "trash") setSel([]); return; }
          if (id === "newfolder") newFolder();
          else if (id.startsWith("new-")) newFile(id.slice(4));
          else if (id === "paste") doPaste();
          else if (id === "upload") fileInput.current.click();
          else if (id === "uploaddir") dirInput.current.click();
          else if (id === "selectall") setSel(items.map(x => x.id));
          else if (id === "props-here") setProps(cur);
        }}
        onClose={() => setCtx(null)} />}
      {newMenu && <ContextMenu x={newMenu.x} y={newMenu.y}
        items={[{ id: "folder", label: "Carpeta", icon: "create_new_folder" }, { sep: true },
          { id: "docx", label: "Documento de Word", icon: "description" }, { id: "xlsx", label: "Libro de Excel", icon: "table_chart" },
          { id: "pptx", label: "Presentación", icon: "slideshow" }, { id: "txt", label: "Archivo de texto", icon: "note_add" }, { sep: true },
          { id: "uploaddir", label: "Subir carpeta…", icon: "drive_folder_upload" }]}
        onSelect={(id) => id === "folder" ? newFolder() : id === "uploaddir" ? dirInput.current.click() : newFile(id)} onClose={() => setNewMenu(null)} />}
      {props && <PropertiesModal id={props} onClose={() => setProps(null)} />}
    </div>
  );
}

const OFFICE_APP = { docx: "docs", xlsx: "sheets", csv: "sheets", pptx: "slides" };
function SharedWithMe({ openApp }) {
  const mode = useVfs(s => s.mode);
  const [items, setItems] = useS1(null);
  useE1(() => { if (mode === "cloud") api("GET", "shares/with-me").then(r => setItems(r.items)).catch(e => { toast(e.message, { error: true }); setItems([]); }); }, [mode]);
  if (mode !== "cloud") return <div className="files-body"><EmptyState icon="group" text="Inicia sesión con una cuenta de Sotos para ver lo que otros comparten contigo" /></div>;
  if (!items) return <div className="files-body"><EmptyState icon="hourglass_empty" text="Cargando…" /></div>;
  const open = (it) => {
    const app = OFFICE_APP[it.node.type];
    if (app) openApp(app, { share: it.token, sharedNode: it.node, fileId: "share:" + it.token });
    else window.open(`${location.origin}/#/s/${it.token}`, "_blank", "noopener");
  };
  return (
    <div className="files-body">
      <div className="file-list">
        <div className="file-row head" style={{ gridTemplateColumns: "1fr 160px 110px 110px" }}><span>Nombre</span><span>Compartido por</span><span>Permiso</span><span>Fecha</span></div>
        {items.map(it => (
          <div key={it.token} className="file-row" style={{ gridTemplateColumns: "1fr 160px 110px 110px" }} onDoubleClick={() => open(it)}>
            <span className="fl-name"><NodeGlyph node={it.node} size={20} /><div className="fname">{it.node.name}</div></span>
            <span>{it.owner}</span><span>{it.perm === "edit" ? "Puede editar" : "Solo ver"}</span><span>{fmtDate(it.created)}</span>
          </div>
        ))}
      </div>
      {!items.length && <EmptyState icon="group" text="Nadie ha compartido nada contigo todavía" />}
    </div>
  );
}

/* ============================================================
   Notas / editor de texto y código
   ============================================================ */
const esc = (s) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function markdown(md) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = []; let list = null, code = null;
  for (const line of md.split("\n")) {
    if (code !== null) { if (/^```/.test(line)) { out.push(`<pre><code>${esc(code)}</code></pre>`); code = null; } else code += line + "\n"; continue; }
    if (/^```/.test(line)) { code = ""; continue; }
    const li = /^\s*(?:[-*]|\d+\.)\s+(\[[ x]\]\s*)?(.*)$/.exec(line);
    if (li) { if (!list) { list = /^\s*\d/.test(line) ? "ol" : "ul"; out.push(`<${list}>`); } out.push(`<li>${li[1] ? `<input type="checkbox" disabled ${/x/.test(li[1]) ? "checked" : ""}> ` : ""}${inline(li[2])}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (/^>\s?/.test(line)) out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) out.push("<hr>");
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join("\n");
}
// HTML de vista previa con los .css/.js hermanos incrustados
async function htmlPreview(text, fileId) {
  const parent = vfs.parentOf(fileId);
  const sib = (name) => (parent?.children || []).find(c => c.name === name);
  let html = text;
  for (const m of [...html.matchAll(/<link[^>]+href=["']([^"':]+\.css)["'][^>]*>/gi)]) { const f = sib(m[1]); if (f) html = html.replace(m[0], `<style>${await vfs.readText(f.id)}</style>`); }
  for (const m of [...html.matchAll(/<script([^>]*)\ssrc=["']([^"':]+\.m?js)["']([^>]*)><\/script>/gi)]) { const f = sib(m[2]); if (f) html = html.replace(m[0], `<script${m[1]}${m[3]}>${(await vfs.readText(f.id)).replace(/<\/script/gi, "<\\/script")}</script>`); }
  return html;
}

function EditorApp({ fileId, openItem, newDoc }) {
  useVfs(s => s.rev);
  const n = fileId ? vfs.node(fileId) : null;
  const [text, setText] = useS1(null);
  const [preview, setPreview] = useS1(false);
  const [previewHtml, setPreviewHtml] = useS1("");
  const taRef = useR1(null), gutter = useR1(null);
  const textRef = useR1(""); textRef.current = text ?? "";
  const { status, touch, flush } = useAutosave(() => vfs.write(fileId, textRef.current));
  const ext = n ? vfs.extOf(n.name) : "";
  const isCode = n && n.type === "code";
  const canPreview = ext === "html" || ext === "htm" || ext === "md";

  useE1(() => { setText(null); if (fileId) vfs.readText(fileId).then(setText).catch(e => { toast("No se pudo abrir: " + e.message, { error: true }); setText(""); }); }, [fileId]);
  useE1(() => { if (!preview || text == null) return; const t = setTimeout(async () => setPreviewHtml(ext === "md" ? markdown(text) : await htmlPreview(text, fileId)), 300); return () => clearTimeout(t); }, [preview, text]);

  if (!fileId) {
    const notes = vfs.allOfType(["txt", "code"]).sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 40);
    return (
      <div className="app" style={{ flexDirection: "column" }}>
        <Toolbar><span className="tb-title">Notas</span><div className="tb-spacer" />
          <button className="tb-btn primary" onClick={() => newDoc("txt")}><Ic name="add" /> Nueva nota</button></Toolbar>
        <div className="scroll" style={{ flex: 1 }}>
          <div className="file-list">{notes.map(x => (
            <div key={x.id} className="file-row" onDoubleClick={() => openItem(x)} onClick={() => openItem(x)} style={{ gridTemplateColumns: "1fr 140px" }}>
              <span className="fl-name"><NodeGlyph node={x} size={20} /><div className="fname">{x.name}</div></span><span>{fmtDate(x.mtime)}</span>
            </div>))}</div>
          {!notes.length && <EmptyState icon="edit_note" text="Aún no hay notas" />}
        </div>
      </div>
    );
  }
  if (!n) return <EmptyState icon="error" text="El archivo ya no existe" />;
  const lines = (text || "").split("\n").length;
  const words = (text || "").trim() ? text.trim().split(/\s+/).length : 0;
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flush(); }
    if (e.key === "Tab") { e.preventDefault(); const t = e.target, s = t.selectionStart, en = t.selectionEnd; const v = t.value.slice(0, s) + "  " + t.value.slice(en); setText(v); touch(); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); }
  };
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar>
        <span className="tb-title" style={{ fontSize: 13.5 }}>{n.name}</span>
        <div className="tb-spacer" />
        <SaveBadge status={status} />
        {canPreview && <button className={"tb-btn" + (preview ? " primary" : "")} onClick={() => setPreview(p => !p)}><Ic name="visibility" /> Vista previa</button>}
        <button className="tb-btn icon" title="Guardar (Ctrl+S)" onClick={flush}><Ic name="save" /></button>
        <button className="tb-btn icon" title="Descargar" onClick={async () => { await flush(); vfs.download(fileId); }}><Ic name="download" /></button>
      </Toolbar>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {text == null ? <EmptyState icon="hourglass_empty" text="Abriendo…" /> : <>
          <div className="editor-wrap" style={{ flex: 1, minWidth: 0 }}>
            {isCode && <div ref={gutter} className="editor-gutter">{Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}</div>}
            <textarea ref={taRef} className={"editor-ta" + (isCode ? " code" : "")} value={text} spellCheck={!isCode}
              onChange={e => { setText(e.target.value); touch(); }} onKeyDown={onKeyDown}
              onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.target.scrollTop; }} />
          </div>
          {preview && (ext === "md"
            ? <div className="scroll md-preview" style={{ flex: 1, borderLeft: "1px solid var(--border)" }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            : <iframe title="vista previa" sandbox="allow-scripts allow-modals" srcDoc={previewHtml} style={{ flex: 1, border: "none", borderLeft: "1px solid var(--border)", background: "#fff" }} />)}
        </>}
      </div>
      <div className="files-status"><span>{lines} líneas · {words} palabras · {fmtSize(new Blob([text || ""]).size)}</span><div className="tb-spacer" /><span>{isCode ? ext.toUpperCase() : "Texto"} · UTF-8</span></div>
    </div>
  );
}

/* ============================================================
   Hojas (Excel)
   ============================================================ */
const emptyBook = () => ({ sheets: [{ name: "Hoja1", cells: {}, fmt: {}, widths: {} }] });
function SheetsApp({ fileId, newDoc }) {
  useVfs(s => s.rev);
  const n = fileId ? vfs.node(fileId) : null;
  const [book, setBook] = useS1(null);
  const [si, setSi] = useS1(0);
  const [active, setActive] = useS1("A1");
  const [selEnd, setSelEnd] = useS1(null);
  const [editing, setEditing] = useS1(null); // texto en edición
  const [undo, setUndo] = useS1([]);
  const [renSheet, setRenSheet] = useS1(null);
  const bookRef = useR1(null); bookRef.current = book;
  const gridRef = useR1(null), dragSel = useR1(false);
  const isCsv = n && n.type === "csv";
  const { status, touch, flush } = useAutosave(async () => {
    const { bookToXlsx, bookToCsv } = await import("./office.js");
    await vfs.write(fileId, isCsv ? new Blob([bookToCsv(bookRef.current)], { type: "text/csv" }) : await bookToXlsx(bookRef.current));
  }, 1200);

  useE1(() => {
    setBook(null); if (!fileId) return;
    (async () => {
      try {
        const blob = await vfs.read(fileId); const { xlsxToBook, csvToBook } = await import("./office.js");
        setBook(!blob.size ? emptyBook() : isCsv ? csvToBook(await blob.text()) : await xlsxToBook(blob));
      } catch (e) { toast("No se pudo abrir la hoja: " + e.message, { error: true }); setBook(emptyBook()); }
    })();
  }, [fileId]);

  const sheet = book?.sheets[Math.min(si, (book?.sheets.length || 1) - 1)];
  const ev = useM1(() => sheet ? makeEvaluator(sheet.cells) : null, [sheet]);
  if (!fileId) return (
    <div className="app" style={{ flexDirection: "column" }}><EmptyState icon="table_chart" text="Abre un .xlsx o .csv desde Archivos" />
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 40 }}><button className="tb-btn primary" onClick={() => newDoc("xlsx")}><Ic name="add" /> Nuevo libro</button></div></div>);
  if (!n) return <EmptyState icon="error" text="El archivo ya no existe" />;
  if (!book) return <EmptyState icon="hourglass_empty" text="Abriendo hoja…" />;

  let maxC = 0, maxR = 0; Object.keys(sheet.cells).forEach(k => { const p = parseRef(k); if (p) { maxC = Math.max(maxC, p.c); maxR = Math.max(maxR, p.r); } });
  const COLS = Math.max(12, maxC + 4), ROWS = Math.max(40, maxR + 12);
  const a = parseRef(active), b = parseRef(selEnd || active);
  const rng = { c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c), r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r) };
  const inRange = (c, r) => c >= rng.c1 && c <= rng.c2 && r >= rng.r1 && r <= rng.r2;
  const rangeRefs = () => { const out = []; for (let r = rng.r1; r <= rng.r2; r++) for (let c = rng.c1; c <= rng.c2; c++) out.push(refName(c, r)); return out; };

  const mutateSheet = (fn) => {
    setUndo(u => [...u.slice(-49), JSON.stringify(book)]);
    setBook(bk => { const nb = { sheets: bk.sheets.map((s, i) => i === si ? { ...s, cells: { ...s.cells }, fmt: { ...s.fmt }, widths: { ...s.widths } } : s) }; fn(nb.sheets[si], nb); return nb; });
    touch();
  };
  const setCell = (ref, v) => mutateSheet(s => { if (v === "" || v == null) delete s.cells[ref]; else s.cells[ref] = v; });
  const commitEdit = (move) => {
    if (editing != null) { setCell(active, editing); setEditing(null); }
    if (move) { const p = parseRef(active); const np = { c: Math.max(0, p.c + move[0]), r: Math.max(0, p.r + move[1]) }; setActive(refName(np.c, np.r)); setSelEnd(null); }
    gridRef.current?.focus();
  };
  const toggleFmt = (key, val) => mutateSheet(s => { const refs = rangeRefs(); const on = !refs.every(r => s.fmt[r]?.[key] === (val ?? true)); refs.forEach(r => { const f = { ...(s.fmt[r] || {}) }; if (on) f[key] = val ?? true; else delete f[key]; if (Object.keys(f).length) s.fmt[r] = f; else delete s.fmt[r]; }); });
  const autoSum = () => {
    if (rng.r2 > rng.r1 || rng.c2 > rng.c1) { // suma bajo la selección
      const target = refName(rng.c1, rng.r2 + 1); setCell(target, `=SUM(${refName(rng.c1, rng.r1)}:${refName(rng.c2, rng.r2)})`); setActive(target); setSelEnd(null); return;
    }
    let r = a.r - 1; while (r >= 0 && sheet.cells[refName(a.c, r)] != null && !isNaN(Number(ev.value(refName(a.c, r))))) r--;
    if (r < a.r - 1) setCell(active, `=SUM(${refName(a.c, r + 1)}:${refName(a.c, a.r - 1)})`);
  };
  const copySel = async (cut) => {
    const rows = []; for (let r = rng.r1; r <= rng.r2; r++) { const row = []; for (let c = rng.c1; c <= rng.c2; c++) row.push(sheet.cells[refName(c, r)] ?? ""); rows.push(row.join("\t")); }
    try { await navigator.clipboard.writeText(rows.join("\n")); } catch {}
    if (cut) mutateSheet(s => rangeRefs().forEach(r => delete s.cells[r]));
  };
  const pasteSel = async () => {
    let t = ""; try { t = await navigator.clipboard.readText(); } catch { return toast("Permite el acceso al portapapeles para pegar", { error: true }); }
    const rows = t.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(r => r.split("\t"));
    mutateSheet(s => rows.forEach((row, dr) => row.forEach((v, dc) => { const ref = refName(a.c + dc, a.r + dr); if (v === "") delete s.cells[ref]; else s.cells[ref] = v; })));
  };
  const onKey = (e) => {
    if (editing != null || renSheet != null) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key;
    const moveTo = (dc, dr) => { e.preventDefault(); const base = e.shiftKey ? parseRef(selEnd || active) : a; const np = refName(Math.max(0, base.c + dc), Math.max(0, base.r + dr)); if (e.shiftKey) setSelEnd(np); else { setActive(np); setSelEnd(null); } };
    if (k === "ArrowUp") moveTo(0, -1); else if (k === "ArrowDown" || k === "Enter") moveTo(0, 1);
    else if (k === "ArrowLeft") moveTo(-1, 0); else if (k === "ArrowRight" || k === "Tab") moveTo(1, 0);
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); mutateSheet(s => rangeRefs().forEach(r => delete s.cells[r])); }
    else if (k === "F2") { e.preventDefault(); setEditing(sheet.cells[active] ?? ""); }
    else if (ctrl && k.toLowerCase() === "b") { e.preventDefault(); toggleFmt("b"); }
    else if (ctrl && k.toLowerCase() === "i") { e.preventDefault(); toggleFmt("i"); }
    else if (ctrl && k.toLowerCase() === "s") { e.preventDefault(); flush(); }
    else if (ctrl && k.toLowerCase() === "z") { e.preventDefault(); if (undo.length) { setBook(JSON.parse(undo[undo.length - 1])); setUndo(u => u.slice(0, -1)); touch(); } }
    else if (ctrl && k.toLowerCase() === "c") copySel(false);
    else if (ctrl && k.toLowerCase() === "x") copySel(true);
    else if (ctrl && k.toLowerCase() === "v") pasteSel();
    else if (!ctrl && !e.altKey && k.length === 1) { setEditing(k); e.preventDefault(); }
  };
  const addSheet = () => { setUndo(u => [...u, JSON.stringify(book)]); setBook(bk => ({ sheets: [...bk.sheets, { name: "Hoja" + (bk.sheets.length + 1), cells: {}, fmt: {}, widths: {} }] })); setSi(book.sheets.length); touch(); };
  const delSheet = (i) => { if (book.sheets.length < 2) return; setUndo(u => [...u, JSON.stringify(book)]); setBook(bk => ({ sheets: bk.sheets.filter((_, j) => j !== i) })); setSi(0); touch(); };
  const shownVal = (ref) => { const v = ev.value(ref); return display(v); };
  const rawActive = sheet.cells[active] ?? "";
  const selInfo = (() => { const refs = rangeRefs(); if (refs.length < 2) return null; const nums = refs.map(r => ev.value(r)).filter(v => typeof v === "number"); if (!nums.length) return `Recuento: ${refs.filter(r => sheet.cells[r] != null).length}`; const s = nums.reduce((x, y) => x + y, 0); const r2 = (v) => display(Math.round(v * 100) / 100); return `Suma: ${r2(s)} · Promedio: ${r2(s / nums.length)} · Recuento: ${nums.length}`; })();

  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <div className="ribbon">
        <div className="ribbon-tabs">
          <div className="ribbon-titlebar"><span className="office-badge x">X</span>{n.name}</div>
          <div className="tb-spacer" /><SaveBadge status={status} />
        </div>
        <div className="ribbon-body">
          <div className="rb-group"><div className="rb-row">
            <button className="rb-btn" title="Deshacer (Ctrl+Z)" disabled={!undo.length} onClick={() => { setBook(JSON.parse(undo[undo.length - 1])); setUndo(u => u.slice(0, -1)); touch(); }}><Ic name="undo" size={18} /></button>
            <button className="rb-btn" title="Copiar (Ctrl+C)" onClick={() => copySel(false)}><Ic name="content_copy" size={18} /></button>
            <button className="rb-btn" title="Pegar (Ctrl+V)" onClick={pasteSel}><Ic name="content_paste" size={18} /></button>
          </div><div className="rb-label">Portapapeles</div></div>
          <div className="rb-group"><div className="rb-row">
            <button className={"rb-btn" + (sheet.fmt[active]?.b ? " on" : "")} title="Negrita (Ctrl+B)" onClick={() => toggleFmt("b")}><Ic name="format_bold" size={18} /></button>
            <button className={"rb-btn" + (sheet.fmt[active]?.i ? " on" : "")} title="Cursiva (Ctrl+I)" onClick={() => toggleFmt("i")}><Ic name="format_italic" size={18} /></button>
            <button className="rb-btn" title="Alinear a la izquierda" onClick={() => toggleFmt("align", "left")}><Ic name="format_align_left" size={18} /></button>
            <button className="rb-btn" title="Centrar" onClick={() => toggleFmt("align", "center")}><Ic name="format_align_center" size={18} /></button>
            <button className="rb-btn" title="Alinear a la derecha" onClick={() => toggleFmt("align", "right")}><Ic name="format_align_right" size={18} /></button>
          </div><div className="rb-label">Formato</div></div>
          <div className="rb-group"><div className="rb-row">
            <button className="rb-btn" title="Autosuma" onClick={autoSum}><Ic name="functions" size={18} /></button>
            <button className="rb-btn" title="Borrar selección (Supr)" onClick={() => mutateSheet(s => rangeRefs().forEach(r => delete s.cells[r]))}><Ic name="backspace" size={18} /></button>
          </div><div className="rb-label">Edición</div></div>
          <div className="tb-spacer" />
          <button className="tb-btn" style={{ alignSelf: "center" }} title="Descargar" onClick={async () => { await flush(); vfs.download(fileId); }}><Ic name="download" /> Descargar</button>
          <button className="tb-btn" style={{ alignSelf: "center", margin: "0 10px 0 6px" }} onClick={() => window.open(OFFICE_WEB.excel.ms, "_blank", "noopener")}><Ic name="open_in_new" /> Excel web</button>
        </div>
      </div>
      <div className="formula-bar">
        <span className="name-box">{selEnd && selEnd !== active ? `${active}:${selEnd}` : active}</span>
        <span className="fx">fx</span>
        <input value={editing ?? rawActive} onChange={e => setEditing(e.target.value)} onFocus={() => setEditing(rawActive)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitEdit([0, 1]); } if (e.key === "Escape") { setEditing(null); gridRef.current?.focus(); } }}
          onBlur={() => editing != null && commitEdit()} placeholder="Escribe un valor o una fórmula, p. ej. =SUM(B2:B9)" />
      </div>
      <div className="scroll sheet-scroll" ref={gridRef} tabIndex={0} onKeyDown={onKey} onMouseUp={() => { dragSel.current = false; }}>
        <table className="sheet">
          <thead><tr><th className="sh-corner"></th>
            {Array.from({ length: COLS }, (_, c) => <th key={c} className={"sh-head" + (c >= rng.c1 && c <= rng.c2 ? " hl" : "")} style={{ width: sheet.widths[numToCol(c)] || 96, minWidth: sheet.widths[numToCol(c)] || 96 }}>{numToCol(c)}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, r) => (
              <tr key={r}><th className={"sh-rownum" + (r >= rng.r1 && r <= rng.r2 ? " hl" : "")}>{r + 1}</th>
                {Array.from({ length: COLS }, (_, c) => {
                  const ref = refName(c, r), isA = ref === active, f = sheet.fmt[ref] || {};
                  const raw = sheet.cells[ref];
                  const v = raw == null ? "" : shownVal(ref);
                  const num = raw != null && typeof ev.value(ref) === "number";
                  const err = raw != null && isErr(ev.value(ref));
                  return (
                    <td key={c} className={"sh-cell" + (isA ? " active" : inRange(c, r) ? " insel" : "")}
                      onMouseDown={e => { if (editing != null && !isA) commitEdit(); if (e.shiftKey) setSelEnd(ref); else { setActive(ref); setSelEnd(null); dragSel.current = true; } }}
                      onMouseEnter={() => { if (dragSel.current) setSelEnd(ref); }}
                      onDoubleClick={() => setEditing(raw ?? "")}>
                      {isA && editing != null
                        ? <input autoFocus value={editing} onChange={e => setEditing(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitEdit([0, e.shiftKey ? -1 : 1]); } else if (e.key === "Tab") { e.preventDefault(); commitEdit([e.shiftKey ? -1 : 1, 0]); } else if (e.key === "Escape") { setEditing(null); gridRef.current?.focus(); } }}
                            onBlur={() => commitEdit()} />
                        : <span className="sh-val" style={{ fontWeight: f.b ? 700 : 400, fontStyle: f.i ? "italic" : "normal", color: err ? "#e2483d" : undefined,
                            justifyContent: f.align === "center" ? "center" : f.align === "right" || (num && f.align !== "left") ? "flex-end" : "flex-start" }}>{v}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheet-tabs">
        {book.sheets.map((s, i) => renSheet === i
          ? <input key={i} className="rename-input" autoFocus defaultValue={s.name} style={{ width: 110 }}
              onBlur={e => { const v = e.target.value.trim(); if (v) { setBook(bk => ({ sheets: bk.sheets.map((x, j) => j === i ? { ...x, name: v.slice(0, 31) } : x) })); touch(); } setRenSheet(null); }}
              onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenSheet(null); }} />
          : <span key={i} className={"sheet-tab" + (i === si ? " active" : "")} onClick={() => setSi(i)} onDoubleClick={() => setRenSheet(i)} title="Doble clic para renombrar">
              {s.name}{book.sheets.length > 1 && i === si && <Ic name="close" size={13} style={{ marginLeft: 4, cursor: "pointer" }} onClick={e => { e.stopPropagation(); delSheet(i); }} />}</span>)}
        {!isCsv && <Ic name="add" size={16} className="faint" style={{ cursor: "pointer" }} onClick={addSheet} />}
        <div className="tb-spacer" />{selInfo && <span className="faint" style={{ fontSize: 12, paddingRight: 12 }}>{selInfo}</span>}
      </div>
    </div>
  );
}

/* ============================================================
   Galería
   ============================================================ */
function Thumb({ node, onClick, active }) {
  const url = useObjectUrl(node.id, node.mtime);
  return (
    <div className={"gal-thumb" + (active ? " active" : "")} onClick={onClick} title={node.name}
      draggable onDragStart={e => dragIds(e, [node.id])}>
      {url ? <img src={url} alt={node.name} loading="lazy" /> : <div className="gal-ph"><Ic name="image" /></div>}
      <div className="gal-cap">{node.name}</div>
    </div>
  );
}
function GalleryApp({ fileId, update }) {
  useVfs(s => s.rev);
  const photos = vfs.allOfType(["img"]).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  const [viewId, setViewId] = useS1(fileId || null);
  const [play, setPlay] = useS1(false);
  const [zoom, setZoom] = useS1(false);
  const [props, setProps] = useS1(null);
  const up = useR1(null);
  useE1(() => { if (fileId) setViewId(fileId); }, [fileId]);
  const idx = photos.findIndex(p => p.id === viewId);
  const cur = idx >= 0 ? photos[idx] : null;
  const url = useObjectUrl(cur?.id, cur?.mtime);
  const step = (d) => { if (!photos.length) return; const j = (idx + d + photos.length) % photos.length; setViewId(photos[j].id); setZoom(false); };
  useE1(() => { if (!play || !cur) return; const t = setInterval(() => step(1), 3500); return () => clearInterval(t); }, [play, idx, photos.length]);
  useE1(() => {
    if (!cur) return;
    const k = (e) => { if (e.target.closest("input,textarea")) return; if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "Escape") { setViewId(null); setPlay(false); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [cur, idx]);
  const imgFolder = vfs.resolve("/Imágenes") || vfs.getState().root;

  return (
    <div className="app" style={{ flexDirection: "column", position: "relative" }} {...dropTarget(imgFolder.id)}>
      <input ref={up} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={async e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) { await vfs.importFiles(imgFolder.id, f); toast(`${f.length} imagen(es) añadida(s) a ${imgFolder.name}`); } }} />
      <Toolbar>
        <span className="tb-title">Galería</span>
        <span className="faint" style={{ fontSize: 12, marginLeft: 8 }}>{photos.length} imágenes</span>
        <div className="tb-spacer" />
        <button className="tb-btn" onClick={() => up.current.click()}><Ic name="add_photo_alternate" /> Añadir</button>
        <button className="tb-btn" disabled={!photos.length} onClick={() => { if (photos.length) { setViewId(photos[0].id); setPlay(true); } }}><Ic name="slideshow" /> Presentación</button>
      </Toolbar>
      <div className="scroll" style={{ flex: 1, padding: 14, background: "var(--surface-2)" }}>
        <div className="gal-grid">{photos.map(p => <Thumb key={p.id} node={p} onClick={() => setViewId(p.id)} />)}</div>
        {!photos.length && <EmptyState icon="photo_library" text="No hay imágenes · arrastra fotos aquí" />}
      </div>
      {cur && (
        <div className="gal-viewer" onClick={() => { setViewId(null); setPlay(false); }}>
          <div className="gal-bar" onClick={e => e.stopPropagation()}>
            <span className="gal-name">{cur.name} <span style={{ opacity: .6 }}>· {idx + 1} / {photos.length} · {fmtSize(cur.size)}</span></span>
            <div className="tb-spacer" />
            <button title={play ? "Pausar" : "Presentación"} onClick={() => setPlay(p => !p)}><Ic name={play ? "pause" : "play_arrow"} /></button>
            <button title={zoom ? "Ajustar" : "Tamaño real"} onClick={() => setZoom(z => !z)}><Ic name={zoom ? "zoom_in_map" : "zoom_out_map"} /></button>
            <button title="Usar como fondo" onClick={() => { update("wallpaper", "file:" + cur.id); toast("Fondo de escritorio cambiado", { icon: "wallpaper" }); }}><Ic name="wallpaper" /></button>
            <button title="Descargar" onClick={() => vfs.download(cur.id)}><Ic name="download" /></button>
            <button title="Información" onClick={() => setProps(cur.id)}><Ic name="info" /></button>
            <button title="Mover a la papelera" onClick={() => { const id = cur.id; step(1); vfs.trash([id]); toast("Imagen en la papelera", { icon: "delete", action: { label: "Deshacer", run: () => vfs.restore([id]) } }); if (photos.length === 1) setViewId(null); }}><Ic name="delete" /></button>
            <button title="Cerrar (Esc)" onClick={() => { setViewId(null); setPlay(false); }}><Ic name="close" /></button>
          </div>
          <div className={"gal-stage" + (zoom ? " zoom" : "")} onClick={e => e.stopPropagation()}>
            {url ? <img src={url} alt={cur.name} /> : <Ic name="hourglass_empty" size={40} />}
          </div>
          {photos.length > 1 && <>
            <button className="gal-nav l" onClick={e => { e.stopPropagation(); step(-1); }}><Ic name="chevron_left" size={34} /></button>
            <button className="gal-nav r" onClick={e => { e.stopPropagation(); step(1); }}><Ic name="chevron_right" size={34} /></button>
          </>}
        </div>
      )}
      {props && <PropertiesModal id={props} onClose={() => setProps(null)} />}
    </div>
  );
}

const SheetsOffice = withOnlyOffice(SheetsApp);
export { FilesApp, EditorApp, SheetsOffice as SheetsApp, GalleryApp };
