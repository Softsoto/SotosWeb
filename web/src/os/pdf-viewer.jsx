/* ============================================================
   Sotos — visor de PDF propio (pdf.js)
   © 2026 Sebastian Sotomontes

   Miniaturas, páginas que se dibujan solo al verse, texto
   seleccionable, zoom (ajustar al ancho / a la página), rotación,
   búsqueda dentro del documento, imprimir, descargar y pantalla completa.
   ============================================================ */
import React from "react";
import "pdfjs-dist/web/pdf_viewer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Ic, EmptyState, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { fmtSize } from "./vfs.js";
const { useState, useEffect, useRef, useCallback } = React;

let pdfjsP = null;
const loadPdfjs = () => pdfjsP || (pdfjsP = import("pdfjs-dist").then(m => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; }));

/* una página: canvas + capa de texto, dibujada cuando entra en pantalla */
function PdfPage({ doc, num, size, scale, rotation, pdfjs, query, active, onVisible, registerRef }) {
  const box = useRef(null), canvasRef = useRef(null), textRef = useRef(null), qRef = useRef(query);
  qRef.current = query;
  // las primeras páginas se dibujan de una vez; el resto cuando se acercan (y se quedan dibujadas)
  const [visible, setVisible] = useState(num <= 2);
  const rot = (size.rotate + rotation) % 360, swap = rot % 180 !== 0;
  const w = (swap ? size.h : size.w) * scale, h = (swap ? size.w : size.h) * scale;
  useEffect(() => { registerRef(num, box.current); }, [num]);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); if (e.intersectionRatio > 0.5) onVisible(num); }, { rootMargin: "600px 0px", threshold: [0, 0.5] });
    io.observe(box.current); return () => io.disconnect();
  }, [num]);
  useEffect(() => {
    if (!visible) return;
    let task = null, textLayer = null, cancelled = false;
    (async () => {
      const page = await doc.getPage(num); if (cancelled) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale, rotation: rot });
      // un canvas nuevo por dibujo: pdf.js no admite dos render() sobre el mismo canvas mientras el anterior se cancela
      const c = document.createElement("canvas"); c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
      c.style.width = vp.width + "px"; c.style.height = vp.height + "px";
      task = page.render({ canvas: c, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try { await task.promise; } catch (e) { if (e?.name !== "RenderingCancelledException") console.warn("[pdf] página", num, e); return; }
      if (cancelled || !canvasRef.current) return;
      canvasRef.current.replaceChildren(c);
      const tl = textRef.current; tl.innerHTML = "";
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp });
      await textLayer.render().catch(() => {});
      mark(tl, qRef.current);
    })();
    return () => { cancelled = true; try { task?.cancel(); } catch {} try { textLayer?.cancel(); } catch {} };
  }, [visible, scale, rot, doc]);
  useEffect(() => { if (textRef.current) mark(textRef.current, query); }, [query]);
  return (
    <div ref={box} className={"pdf-page" + (active ? " active" : "")} style={{ width: w, height: h, "--scale-factor": scale, "--total-scale-factor": scale, "--user-unit": 1 }} data-page={num}>
      {visible ? <><div ref={canvasRef} className="pdf-canvas" /><div ref={textRef} className="textLayer" /></> : <div className="pdf-page-ph">{num}</div>}
    </div>
  );
}
function mark(layer, q) {
  layer.querySelectorAll("span").forEach(s => { s.classList.toggle("pdf-hit", !!q && s.textContent.toLowerCase().includes(q.toLowerCase())); });
}

function Thumb({ doc, num, size, rotation, active, onClick }) {
  const ref = useRef(null), box = useRef(null);
  const [vis, setVis] = useState(num <= 8);
  useEffect(() => { const io = new IntersectionObserver(([e]) => e.isIntersecting && setVis(true), { rootMargin: "300px" }); io.observe(box.current); return () => io.disconnect(); }, []);
  useEffect(() => {
    if (!vis) return; let task = null, dead = false;
    doc.getPage(num).then(p => {
      if (dead) return; const rot = (size.rotate + rotation) % 360;
      const vp0 = p.getViewport({ scale: 1, rotation: rot }); const vp = p.getViewport({ scale: 240 / vp0.width, rotation: rot });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      task = p.render({ canvas: c, viewport: vp });
      task.promise.then(() => { if (!dead && ref.current) ref.current.replaceChildren(c); }).catch(e => { if (e?.name !== "RenderingCancelledException") console.warn("[pdf] miniatura", num, e); });
    });
    return () => { dead = true; try { task?.cancel(); } catch {} };
  }, [vis, rotation]);
  const rot = (size.rotate + rotation) % 360, ratio = rot % 180 ? size.w / size.h : size.h / size.w;
  return (
    <div ref={box} className={"pdf-thumb" + (active ? " on" : "")} onClick={onClick}>
      <div className="pdf-thumb-img" style={{ height: 120 * ratio }} ref={ref} />
      <span>{num}</span>
    </div>
  );
}

export function PdfViewer({ fileId }) {
  const n = vfs.useVfs(() => vfs.node(fileId));
  const [doc, setDoc] = useState(null), [err, setErr] = useState(null), [pdfjs, setPdfjs] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [mode, setMode] = useState("width");           // width | page | custom
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(1);
  const [thumbs, setThumbs] = useState(true);
  const [q, setQ] = useState(""), [hits, setHits] = useState(null), [hitIdx, setHitIdx] = useState(0);
  const scroller = useRef(null), root = useRef(null), refs = useRef({}), texts = useRef(null), blobRef = useRef(null);

  useEffect(() => {
    let dead = false, loaded = null;
    setDoc(null); setErr(null); setSizes([]); setHits(null); texts.current = null;
    (async () => {
      try {
        const lib = await loadPdfjs();
        const blob = await vfs.read(fileId); blobRef.current = blob;
        const d = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
        loaded = d; if (dead) return d.destroy();
        const s = [];
        for (let i = 1; i <= d.numPages; i++) { const p = await d.getPage(i); const v = p.getViewport({ scale: 1 }); s.push({ w: v.width, h: v.height, rotate: p.rotate % 360 }); }
        if (dead) return;
        setPdfjs(lib); setSizes(s); setDoc(d); setPage(1);
      } catch (e) { if (!dead) setErr(e?.name === "PasswordException" ? "Este PDF está protegido con contraseña." : "No se pudo abrir el PDF: " + (e?.message || e)); }
    })();
    return () => { dead = true; loaded?.destroy?.(); };
  }, [fileId]);

  // escala según el modo y el tamaño del área
  const fit = useCallback(() => {
    if (!sizes.length || !scroller.current) return;
    const s = sizes[Math.max(0, page - 1)] || sizes[0]; const rot = (s.rotate + rotation) % 180;
    const pw = rot ? s.h : s.w, ph = rot ? s.w : s.h;
    const W = scroller.current.clientWidth - 48, H = scroller.current.clientHeight - 32;
    if (mode === "width") setScale(Math.max(0.25, Math.min(4, W / pw)));
    if (mode === "page") setScale(Math.max(0.25, Math.min(4, Math.min(W / pw, H / ph))));
  }, [sizes, mode, rotation, page]);
  useEffect(() => { fit(); }, [sizes, mode, rotation]);
  useEffect(() => { const ro = new ResizeObserver(() => fit()); if (scroller.current) ro.observe(scroller.current); return () => ro.disconnect(); }, [fit]);

  const goTo = (p) => { const k = Math.max(1, Math.min(sizes.length, p)); refs.current[k]?.scrollIntoView({ block: "start" }); setPage(k); };
  const zoom = (f) => { setMode("custom"); setScale(s => Math.max(0.25, Math.min(5, Math.round(s * f * 100) / 100))); };

  const search = async (query) => {
    setQ(query); if (!query.trim() || !doc) { setHits(null); return; }
    if (!texts.current) { texts.current = []; for (let i = 1; i <= doc.numPages; i++) { const t = await (await doc.getPage(i)).getTextContent(); texts.current.push(t.items.map(it => it.str).join(" ").toLowerCase()); } }
    const ql = query.toLowerCase(); const found = [];
    texts.current.forEach((t, i) => { let k = t.indexOf(ql); while (k >= 0) { found.push(i + 1); k = t.indexOf(ql, k + ql.length); } });
    setHits(found); setHitIdx(0); if (found.length) goTo(found[0]);
  };
  const nextHit = (d) => { if (!hits?.length) return; const i = (hitIdx + d + hits.length) % hits.length; setHitIdx(i); goTo(hits[i]); };
  const print = async () => {
    const url = URL.createObjectURL(blobRef.current);
    const f = document.createElement("iframe"); f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0"; f.src = url;
    f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, "_blank", "noopener"); } setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60_000); };
    document.body.appendChild(f);
  };
  const onKey = (e) => {
    if (e.target.closest("input")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); root.current.querySelector(".pdf-search input")?.focus(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoom(1.2); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); zoom(1 / 1.2); }
    else if (e.key === "PageDown" || e.key === "ArrowRight") { e.preventDefault(); goTo(page + 1); }
    else if (e.key === "PageUp" || e.key === "ArrowLeft") { e.preventDefault(); goTo(page - 1); }
    else if (e.key === "Home") goTo(1); else if (e.key === "End") goTo(sizes.length);
  };

  if (!n) return <EmptyState icon="error" text="El archivo ya no existe" />;
  return (
    <div className="app pdf-app" ref={root} tabIndex={-1} onKeyDown={onKey}>
      <div className="pdf-bar">
        <button className={"tb-btn icon" + (thumbs ? " on" : "")} title="Miniaturas" onClick={() => setThumbs(t => !t)}><Ic name="view_sidebar" /></button>
        <span className="office-badge pdf">PDF</span>
        <span className="tb-title pdf-name" title={n.name}>{n.name}</span>
        <div className="pdf-nav">
          <button className="tb-btn icon" title="Página anterior" onClick={() => goTo(page - 1)} disabled={page <= 1}><Ic name="keyboard_arrow_up" /></button>
          <input value={page} onChange={e => setPage(+e.target.value || 1)} onKeyDown={e => e.key === "Enter" && goTo(page)} onBlur={() => goTo(page)} /> <span className="faint">/ {sizes.length || "—"}</span>
          <button className="tb-btn icon" title="Página siguiente" onClick={() => goTo(page + 1)} disabled={page >= sizes.length}><Ic name="keyboard_arrow_down" /></button>
        </div>
        <div className="tb-spacer" />
        <button className="tb-btn icon" title="Alejar (Ctrl -)" onClick={() => zoom(1 / 1.2)}><Ic name="zoom_out" /></button>
        <span className="pdf-zoom">{Math.round(scale * 100)} %</span>
        <button className="tb-btn icon" title="Acercar (Ctrl +)" onClick={() => zoom(1.2)}><Ic name="zoom_in" /></button>
        <button className={"tb-btn icon" + (mode === "width" ? " on" : "")} title="Ajustar al ancho" onClick={() => setMode("width")}><Ic name="fit_page_width" /></button>
        <button className={"tb-btn icon" + (mode === "page" ? " on" : "")} title="Página completa" onClick={() => setMode("page")}><Ic name="fit_screen" /></button>
        <button className="tb-btn icon" title="Girar" onClick={() => setRotation(r => (r + 90) % 360)}><Ic name="rotate_right" /></button>
        <div className="search-box pdf-search"><Ic name="search" size={16} />
          <input placeholder="Buscar en el PDF" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") hits && q ? nextHit(e.shiftKey ? -1 : 1) : search(q); if (e.key === "Escape") search(""); }} onBlur={() => q && !hits && search(q)} />
          {hits && <span className="faint pdf-hits">{hits.length ? `${hitIdx + 1}/${hits.length}` : "0"}</span>}
          {hits?.length > 0 && <><Ic name="expand_less" size={16} style={{ cursor: "pointer" }} onClick={() => nextHit(-1)} /><Ic name="expand_more" size={16} style={{ cursor: "pointer" }} onClick={() => nextHit(1)} /></>}
        </div>
        <button className="tb-btn icon" title="Imprimir" onClick={print} disabled={!doc}><Ic name="print" /></button>
        <button className="tb-btn icon" title="Descargar" onClick={() => vfs.download(fileId)}><Ic name="download" /></button>
        <button className="tb-btn icon" title="Pantalla completa" onClick={() => document.fullscreenElement ? document.exitFullscreen() : root.current.requestFullscreen?.()}><Ic name="fullscreen" /></button>
      </div>
      <div className="pdf-body">
        {thumbs && doc && <div className="pdf-thumbs scroll">{sizes.map((s, i) => <Thumb key={i} doc={doc} num={i + 1} size={s} rotation={rotation} active={page === i + 1} onClick={() => goTo(i + 1)} />)}</div>}
        <div className="pdf-scroll scroll" ref={scroller}>
          {err ? <EmptyState icon="picture_as_pdf" text={err} /> : !doc ? <EmptyState icon="hourglass_empty" text="Abriendo PDF…" /> :
            sizes.map((s, i) => <PdfPage key={i} doc={doc} num={i + 1} size={s} scale={scale} rotation={rotation} pdfjs={pdfjs} query={hits ? q : ""} active={hits?.length && hits[hitIdx] === i + 1}
              onVisible={(k) => setPage(k)} registerRef={(k, el) => { refs.current[k] = el; }} />)}
        </div>
      </div>
      <div className="files-status"><span>{sizes.length} página(s) · {fmtSize(n.size)}</span><div className="tb-spacer" /><span>Ctrl+F buscar · Ctrl +/− zoom · ←/→ páginas</span></div>
    </div>
  );
}
