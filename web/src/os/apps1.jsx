/* ============================================================
   Sotos OS — Files, Editor, Sheets, Gallery
   ============================================================ */
import React from "react";
import { ROUTE, CTX_FILE, OFFICE_WEB, PHOTOS } from "./data.jsx";
import { Ic, SideItem, Toolbar, EmptyState, FileGlyph, ContextMenu } from "./ui.jsx";
const { useState: useS1, useRef: useR1, useEffect: useE1 } = React;

/* -------------------- Files -------------------- */
function FilesApp({ openApp, fs, fsApi, toTrash }) {
  const [path, setPath] = useS1([]);
  const [sel, setSel] = useS1(null);
  const [q, setQ] = useS1("");
  const [ctx, setCtx] = useS1(null);
  const [renaming, setRenaming] = useS1(null);
  const [tmpName, setTmpName] = useS1("");
  const [toast, setToast] = useS1(null);
  const [share, setShare] = useS1(null);
  const [dropHot, setDropHot] = useS1(null);
  const fileInput = useR1(null);

  const node = path.reduce((n, name) => (n.children || []).find(c => c.name === name) || n, fs) || fs;
  const items = (node.children || []).filter(c => c.name.toLowerCase().includes(q.toLowerCase()));

  const flash = (msg) => { setToast(msg); clearTimeout(window.__ftoast); window.__ftoast = setTimeout(() => setToast(null), 2000); };

  const open = (item) => {
    if (item.type === "folder") { setPath([...path, item.name]); setSel(null); }
    else openApp(ROUTE[item.type] || "editor", { file: item.name, type: item.type, src: item.src, css: item.css });
  };

  const act = (id, item) => {
    switch (id) {
      case "open": open(item); break;
      case "rename": { setRenaming(items.indexOf(item)); setTmpName(item.name); break; }
      case "delete": toTrash && toTrash(item); fsApi.remove(path, item.name); flash("“" + item.name + "” movido a la papelera"); break;
      case "openpc": case "download": flash("Descargando “" + item.name + "”…"); break;
      case "copy": flash("Copiado al portapapeles"); break;
      case "cut": flash("Cortado"); break;
      case "props": flash(item.name + " · " + (item.size || "—") + " · modificado " + (item.mod || "—")); break;
      case "link": case "share": {
        const link = "https://sotos.app/s/" + Math.random().toString(36).slice(2, 9);
        setShare({ name: item.name, link });
        navigator.clipboard && navigator.clipboard.writeText(link).catch(() => {});
        break;
      }
    }
  };

  const commitRename = (idx) => { const it = items[idx]; if (it && tmpName.trim()) fsApi.rename(path, it.name, tmpName.trim()); setRenaming(null); };

  const onUpload = (e) => {
    const files = [...e.target.files]; if (!files.length) return;
    let pending = files.length; const out = [];
    const done = () => { if (--pending === 0) { fsApi.add(path, out); flash(files.length + " archivo(s) subido(s)"); } };
    files.forEach(f => {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      const type = ext.match(/png|jpe?g|gif|webp|bmp|svg/) ? "img" : ext.match(/docx?/) ? "docx" : ext.match(/xlsx?|csv/) ? "xlsx"
        : ext.match(/pptx?/) ? "pptx" : ext === "pdf" ? "pdf" : ext.match(/mp3|wav|ogg|m4a/) ? "audio" : ext.match(/mp4|mov|webm|mkv/) ? "video"
        : ext.match(/html|css|js|json/) ? "code" : "txt";
      const size = f.size > 1e6 ? (f.size / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(f.size / 1024)) + " KB";
      const item = { name: f.name, type, size, mod: "ahora" };
      if (type === "img") { const rd = new FileReader(); rd.onload = () => { item.src = rd.result; out.push(item); done(); }; rd.readAsDataURL(f); }
      else { out.push(item); done(); }
    });
    e.target.value = "";
  };

  const favs = [
    { icon: "rocket_launch", label: "Proyectos", path: ["Proyectos"], color: "#8e5cf6" },
    { icon: "description", label: "Documentos", path: ["Documentos"], color: "#2b579a" },
    { icon: "image", label: "Imágenes", path: ["Imágenes"], color: "#ff375f" },
    { icon: "music_note", label: "Música", path: ["Música"], color: "#fc3c44" },
    { icon: "movie", label: "Vídeos", path: ["Vídeos"], color: "#8e5cf6" },
  ];

  return (
    <div className="app" onClick={() => sel !== null && setSel(null)}>
      <input ref={fileInput} type="file" multiple style={{ display: "none" }} onChange={onUpload} />
      <div className="app-side">
        <div className="side-group">
          <div className="side-label">Favoritos</div>
          <SideItem icon="cloud" label="Sotos Drive" color="#2f6fed" active={!path.length} onClick={() => { setPath([]); setSel(null); }} />
          {favs.map(f => (
            <SideItem key={f.label} icon={f.icon} label={f.label} color={f.color}
              active={JSON.stringify(f.path) === JSON.stringify(path)}
              onClick={() => { setPath(f.path); setSel(null); }} />
          ))}
        </div>
        <div className="side-group">
          <div className="side-label">Ubicaciones</div>
          <SideItem icon="group" label="Compartido conmigo" color="#34c759" onClick={() => flash("Carpetas compartidas con tu equipo")} />
          <SideItem icon="delete" label="Papelera" color="#7d8590" onClick={() => flash("Papelera vacía")} />
        </div>
        <div className="side-group">
          <div className="side-label">Almacenamiento</div>
          <div style={{ padding: "4px 10px" }}>
            <div style={{ height: 6, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
              <div style={{ width: "42%", height: "100%", background: "var(--accent)" }} /></div>
            <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>42 GB de 100 GB usados</div>
          </div>
        </div>
      </div>
      <div className="app-main">
        <Toolbar>
          <button className="tb-btn icon" disabled={!path.length} style={{ opacity: path.length ? 1 : .4 }} onClick={() => setPath(path.slice(0, -1))}><Ic name="arrow_back" /></button>
          <div className="breadcrumb">
            <span className="crumb" style={{ cursor: "pointer" }} onClick={() => setPath([])}>Sotos Drive</span>
            {path.map((p, i) => (
              <React.Fragment key={i}><Ic name="chevron_right" size={16} className="sep" />
                <span className="crumb" style={{ cursor: "pointer" }} onClick={() => setPath(path.slice(0, i + 1))}>{p}</span></React.Fragment>
            ))}
          </div>
          <div className="tb-spacer" />
          <button className="tb-btn" onClick={() => fileInput.current.click()}><Ic name="cloud_upload" /> Subir</button>
          <button className="tb-btn icon" title="Nueva carpeta" onClick={() => fsApi.mkdir(path)}><Ic name="create_new_folder" /></button>
          <div className="search-box"><Ic name="search" size={17} /><input placeholder="Buscar aquí" value={q} onChange={e => setQ(e.target.value)} /></div>
        </Toolbar>
        <div className="file-grid">
          {items.map((item, i) => (
            <div key={item.name + i}
              className={"file-cell" + (sel === i ? " sel" : "") + (dropHot === i ? " drop-hot" : "")}
              draggable={renaming !== i}
              onClick={(e) => { e.stopPropagation(); setSel(i); }}
              onDoubleClick={() => open(item)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSel(i); setCtx({ x: e.clientX, y: e.clientY, item }); }}
              onDragStart={(e) => { e.dataTransfer.setData("text/sotos", item.name); e.dataTransfer.setData("text/sotos-item", JSON.stringify({ name: item.name, type: item.type, src: item.src, css: item.css, size: item.size })); }}
              onDragOver={(e) => { if (item.type === "folder") { e.preventDefault(); setDropHot(i); } }}
              onDragLeave={() => dropHot === i && setDropHot(null)}
              onDrop={(e) => { setDropHot(null); const name = e.dataTransfer.getData("text/sotos");
                if (name && item.type === "folder" && name !== item.name) { fsApi.move(path, name, [...path, item.name]); flash("“" + name + "” movido a " + item.name); } }}>
              <div className="ic"><FileGlyph type={item.type} css={item.css} src={item.src} size={46} /></div>
              {renaming === i
                ? <input className="rename-input" autoFocus value={tmpName} onClick={e => e.stopPropagation()}
                    onChange={e => setTmpName(e.target.value)} onBlur={() => commitRename(i)}
                    onKeyDown={e => { if (e.key === "Enter") commitRename(i); if (e.key === "Escape") setRenaming(null); }} />
                : <div className="fname">{item.name}</div>}
              {item.size && renaming !== i && <div className="fmeta">{item.size}</div>}
            </div>
          ))}
          {!items.length && <EmptyState icon="folder_open" text={q ? "Sin resultados" : "Carpeta vacía · sube o arrastra archivos"} />}
        </div>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={CTX_FILE} onSelect={(id) => act(id, ctx.item)} onClose={() => setCtx(null)} />}
      {toast && <div className="files-toast">{toast}</div>}
      {share && (
        <div className="share-modal" onClick={() => setShare(null)}>
          <div className="share-card" onClick={e => e.stopPropagation()}>
            <Ic name="link" size={34} style={{ color: "var(--accent)" }} />
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>Enlace para compartir</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Cualquiera con el enlace puede ver “{share.name}”.</div>
            <div className="share-link"><span>{share.link}</span>
              <button className="tb-btn primary" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(share.link); flash("Enlace copiado ✓"); setShare(null); }}><Ic name="content_copy" size={16} /> Copiar</button></div>
            <button className="wl-alt" style={{ marginTop: 14 }} onClick={() => setShare(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Notas (txt) -------------------- */
function EditorApp({ file }) {
  const ref = useR1(null);
  const [words, setWords] = useS1(0);
  const initial = `<h1>Bienvenido a Sotos</h1><p>Este es tu editor de <b>notas</b> en la nube. Todo lo que escribes se guarda automáticamente y te sigue allá donde inicies sesión.</p><p>Para documentos con formato avanzado (.docx) Sotos abre <b>Documentos</b>; para hojas de cálculo (.xlsx), <b>Hojas</b>. Haz doble clic en cualquier archivo y se abre en la app correcta.</p><ul><li>Sin instalaciones</li><li>Tus archivos siempre contigo</li><li>Colabora en tiempo real</li></ul>`;
  const count = () => { const t = ref.current?.innerText || ""; setWords(t.trim() ? t.trim().split(/\s+/).length : 0); };
  useE1(() => { count(); }, []);
  const cmd = (c, v) => { document.execCommand(c, false, v); ref.current.focus(); };
  const btn = (icon, c, v) => (
    <button className="tb-btn icon" onMouseDown={e => { e.preventDefault(); cmd(c, v); }}><Ic name={icon} /></button>
  );
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar>
        {btn("format_bold", "bold")}
        {btn("format_italic", "italic")}
        {btn("format_underlined", "underline")}
        <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
        {btn("format_list_bulleted", "insertUnorderedList")}
        {btn("format_list_numbered", "insertOrderedList")}
        {btn("format_align_left", "justifyLeft")}
        {btn("format_align_center", "justifyCenter")}
        <div className="tb-spacer" />
        <span className="faint" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
          <Ic name="cloud_done" size={16} /> Guardado · {words} palabras
        </span>
      </Toolbar>
      <div className="scroll" style={{ flex: 1, background: "var(--surface-2)", padding: "30px 0" }}>
        <div ref={ref} contentEditable suppressContentEditableWarning onInput={count}
          className="doc-page"
          style={{ maxWidth: 620, margin: "0 auto", background: "var(--surface)", minHeight: 600,
            padding: "56px 64px", borderRadius: 8, boxShadow: "var(--shadow-card)", outline: "none",
            fontSize: 16, lineHeight: 1.7, color: "var(--text)" }}
          dangerouslySetInnerHTML={{ __html: initial }} />
      </div>
    </div>
  );
}

/* -------------------- Hojas (Excel-style, con fórmulas) -------------------- */
const colNum = c => c.charCodeAt(0) - 65;
const cellNum = v => { const n = parseFloat(String(v).replace(/[^\d.\-]/g, "")); return isNaN(n) ? 0 : n; };
function evalCell(raw, cells, depth) {
  if (raw == null || raw === "") return "";
  raw = String(raw);
  if (raw[0] !== "=") return raw;
  if (depth > 25) return "#REF";
  let e = raw.slice(1);
  e = e.replace(/SUM\(\s*([A-Z])(\d+)\s*:\s*([A-Z])(\d+)\s*\)/gi, (m, c1, r1, c2, r2) => {
    let s = 0; const ca = colNum(c1.toUpperCase()), cb = colNum(c2.toUpperCase());
    for (let c = Math.min(ca, cb); c <= Math.max(ca, cb); c++)
      for (let r = Math.min(+r1, +r2); r <= Math.max(+r1, +r2); r++)
        s += cellNum(evalCell(cells[String.fromCharCode(65 + c) + r], cells, depth + 1));
    return s;
  });
  e = e.replace(/([A-Z])(\d+)/gi, m => cellNum(evalCell(cells[m.toUpperCase()], cells, depth + 1)));
  try { const r = Function('"use strict";return(' + e + ")")(); return typeof r === "number" ? Math.round(r * 100) / 100 : r; }
  catch (_) { return "#ERR"; }
}
function SheetsApp({ file }) {
  const COLS = 9, ROWS = 26;
  const seed = { A1: "Presupuesto de marketing",
    A3: "Categoría", B3: "Cantidad", C3: "Coste/ud.", D3: "Subtotal",
    A5: "Honorarios", B5: "2", C5: "2300", D5: "=B5*C5",
    A6: "Investigación web", B6: "1", C6: "1100", D6: "=B6*C6",
    A7: "Externa", B7: "3", C7: "300", D7: "=B7*C7",
    A9: "Total investigación", D9: "=SUM(D5:D7)",
    A11: "Comunicación", A12: "Folletos", B12: "5000", C12: "0.15", D12: "=B12*C12",
    A13: "Televisión", B13: "5", C13: "4000", D13: "=B13*C13",
    A15: "Total general", D15: "=D9+D12+D13" };
  const [cells, setCells] = useS1(seed);
  const [active, setActive] = useS1("D9");
  const [editing, setEditing] = useS1(false);
  const colName = i => String.fromCharCode(65 + i);
  const tabs = ["Inicio", "Insertar", "Datos", "Revisar", "Vista"];
  const [tab, setTab] = useS1("Inicio");
  const setCell = (id, v) => setCells(c => ({ ...c, [id]: v }));

  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <div className="ribbon">
        <div className="ribbon-tabs">
          <div className="ribbon-titlebar"><span className="office-badge x">X</span>{file || "Presupuesto marketing.xlsx"}</div>
          {tabs.map(t => <button key={t} className={"ribbon-tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        <div className="ribbon-body">
          <div className="rb-group">
            <div className="rb-row">
              <button className="rb-btn"><Ic name="format_bold" size={18} /></button>
              <button className="rb-btn"><Ic name="format_italic" size={18} /></button>
              <button className="rb-btn"><Ic name="format_color_text" size={18} /></button>
            </div>
            <div className="rb-label">Fuente</div>
          </div>
          <div className="rb-group">
            <div className="rb-row">
              <button className="rb-btn" title="Sumar columna" onClick={() => setCell(active, "=SUM(" + active[0] + "5:" + active[0] + (parseInt(active.slice(1)) - 1) + ")")}><Ic name="functions" size={18} /></button>
              <button className="rb-btn"><Ic name="attach_money" size={18} /></button>
              <button className="rb-btn"><Ic name="percent" size={18} /></button>
            </div>
            <div className="rb-label">Fórmulas</div>
          </div>
          <div className="tb-spacer" />
          <button className="tb-btn" style={{ alignSelf: "center" }} onClick={() => window.open(OFFICE_WEB.excel.ms, "_blank", "noopener")}><Ic name="open_in_new" /> Web</button>
          <button className="tb-btn primary" style={{ alignSelf: "center", margin: "0 10px" }}><Ic name="group_add" /> Compartir</button>
        </div>
      </div>
      <div className="formula-bar">
        <span className="name-box">{active}</span>
        <span className="fx">fx</span>
        <input value={cells[active] || ""} onChange={e => setCell(active, e.target.value)} onFocus={() => setEditing(false)} placeholder="Escribe un valor o =fórmula (ej. =B5*C5)" />
      </div>
      <div className="scroll" style={{ flex: 1, background: "var(--surface-2)" }}>
        <table className="sheet" style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr><th className="sh-corner"></th>
              {Array.from({ length: COLS }).map((_, c) => <th key={c} className="sh-head">{colName(c)}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }).map((_, r) => (
              <tr key={r}>
                <th className="sh-rownum">{r + 1}</th>
                {Array.from({ length: COLS }).map((_, c) => {
                  const id = colName(c) + (r + 1);
                  const isHeader = [1, 3].includes(r + 1) || /Total/.test(cells["A" + (r + 1)] || "");
                  const isActive = active === id;
                  return (
                    <td key={c} className={"sh-cell" + (isActive ? " active" : "")}
                      onClick={() => { setActive(id); setEditing(false); }}
                      onDoubleClick={() => { setActive(id); setEditing(true); }}>
                      {isActive && editing
                        ? <input autoFocus value={cells[id] || ""} onChange={e => setCell(id, e.target.value)}
                            onBlur={() => setEditing(false)} onKeyDown={e => e.key === "Enter" && setEditing(false)}
                            style={{ fontWeight: isHeader ? 700 : 400 }} />
                        : <span className="sh-val" style={{ fontWeight: isHeader ? 700 : 400, justifyContent: cellNum(evalCell(cells[id], cells, 0)) && String(cells[id])[0] === "=" ? "flex-end" : "flex-start" }}>{evalCell(cells[id], cells, 0)}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheet-tabs"><span className="sheet-tab active">Presupuesto</span><span className="sheet-tab">Gráfico</span><Ic name="add" size={16} className="faint" /></div>
    </div>
  );
}

/* -------------------- Gallery -------------------- */
function GalleryApp() {
  const [view, setView] = useS1(null);
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar>
        <span className="tb-title">Galería</span>
        <span className="faint" style={{ fontSize: 12, marginLeft: 8 }}>{PHOTOS.length} elementos</span>
        <div className="tb-spacer" />
        <button className="tb-btn icon"><Ic name="grid_view" /></button>
        <button className="tb-btn icon"><Ic name="slideshow" /></button>
      </Toolbar>
      <div className="scroll" style={{ flex: 1, padding: 16, background: "var(--surface-2)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
          {PHOTOS.map((p, i) => (
            <div key={i} onClick={() => setView(i)}
              style={{ aspectRatio: "4/3", borderRadius: 12, background: p.css, cursor: "pointer",
                position: "relative", boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 12px 8px",
                background: "linear-gradient(transparent,rgba(0,0,0,.45))", color: "#fff", fontSize: 13, fontWeight: 600 }}>{p.name}</div>
            </div>
          ))}
        </div>
      </div>
      {view !== null && (
        <div onClick={() => setView(null)}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.82)", zIndex: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: "78%", height: "72%", borderRadius: 14, background: PHOTOS[view].css, boxShadow: "0 20px 60px rgba(0,0,0,.6)" }} />
          <div style={{ color: "#fff", fontWeight: 600 }}>{PHOTOS[view].name}</div>
          <div style={{ display: "flex", gap: 24, color: "rgba(255,255,255,.85)" }}>
            <Ic name="chevron_left" size={32} style={{ cursor: "pointer" }}
              onClick={e => { e.stopPropagation(); setView((view - 1 + PHOTOS.length) % PHOTOS.length); }} />
            <Ic name="chevron_right" size={32} style={{ cursor: "pointer" }}
              onClick={e => { e.stopPropagation(); setView((view + 1) % PHOTOS.length); }} />
          </div>
        </div>
      )}
    </div>
  );
}

export { FilesApp, EditorApp, SheetsApp, GalleryApp };
