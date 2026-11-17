/* ============================================================
   Sotos OS — Documentos (Word-style), Presentaciones, Launchpad
   ============================================================ */
import React from "react";
import { APPS, WEB_SERVICES, OFFICE_WEB, appAllowed } from "./data.jsx";
import { Tile, Ic, Toolbar, EmptyState, Modal, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs, fmtDate, fmtSize } from "./vfs.js";
import { NodeGlyph } from "./files-ui.jsx";
import { useAutosave, SaveBadge } from "./apps1.jsx";
import { withOnlyOffice } from "./onlyoffice.jsx";
const { useState: useS5, useRef: useR5, useEffect: useE5 } = React;

/* -------------------- Documentos (.docx real) -------------------- */
function DocsApp({ fileId, newDoc }) {
  useVfs(s => s.rev);
  const n = fileId ? vfs.node(fileId) : null;
  const ref = useR5(null), imgIn = useR5(null);
  const [html, setHtml] = useS5(null);
  const [err, setErr] = useS5(null);
  const [words, setWords] = useS5(0);
  const [tableDlg, setTableDlg] = useS5(false);
  const { status, touch, flush } = useAutosave(async () => {
    if (!ref.current) return;
    const { htmlToDocx } = await import("./office.js");
    await vfs.write(fileId, await htmlToDocx(ref.current.innerHTML, n?.name.replace(/\.[^.]+$/, "")));
  }, 1800);

  useE5(() => {
    setHtml(null); setErr(null); if (!fileId) return;
    (async () => {
      try {
        const blob = await vfs.read(fileId);
        const { docxToHtml, sanitizeHtml } = await import("./office.js");
        setHtml(blob.size ? sanitizeHtml(await docxToHtml(blob)) : "<p><br></p>");
      } catch (e) { setErr(/\.(doc|odt|rtf)$/i.test(n?.name || "") ? "Sotos abre documentos .docx. Este formato antiguo no se puede editar aquí." : "No se pudo abrir el documento: " + e.message); }
    })();
  }, [fileId]);
  useE5(() => { if (html != null && ref.current) { ref.current.innerHTML = html; count(); } }, [html]);
  const count = () => { const t = ref.current?.innerText || ""; setWords(t.trim() ? t.trim().split(/\s+/).length : 0); };
  const changed = () => { count(); touch(); };
  const cmd = (c, v) => { ref.current?.focus(); document.execCommand(c, false, v); changed(); };
  const rb = (icon, c, v, title) => <button className="rb-btn" title={title} onMouseDown={e => { e.preventDefault(); cmd(c, v); }}><Ic name={icon} size={18} /></button>;
  const onPaste = async (e) => {
    const h = e.clipboardData.getData("text/html");
    if (h) { e.preventDefault(); const { sanitizeHtml } = await import("./office.js"); document.execCommand("insertHTML", false, sanitizeHtml(h)); changed(); }
  };

  if (!fileId) return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar><span className="tb-title">Documentos</span><div className="tb-spacer" /><button className="tb-btn primary" onClick={() => newDoc("docx")}><Ic name="add" /> Nuevo documento</button></Toolbar>
      <RecentList types={["docx"]} />
    </div>
  );
  if (!n) return <EmptyState icon="error" text="El archivo ya no existe" />;
  if (err) return <div className="app" style={{ flexDirection: "column" }}><EmptyState icon="description" text={err} />
    <div style={{ display: "flex", justifyContent: "center", paddingBottom: 40 }}><button className="tb-btn" onClick={() => vfs.download(fileId)}><Ic name="download" /> Descargar</button></div></div>;

  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <input ref={imgIn} type="file" accept="image/png,image/jpeg,image/gif" style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; const r = new FileReader(); r.onload = () => cmd("insertHTML", `<img src="${r.result}" width="400">`); r.readAsDataURL(f); }} />
      <div className="ribbon">
        <div className="ribbon-tabs">
          <div className="ribbon-titlebar"><span className="office-badge w">W</span>{n.name}</div>
          <div className="tb-spacer" /><SaveBadge status={status} />
        </div>
        <div className="ribbon-body">
          <div className="rb-group">
            <div className="rb-row">{rb("undo", "undo", null, "Deshacer")}{rb("redo", "redo", null, "Rehacer")}</div>
            <div className="rb-row">{rb("format_clear", "removeFormat", null, "Quitar formato")}</div>
            <div className="rb-label">Edición</div>
          </div>
          <div className="rb-group">
            <div className="rb-row">
              <select className="rb-select" style={{ width: 128 }} onChange={e => cmd("fontName", e.target.value)} defaultValue="Calibri">
                {["Calibri", "Arial", "Georgia", "Times New Roman", "Verdana", "Courier New", "Onest"].map(f => <option key={f}>{f}</option>)}
              </select>
              <select className="rb-select" style={{ width: 56 }} onChange={e => cmd("fontSize", e.target.value)} defaultValue="3">
                <option value="1">8</option><option value="2">10</option><option value="3">12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option>
              </select>
            </div>
            <div className="rb-row">
              {rb("format_bold", "bold", null, "Negrita (Ctrl+B)")}{rb("format_italic", "italic", null, "Cursiva (Ctrl+I)")}{rb("format_underlined", "underline", null, "Subrayado (Ctrl+U)")}
              {rb("strikethrough_s", "strikeThrough", null, "Tachado")}
              <label className="rb-btn" title="Color de texto" style={{ position: "relative" }}><Ic name="format_color_text" size={18} />
                <input type="color" defaultValue="#2f6fed" onMouseDown={e => e.stopPropagation()} onChange={e => cmd("foreColor", e.target.value)} style={{ position: "absolute", opacity: 0, inset: 0, cursor: "pointer" }} /></label>
              <label className="rb-btn" title="Resaltar" style={{ position: "relative" }}><Ic name="ink_highlighter" size={18} />
                <input type="color" defaultValue="#fff59d" onChange={e => cmd("hiliteColor", e.target.value)} style={{ position: "absolute", opacity: 0, inset: 0, cursor: "pointer" }} /></label>
            </div>
            <div className="rb-label">Fuente</div>
          </div>
          <div className="rb-group">
            <div className="rb-row">{rb("format_align_left", "justifyLeft")}{rb("format_align_center", "justifyCenter")}{rb("format_align_right", "justifyRight")}{rb("format_align_justify", "justifyFull")}</div>
            <div className="rb-row">{rb("format_list_bulleted", "insertUnorderedList")}{rb("format_list_numbered", "insertOrderedList")}{rb("format_indent_increase", "indent")}{rb("format_indent_decrease", "outdent")}</div>
            <div className="rb-label">Párrafo</div>
          </div>
          <div className="rb-group">
            <div className="rb-row" style={{ gap: 4 }}>
              <button className="style-chip" onMouseDown={e => { e.preventDefault(); cmd("formatBlock", "<p>"); }}>Normal</button>
              <button className="style-chip h" onMouseDown={e => { e.preventDefault(); cmd("formatBlock", "<h1>"); }}>Título 1</button>
              <button className="style-chip h" style={{ fontSize: 12 }} onMouseDown={e => { e.preventDefault(); cmd("formatBlock", "<h2>"); }}>Título 2</button>
              <button className="style-chip" style={{ fontStyle: "italic" }} onMouseDown={e => { e.preventDefault(); cmd("formatBlock", "<blockquote>"); }}>Cita</button>
            </div>
            <div className="rb-label">Estilos</div>
          </div>
          <div className="rb-group">
            <div className="rb-row">
              <button className="rb-btn" title="Imagen" onMouseDown={e => { e.preventDefault(); imgIn.current.click(); }}><Ic name="image" size={18} /></button>
              <button className="rb-btn" title="Tabla" onMouseDown={e => { e.preventDefault(); setTableDlg(true); }}><Ic name="table" size={18} /></button>
              <button className="rb-btn" title="Enlace" onMouseDown={e => { e.preventDefault(); const u = prompt("Dirección del enlace (https://…)"); if (u && /^https?:\/\//i.test(u)) cmd("createLink", u); }}><Ic name="link" size={18} /></button>
              {rb("horizontal_rule", "insertHorizontalRule", null, "Línea")}
            </div>
            <div className="rb-label">Insertar</div>
          </div>
          <div className="tb-spacer" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "center", marginRight: 10 }}>
            <button className="tb-btn" onClick={async () => { await flush(); vfs.download(fileId); }}><Ic name="download" /> .docx</button>
            <button className="tb-btn" onClick={async () => { const { printHtml } = await import("./office.js"); printHtml(ref.current.innerHTML, n.name); }}><Ic name="picture_as_pdf" /> PDF</button>
          </div>
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, background: "var(--surface-2)", padding: "26px 0" }}>
        {html == null ? <EmptyState icon="hourglass_empty" text="Abriendo documento…" /> :
          <div ref={ref} contentEditable suppressContentEditableWarning className="doc-page word" spellCheck
            onInput={changed} onPaste={onPaste} onBlur={() => status === "dirty" && flush()}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flush(); } }}
            style={{ maxWidth: 680, margin: "0 auto", background: "#fff", color: "#1b1f24", minHeight: 900,
              padding: "72px 84px", boxShadow: "var(--shadow-card)", outline: "none", fontSize: 15, lineHeight: 1.7, fontFamily: "Calibri, Carlito, 'Segoe UI', sans-serif" }} />}
      </div>
      <div className="files-status"><span>{words} palabras</span><div className="tb-spacer" /><span>Word (.docx) · Español</span></div>
      {tableDlg && <TableDialog onClose={() => setTableDlg(false)} onInsert={(r, c) => {
        const row = `<tr>${"<td>&nbsp;</td>".repeat(c)}</tr>`; cmd("insertHTML", `<table style="border-collapse:collapse;width:100%">${row.repeat(r)}</table><p><br></p>`); setTableDlg(false); }} />}
    </div>
  );
}
function TableDialog({ onClose, onInsert }) {
  const [r, setR] = useS5(3), [c, setC] = useS5(3);
  return (
    <Modal title="Insertar tabla" icon="table" onClose={onClose}
      actions={<><button className="tb-btn" onClick={onClose}>Cancelar</button><button className="tb-btn primary" onClick={() => onInsert(r, c)}>Insertar</button></>}>
      <div style={{ display: "flex", gap: 16 }}>
        <label className="field">Filas<input type="number" min={1} max={50} value={r} onChange={e => setR(Math.max(1, Math.min(50, +e.target.value)))} /></label>
        <label className="field">Columnas<input type="number" min={1} max={12} value={c} onChange={e => setC(Math.max(1, Math.min(12, +e.target.value)))} /></label>
      </div>
    </Modal>
  );
}
function RecentList({ types }) {
  useVfs(s => s.rev);
  const files = vfs.allOfType(types).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  const [, force] = useS5(0);
  return (
    <div className="scroll" style={{ flex: 1 }}>
      <div className="file-list">{files.map(f => (
        <div key={f.id} className="file-row" style={{ gridTemplateColumns: "1fr 140px 90px" }}
          onClick={() => window.dispatchEvent(new CustomEvent("sotos-open", { detail: f.id }))}>
          <span className="fl-name"><NodeGlyph node={f} size={20} /><div className="fname">{f.name}</div></span><span>{fmtDate(f.mtime)}</span><span style={{ textAlign: "right" }}>{fmtSize(f.size)}</span>
        </div>))}</div>
      {!files.length && <EmptyState icon="draft" text="Aún no hay archivos" />}
    </div>
  );
}

/* -------------------- Presentaciones (.pptx real) -------------------- */
const BGS = ["#ffffff", "#f4f1ea", "#1b1f24", "linear-gradient(135deg,#2b3a8c,#5b3a9e)", "linear-gradient(135deg,#0f7f6b,#2bd4c4)", "linear-gradient(135deg,#c43e1c,#ff8a00)", "#2f6fed"];
const isLightBg = (bg) => /^#(fff|f4f1ea)/i.test(bg);
const DEFAULT_SLIDES = () => [{ bg: "linear-gradient(135deg,#2b3a8c,#5b3a9e)", title: "Título de la presentación", sub: "Haz clic para editar el subtítulo" }];
function SlideView({ s, live, onEdit }) {
  const ink = s.dark ? "#1b1f24" : "#fff";
  const field = (key, style, tag = "div") => React.createElement(tag, {
    contentEditable: live, suppressContentEditableWarning: true, style: { outline: "none", ...style },
    onBlur: live ? (e) => { const v = e.target.textContent; if (v !== s[key]) onEdit({ [key]: v }); } : undefined,
  }, s[key]);
  return (
    <div className="slide" style={{ background: s.bg, color: ink }}>
      {s.kicker != null && field("kicker", { fontSize: "1.6cqw", fontWeight: 700, letterSpacing: ".12em", opacity: .75, marginBottom: "1.2cqw" })}
      {field("title", { fontSize: "4.4cqw", fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.08 })}
      {s.sub != null && field("sub", { fontSize: "2.3cqw", opacity: .82, marginTop: "1.3cqw" })}
      {s.bullets && <ul style={{ fontSize: "2.3cqw", lineHeight: 1.6, marginTop: "2.2cqw", paddingLeft: "3cqw" }}>
        {s.bullets.map((b, i) => <li key={i + ":" + b} contentEditable={live} suppressContentEditableWarning style={{ marginBottom: ".8cqw", outline: "none" }}
          onBlur={live ? e => { const v = e.target.textContent; if (v !== b) onEdit({ bullets: s.bullets.map((x, j) => j === i ? v : x).filter((x, j) => x.trim() || j !== i) }); } : undefined}
          onKeyDown={live ? e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); const nb = [...s.bullets]; nb.splice(i + 1, 0, ""); onEdit({ bullets: nb.map((x, j) => j === i ? e.target.textContent : x) }); } } : undefined}>{b}</li>)}</ul>}
      {s.dark && <div style={{ position: "absolute", left: "5%", bottom: "6%", width: "8cqw", height: ".5cqw", background: "var(--accent)" }} />}
    </div>
  );
}
function SlidesApp({ fileId, newDoc }) {
  useVfs(s => s.rev);
  const n = fileId ? vfs.node(fileId) : null;
  const [slides, setSlides] = useS5(null);
  const [cur, setCur] = useS5(0);
  const [present, setPresent] = useS5(false);
  const slidesRef = useR5(null); slidesRef.current = slides;
  const presRef = useR5(null);
  const { status, touch, flush } = useAutosave(async () => {
    const { slidesToPptx } = await import("./office.js");
    await vfs.write(fileId, await slidesToPptx(slidesRef.current, n?.name.replace(/\.[^.]+$/, "")));
  }, 1500);
  useE5(() => {
    setSlides(null); if (!fileId) return;
    (async () => {
      try { const blob = await vfs.read(fileId); const { pptxToSlides } = await import("./office.js"); setSlides(blob.size ? await pptxToSlides(blob) : DEFAULT_SLIDES()); setCur(0); }
      catch (e) { toast("No se pudo abrir la presentación: " + e.message, { error: true }); setSlides(DEFAULT_SLIDES()); }
    })();
  }, [fileId]);
  useE5(() => {
    if (!present) return;
    const k = (e) => {
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) { e.preventDefault(); setCur(c => Math.min(c + 1, slidesRef.current.length - 1)); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); setCur(c => Math.max(c - 1, 0)); }
      if (e.key === "Escape") setPresent(false);
    };
    const fs = () => { if (!document.fullscreenElement) setPresent(false); };
    document.addEventListener("keydown", k); document.addEventListener("fullscreenchange", fs);
    presRef.current?.requestFullscreen?.().catch(() => {});
    return () => { document.removeEventListener("keydown", k); document.removeEventListener("fullscreenchange", fs); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, [present]);

  if (!fileId) return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar><span className="tb-title">Presentaciones</span><div className="tb-spacer" /><button className="tb-btn primary" onClick={() => newDoc("pptx")}><Ic name="add" /> Nueva presentación</button></Toolbar>
      <RecentList types={["pptx"]} />
    </div>
  );
  if (!n) return <EmptyState icon="error" text="El archivo ya no existe" />;
  if (!slides) return <EmptyState icon="hourglass_empty" text="Abriendo presentación…" />;
  const s = slides[Math.min(cur, slides.length - 1)];
  const set = (fn) => { setSlides(fn); touch(); };
  const edit = (patch) => set(sl => sl.map((x, i) => i === cur ? { ...x, ...patch } : x));
  const addSlide = (layout) => { const ns = layout === "title" ? { bg: "linear-gradient(135deg,#2b3a8c,#5b3a9e)", title: "Sección", sub: "Subtítulo" } : { bg: "#ffffff", dark: true, title: "Nueva diapositiva", bullets: ["Primer punto", "Segundo punto"] }; set(sl => { const x = [...sl]; x.splice(cur + 1, 0, ns); return x; }); setCur(c => c + 1); };
  const dup = () => { set(sl => { const x = [...sl]; x.splice(cur + 1, 0, JSON.parse(JSON.stringify(sl[cur]))); return x; }); setCur(c => c + 1); };
  const del = () => { if (slides.length < 2) return; set(sl => sl.filter((_, i) => i !== cur)); setCur(c => Math.max(0, c - 1)); };
  const moveS = (d) => { const j = cur + d; if (j < 0 || j >= slides.length) return; set(sl => { const x = [...sl]; [x[cur], x[j]] = [x[j], x[cur]]; return x; }); setCur(j); };

  if (present) return (
    <div ref={presRef} className="app" style={{ background: "#000", position: "relative", display: "grid", placeItems: "center" }}
      onClick={() => setCur(c => Math.min(c + 1, slides.length - 1))} onContextMenu={e => { e.preventDefault(); setCur(c => Math.max(c - 1, 0)); }}>
      <div className="slide-frame" style={{ width: "min(100%, calc(100vh * 16 / 9))" }}><SlideView s={s} /></div>
      <div className="pres-hud">{cur + 1} / {slides.length} · ← → para navegar · Esc para salir</div>
    </div>
  );
  return (
    <div className="app">
      <div className="app-side slides-side">
        {slides.map((sl, i) => (
          <div key={i} className="slide-thumb-row" onClick={() => setCur(i)}>
            <span className="faint">{i + 1}</span>
            <div className={"slide-frame thumb" + (cur === i ? " on" : "")}><SlideView s={sl} /></div>
          </div>
        ))}
      </div>
      <div className="app-main">
        <Toolbar>
          <span className="office-badge p" style={{ marginRight: 2 }}>P</span>
          <span className="tb-title" style={{ fontSize: 13.5 }}>{n.name}</span>
          <div className="tb-spacer" /><SaveBadge status={status} />
          <button className="tb-btn" onClick={() => addSlide("bullets")} title="Diapositiva con viñetas"><Ic name="add" /> Diapositiva</button>
          <button className="tb-btn icon" onClick={() => addSlide("title")} title="Diapositiva de título"><Ic name="title" /></button>
          <button className="tb-btn icon" onClick={dup} title="Duplicar"><Ic name="content_copy" /></button>
          <button className="tb-btn icon" onClick={() => moveS(-1)} title="Mover arriba"><Ic name="arrow_upward" /></button>
          <button className="tb-btn icon" onClick={() => moveS(1)} title="Mover abajo"><Ic name="arrow_downward" /></button>
          <button className="tb-btn icon" onClick={del} title="Eliminar" disabled={slides.length < 2}><Ic name="delete" /></button>
          <button className="tb-btn icon" onClick={async () => { await flush(); vfs.download(fileId); }} title="Descargar .pptx"><Ic name="download" /></button>
          <button className="tb-btn primary" onClick={() => setPresent(true)}><Ic name="play_arrow" /> Presentar</button>
        </Toolbar>
        <div className="slide-editor">
          <div className="slide-frame main"><SlideView s={s} live onEdit={edit} /></div>
          <div className="slide-props">
            <span className="faint">Fondo</span>
            {BGS.map(bg => <button key={bg} className={"bg-swatch" + (s.bg === bg ? " on" : "")} style={{ background: bg }} onClick={() => edit({ bg, dark: isLightBg(bg) })} />)}
            <span className="faint" style={{ marginLeft: 12 }}>Elementos</span>
            <button className="tb-btn" onClick={() => edit({ sub: s.sub == null ? "Subtítulo" : undefined })}><Ic name={s.sub == null ? "add" : "remove"} size={16} /> Subtítulo</button>
            <button className="tb-btn" onClick={() => edit({ bullets: s.bullets ? undefined : ["Nuevo punto"] })}><Ic name={s.bullets ? "remove" : "add"} size={16} /> Viñetas</button>
            {s.bullets && <button className="tb-btn" onClick={() => edit({ bullets: [...s.bullets, "Nuevo punto"] })}><Ic name="format_list_bulleted_add" size={16} /> Punto</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- WebView (incrustar / abrir servicios) -------------------- */
function WebViewApp({ file, svc, office, openApp }) {
  // Office file -> versión web real
  if (office) {
    const m = OFFICE_WEB[office];
    return (
      <div className="app webview-launch" style={{ flexDirection: "column" }}>
        <div className="wl-card">
          <div className="office-badge2" style={{ background: m.color }}>{m.letter}</div>
          <div className="wl-title">{file}</div>
          <div className="wl-sub">Ábrelo en su versión web real. {m.name} no permite incrustarse, así que se abre en una pestaña segura.</div>
          <div className="wl-btns">
            <button className="tb-btn primary" onClick={() => window.open(m.ms, "_blank", "noopener")}>
              <Ic name="open_in_new" /> {m.name}
            </button>
            <button className="tb-btn" onClick={() => window.open(m.g, "_blank", "noopener")}>
              <Ic name="open_in_new" /> Google
            </button>
          </div>
          <div className="wl-or">o</div>
          <button className="wl-alt" onClick={() => openApp(m.editor, { file })}>
            <Ic name="draft" size={18} /> Abrir en el editor de Sotos
          </button>
        </div>
      </div>
    );
  }
  const service = svc && WEB_SERVICES.find(s => s.name === svc);
  if (service && service.embed) {
    return (
      <div className="app" style={{ flexDirection: "column", background: "#000" }}>
        <div className="webview-bar">
          <span className="wv-dot" style={{ background: service.color }} />
          <Ic name="lock" size={14} />
          <span className="wv-url">{service.url.replace("https://", "")}</span>
          <div className="tb-spacer" />
          <button className="tb-btn icon" title="Abrir en pestaña nueva" onClick={() => window.open(service.url, "_blank", "noopener")}><Ic name="open_in_new" /></button>
        </div>
        <iframe title={service.name} src={service.embed} style={{ flex: 1, width: "100%", border: "none", background: "#000" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
      </div>
    );
  }
  // external (no embeddable)
  const s = service || { name: file || "Servicio", icon: "public", color: "#0aa5b5", url: "#" };
  return (
    <div className="app webview-launch" style={{ flexDirection: "column" }}>
      <div className="wl-card">
        <div className="lp-svc" style={{ background: s.color, width: 76, height: 76, borderRadius: 22 }}><Ic name={s.icon} size={40} /></div>
        <div className="wl-title">{s.name}</div>
        <div className="wl-sub">{s.name} no permite incrustarse dentro de otra web (política de seguridad <span className="mono-inline">X-Frame-Options</span>). Se abre en una pestaña segura.</div>
        <div className="wl-btns">
          <button className="tb-btn primary" onClick={() => window.open(s.url, "_blank", "noopener")}><Ic name="open_in_new" /> Abrir {s.name}</button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Launchpad (apps + servicios + accesos) -------------------- */
function LaunchpadApp({ openApp, shortcuts = [], scApi }) {
  const [q, setQ] = useS5("");
  const [adding, setAdding] = useS5(false);
  const [nm, setNm] = useS5(""); const [url, setUrl] = useS5("");
  const launchable = APPS.filter(a => a.id !== "launchpad" && a.id !== "web" && appAllowed(a.id, vfs.getState().user) && a.name.toLowerCase().includes(q.toLowerCase()));
  const services = WEB_SERVICES.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
  const scs = shortcuts.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
  const COLORS = ["#2f6fed", "#34c759", "#8e5cf6", "#ff375f", "#ff8a00", "#0aa5b5"];
  const addSc = () => {
    if (!nm.trim() || !url.trim()) return;
    let u = url.trim(); if (!/^https?:\/\//.test(u)) u = "https://" + u;
    scApi.add({ name: nm.trim(), url: u, icon: "public", color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    setNm(""); setUrl(""); setAdding(false);
  };
  return (
    <div className="app launchpad" style={{ flexDirection: "column" }}>
      <div className="lp-search">
        <Ic name="search" />
        <input autoFocus placeholder="Buscar apps, servicios y accesos" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: "8px 28px 28px" }}>
        {!!launchable.length && <>
          <div className="lp-label">Apps de Sotos</div>
          <div className="lp-grid">
            {launchable.map(a => (
              <button key={a.id} className="lp-cell" onClick={() => openApp(a.id)}>
                <Tile icon={a.icon} color={a.color} size={62} app={a.id} /><span>{a.name}</span>
              </button>
            ))}
          </div>
        </>}
        {!!services.length && <>
          <div className="lp-label" style={{ marginTop: 22 }}>Servicios web <span className="faint" style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>· ⤢ se incrustan · ↗ abren en pestaña</span></div>
          <div className="lp-grid">
            {services.map(s => (
              <button key={s.name} className="lp-cell" onClick={() => openApp("browser", { url: s.url, scName: s.name })}>
                <div className="lp-svc" style={{ background: s.color }}><Ic name={s.icon} size={32} /><span className="lp-ext"><Ic name={s.embed ? "open_in_full" : "open_in_new"} size={13} /></span></div>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </>}
        <div className="lp-label" style={{ marginTop: 22 }}>Mis accesos directos</div>
        <div className="lp-grid">
          {scs.map(s => (
            <div key={s.name} className="lp-cell lp-sc" onClick={() => openApp("browser", { url: s.url, scName: s.name })}>
              <div className="lp-svc" style={{ background: s.color }}><Ic name={s.icon} size={32} />
                <span className="lp-rm" title="Quitar" onClick={e => { e.stopPropagation(); scApi.remove(s.name); }}><Ic name="close" size={13} /></span></div>
              <span>{s.name}</span>
            </div>
          ))}
          <button className="lp-cell" onClick={() => setAdding(true)}>
            <div className="lp-svc" style={{ background: "var(--surface-3)", color: "var(--text-dim)", border: "2px dashed var(--border-strong)" }}><Ic name="add" size={32} /></div>
            <span>Añadir</span>
          </button>
        </div>
        {(!launchable.length && !services.length && !scs.length) && <EmptyState icon="search_off" text="Sin resultados" />}
      </div>
      {adding && (
        <div className="share-modal" onMouseDown={() => setAdding(false)}>
          <div className="share-card" onMouseDown={e => e.stopPropagation()}>
            <Ic name="add_link" size={32} style={{ color: "var(--accent)" }} />
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>Nuevo acceso directo</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Ej. iLovePDF para combinar PDFs.</div>
            <input className="sc-input" placeholder="Nombre (ej. iLovePDF)" value={nm} onChange={e => setNm(e.target.value)} autoFocus />
            <input className="sc-input" placeholder="Dirección (ej. ilovepdf.com)" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addSc()} />
            <div className="wl-btns"><button className="tb-btn primary" onClick={addSc}><Ic name="check" /> Crear</button>
              <button className="tb-btn" onClick={() => setAdding(false)}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Papelera -------------------- */
function TrashApp() {
  const trash = useVfs(s => s.trash);
  const [confirm, setConfirm] = useS5(null); // { ids, all }
  const [sel, setSel] = useS5([]);
  const total = trash.reduce((s, t) => s + vfs.folderSize(t.node), 0);
  const origin = (t) => { const p = vfs.node(t.from); return p ? vfs.pathString(p.id) : "(carpeta eliminada)"; };
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar>
        <span className="office-badge" style={{ background: "#7d8590", width: 22, height: 22, marginRight: 4 }}><Ic name="delete" size={14} /></span>
        <span className="tb-title">Papelera</span>
        <span className="faint" style={{ fontSize: 12, marginLeft: 8 }}>{trash.length} elemento(s) · {fmtSize(total)}</span>
        <div className="tb-spacer" />
        {!!sel.length && <>
          <button className="tb-btn" onClick={() => { vfs.restore(sel); toast(`${sel.length} elemento(s) restaurado(s)`, { icon: "restore_from_trash" }); setSel([]); }}><Ic name="restore_from_trash" /> Restaurar</button>
          <button className="tb-btn" onClick={() => setConfirm({ ids: sel })}><Ic name="delete_forever" /> Eliminar</button>
        </>}
        <button className="tb-btn" disabled={!trash.length} style={{ opacity: trash.length ? 1 : .4 }} onClick={() => setConfirm({ ids: trash.map(t => t.node.id), all: true })}><Ic name="delete_sweep" /> Vaciar papelera</button>
      </Toolbar>
      <div className="scroll" style={{ flex: 1 }}>
        {trash.length ? (
          <div className="file-list">
            <div className="file-row head" style={{ gridTemplateColumns: "1fr 1fr 130px 90px" }}><span>Nombre</span><span>Ubicación original</span><span>Eliminado</span><span style={{ textAlign: "right" }}>Tamaño</span></div>
            {trash.map(t => (
              <div key={t.node.id} className={"file-row" + (sel.includes(t.node.id) ? " sel" : "")} style={{ gridTemplateColumns: "1fr 1fr 130px 90px" }}
                onClick={e => setSel(s => e.ctrlKey || e.metaKey ? (s.includes(t.node.id) ? s.filter(x => x !== t.node.id) : [...s, t.node.id]) : [t.node.id])}
                onDoubleClick={() => vfs.restore([t.node.id])}>
                <span className="fl-name"><NodeGlyph node={t.node} size={20} /><div className="fname">{t.node.name}</div></span>
                <span className="faint">{origin(t)}</span><span>{fmtDate(t.at)}</span><span style={{ textAlign: "right" }}>{fmtSize(vfs.folderSize(t.node))}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState icon="delete_outline" text="La papelera está vacía" />}
      </div>
      <div className="files-status"><span>Doble clic restaura un elemento a su carpeta original.</span></div>
      {confirm && <Modal title={confirm.all ? "¿Vaciar la papelera?" : `¿Eliminar ${confirm.ids.length} elemento(s)?`} icon="delete_forever" onClose={() => setConfirm(null)}
        actions={<><button className="tb-btn" onClick={() => setConfirm(null)}>Cancelar</button>
          <button className="tb-btn danger" onClick={async () => { await vfs.destroy(confirm.ids); setSel([]); setConfirm(null); toast("Eliminado definitivamente", { icon: "delete_forever" }); }}>Eliminar para siempre</button></>}>
        <div className="muted" style={{ fontSize: 13.5 }}>Esta acción no se puede deshacer. Los archivos se borrarán de este navegador.</div>
      </Modal>}
    </div>
  );
}

const DocsOffice = withOnlyOffice(DocsApp), SlidesOffice = withOnlyOffice(SlidesApp);
export { DocsOffice as DocsApp, SlidesOffice as SlidesApp, LaunchpadApp, WebViewApp, TrashApp };