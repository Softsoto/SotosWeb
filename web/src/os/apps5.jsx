/* ============================================================
   Sotos OS — Documentos (Word-style), Presentaciones, Launchpad
   ============================================================ */
import React from "react";
import { APPS, WEB_SERVICES, OFFICE_WEB } from "./data.jsx";
import { Tile, Ic, Toolbar, EmptyState, FileGlyph } from "./ui.jsx";
const { useState: useS5, useRef: useR5, useEffect: useE5 } = React;

/* -------------------- Documentos -------------------- */
function docContent(file) {
  const title = (file || "Documento.docx").replace(/\.[^.]+$/, "");
  const P = (w) => `<p>${"Este documento de Sotos se sincroniza en la nube y permite edición simultánea con tu equipo. ".repeat(w)}</p>`;
  return `<h1>${title}</h1>
    <p class="doc-sub">Sotos Cloud · ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>
    <p>Este acuerdo se establece entre las partes abajo firmantes con el objeto de regular la colaboración descrita en las siguientes cláusulas. ${"Las partes reconocen y aceptan los términos aquí expuestos. ".repeat(2)}</p>
    <h2>I. Objeto</h2>${P(3)}
    <h2>II. Duración</h2>${P(2)}
    <h2>III. Obligaciones</h2><ul><li>Mantener la confidencialidad de la información compartida.</li><li>Colaborar de buena fe en los objetivos comunes.</li><li>Revisar y aprobar los entregables en los plazos acordados.</li></ul>
    <h2>IV. Disposiciones finales</h2>${P(3)}`;
}
function DocsApp({ file }) {
  const ref = useR5(null);
  const tabs = ["Inicio", "Insertar", "Diseño", "Revisar", "Vista"];
  const [tab, setTab] = useS5("Inicio");
  const cmd = (c, v) => { document.execCommand(c, false, v); ref.current.focus(); };
  const rb = (icon, c, v) => <button className="rb-btn" onMouseDown={e => { e.preventDefault(); cmd(c, v); }}><Ic name={icon} size={18} /></button>;

  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <div className="ribbon">
        <div className="ribbon-tabs">
          <div className="ribbon-titlebar"><span className="office-badge w">W</span>{file || "Documento.docx"}</div>
          {tabs.map(t => <button key={t} className={"ribbon-tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        <div className="ribbon-body">
          <div className="rb-group">
            <div className="rb-row">
              <select className="rb-select" style={{ width: 120 }} onChange={e => cmd("fontName", e.target.value)} defaultValue="Onest">
                <option>Onest</option><option>Georgia</option><option>Times New Roman</option><option>Arial</option>
              </select>
              <select className="rb-select" style={{ width: 56 }} onChange={e => cmd("fontSize", e.target.value)} defaultValue="3">
                <option value="2">11</option><option value="3">13</option><option value="4">16</option><option value="5">20</option>
              </select>
            </div>
            <div className="rb-row">
              {rb("format_bold", "bold")}{rb("format_italic", "italic")}{rb("format_underlined", "underline")}
              {rb("strikethrough_s", "strikeThrough")}{rb("format_color_text", "foreColor", "#2f6fed")}
            </div>
            <div className="rb-label">Fuente</div>
          </div>
          <div className="rb-group">
            <div className="rb-row">
              {rb("format_align_left", "justifyLeft")}{rb("format_align_center", "justifyCenter")}
              {rb("format_align_right", "justifyRight")}{rb("format_align_justify", "justifyFull")}
            </div>
            <div className="rb-row">
              {rb("format_list_bulleted", "insertUnorderedList")}{rb("format_list_numbered", "insertOrderedList")}
              {rb("format_indent_increase", "indent")}{rb("format_indent_decrease", "outdent")}
            </div>
            <div className="rb-label">Párrafo</div>
          </div>
          <div className="rb-group">
            <div className="rb-row" style={{ gap: 4 }}>
              <button className="style-chip" onMouseDown={e => { e.preventDefault(); cmd("formatBlock", "<p>"); }}>Normal</button>
              <button className="style-chip h" onMouseDown={e => { e.preventDefault(); cmd("formatBlock", "<h2>"); }}>Título 1</button>
            </div>
            <div className="rb-label">Estilos</div>
          </div>
          <div className="tb-spacer" />
          <button className="tb-btn" style={{ alignSelf: "center" }} onClick={() => window.open(OFFICE_WEB.word.ms, "_blank", "noopener")}><Ic name="open_in_new" /> Web</button>
          <button className="tb-btn primary" style={{ alignSelf: "center", margin: "0 10px" }}><Ic name="group_add" /> Compartir</button>
        </div>
      </div>
      <div className="doc-status"><Ic name="cloud_done" size={15} /> Guardado en Sotos · Edición en tiempo real</div>
      <div className="scroll" style={{ flex: 1, background: "var(--surface-2)", padding: "26px 0" }}>
        <div ref={ref} contentEditable suppressContentEditableWarning className="doc-page word"
          style={{ maxWidth: 660, margin: "0 auto", background: "#fff", color: "#1b1f24", minHeight: 800,
            padding: "72px 84px", boxShadow: "var(--shadow-card)", outline: "none", fontSize: 15.5, lineHeight: 1.75 }}
          dangerouslySetInnerHTML={{ __html: docContent(file) }} />
      </div>
    </div>
  );
}

/* -------------------- Presentaciones -------------------- */
const SLIDES0 = [
  { bg: "linear-gradient(135deg,#2b3a8c,#5b3a9e)", title: "Tendencias de marca 2026", sub: "Estrategia y dirección creativa", kicker: "SOTOS · EQUIPO PRODUCTO" },
  { bg: "#ffffff", dark: true, title: "El reto", bullets: ["Saturación visual en el sector", "Audiencias más jóvenes y digitales", "Necesidad de una identidad coherente"] },
  { bg: "#ffffff", dark: true, title: "Tres pilares", bullets: ["Claridad — menos es más", "Calidez — humano y cercano", "Movimiento — vivo y dinámico"] },
  { bg: "linear-gradient(135deg,#0f7f6b,#2bd4c4)", title: "Próximos pasos", sub: "Roadmap del trimestre", kicker: "Q3 2026" },
];
function SlidesApp({ file }) {
  const [slides, setSlides] = useS5(() => JSON.parse(JSON.stringify(SLIDES0)));
  const [cur, setCur] = useS5(0);
  const [present, setPresent] = useS5(false);
  const s = slides[cur];
  const edit = (patch) => setSlides(sl => sl.map((x, i) => i === cur ? { ...x, ...patch } : x));
  const editBullet = (bi, txt) => setSlides(sl => sl.map((x, i) => i === cur ? { ...x, bullets: x.bullets.map((b, j) => j === bi ? txt : b) } : x));
  const addSlide = () => { setSlides(sl => { const n = [...sl]; n.splice(cur + 1, 0, { bg: "#ffffff", dark: true, title: "Nueva diapositiva", bullets: ["Punto uno", "Punto dos"] }); return n; }); setCur(c => c + 1); };

  const Slide = ({ s, scale, live }) => (
    <div style={{ width: "100%", height: "100%", background: s.bg, color: s.dark ? "#1b1f24" : "#fff",
      display: "flex", flexDirection: "column", justifyContent: "center", padding: `${5 * scale}%`, position: "relative" }}>
      {s.kicker && <div style={{ fontSize: `${1.6 * scale}vw`, fontWeight: 700, letterSpacing: ".12em", opacity: .75, marginBottom: `${1.2 * scale}vw` }}>{s.kicker}</div>}
      <div contentEditable={live} suppressContentEditableWarning onBlur={live ? e => edit({ title: e.target.textContent }) : undefined}
        style={{ fontSize: `${4.2 * scale}vw`, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.05, outline: "none" }}>{s.title}</div>
      {s.sub && <div contentEditable={live} suppressContentEditableWarning onBlur={live ? e => edit({ sub: e.target.textContent }) : undefined}
        style={{ fontSize: `${2.2 * scale}vw`, opacity: .8, marginTop: `${1.2 * scale}vw`, outline: "none" }}>{s.sub}</div>}
      {s.bullets && <ul style={{ fontSize: `${2.2 * scale}vw`, lineHeight: 1.7, marginTop: `${2 * scale}vw`, paddingLeft: `${3 * scale}vw` }}>
        {s.bullets.map((b, i) => <li key={i} contentEditable={live} suppressContentEditableWarning onBlur={live ? e => editBullet(i, e.target.textContent) : undefined}
          style={{ marginBottom: `${0.8 * scale}vw`, outline: "none" }}>{b}</li>)}</ul>}
      {s.dark && <div style={{ position: "absolute", left: `${5 * scale}%`, bottom: `${5 * scale}%`, width: `${8 * scale}vw`, height: `${0.5 * scale}vw`, background: "var(--accent)" }} />}
    </div>
  );
  if (present) return (
    <div className="app" style={{ background: "#000", position: "relative" }} onClick={() => setCur(c => (c + 1) % slides.length)}>
      <div style={{ flex: 1, aspectRatio: "16/9", margin: "auto", maxWidth: "100%", maxHeight: "100%" }}><Slide s={s} scale={1} /></div>
      <button className="tb-btn icon" style={{ position: "absolute", top: 12, right: 12, zIndex: 5, background: "rgba(255,255,255,.15)", color: "#fff", border: "none" }}
        onClick={e => { e.stopPropagation(); setPresent(false); }}><Ic name="close_fullscreen" /></button>
    </div>
  );
  return (
    <div className="app">
      <div className="app-side" style={{ width: 168, flexBasis: 168, background: "var(--surface-3)" }}>
        {slides.map((sl, i) => (
          <div key={i} onClick={() => setCur(i)}
            style={{ display: "flex", gap: 8, marginBottom: 10, cursor: "pointer", alignItems: "flex-start" }}>
            <span className="faint" style={{ fontSize: 11, width: 14, paddingTop: 14 }}>{i + 1}</span>
            <div style={{ flex: 1, aspectRatio: "16/9", borderRadius: 5, overflow: "hidden",
              outline: cur === i ? "2.5px solid var(--accent)" : "1px solid var(--border)" }}>
              <Slide s={sl} scale={0.5} />
            </div>
          </div>
        ))}
      </div>
      <div className="app-main">
        <Toolbar>
          <span className="office-badge p" style={{ marginRight: 2 }}>P</span>
          <span className="tb-title" style={{ fontSize: 13.5 }}>{file || "Tendencias de marca.pptx"}</span>
          <div className="tb-spacer" />
          <button className="tb-btn" onClick={addSlide}><Ic name="add" /> Diapositiva</button>
          <button className="tb-btn" onClick={() => window.open(OFFICE_WEB.powerpoint.ms, "_blank", "noopener")}><Ic name="open_in_new" /> Web</button>
          <button className="tb-btn primary" onClick={() => setPresent(true)}><Ic name="play_arrow" /> Presentar</button>
        </Toolbar>
        <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--surface-2)", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 600, aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <Slide s={s} scale={0.62} live />
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
  const launchable = APPS.filter(a => a.id !== "launchpad" && a.id !== "web" && a.name.toLowerCase().includes(q.toLowerCase()));
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
                <Tile icon={a.icon} color={a.color} size={62} /><span>{a.name}</span>
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
function TrashApp({ trash = [], trashApi }) {
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar>
        <span className="office-badge" style={{ background: "#7d8590", width: 22, height: 22, marginRight: 4 }}><Ic name="delete" size={14} /></span>
        <span className="tb-title">Papelera</span>
        <span className="faint" style={{ fontSize: 12, marginLeft: 8 }}>{trash.length} elemento(s)</span>
        <div className="tb-spacer" />
        <button className="tb-btn" disabled={!trash.length} style={{ opacity: trash.length ? 1 : .4 }} onClick={() => trashApi.empty()}><Ic name="delete_sweep" /> Vaciar papelera</button>
      </Toolbar>
      <div className="scroll" style={{ flex: 1, padding: 16, background: "var(--surface-2)" }}>
        {trash.length ? (
          <div className="file-grid" style={{ padding: 0 }}>
            {trash.map(it => (
              <div key={it.id} className="file-cell trash-cell">
                <div className="ic"><FileGlyph type={it.type} css={it.css} src={it.src} size={46} /></div>
                <div className="fname">{it.name}</div>
                <div className="trash-actions">
                  <button className="tb-btn icon" title="Restaurar" onClick={() => trashApi.restore(it.id)}><Ic name="restore_from_trash" size={18} /></button>
                  <button className="tb-btn icon" title="Eliminar definitivamente" onClick={() => trashApi.del(it.id)}><Ic name="delete_forever" size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState icon="delete_outline" text="La papelera está vacía" />}
      </div>
    </div>
  );
}

export { DocsApp, SlidesApp, LaunchpadApp, WebViewApp, TrashApp };