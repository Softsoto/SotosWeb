/* ============================================================
   Sotos — apps creativas: Diagramas (draw.io), Pizarra (Excalidraw),
   Código (Monaco) y Paint (propio). Todas guardan en tus archivos y
   funcionan también como invitado.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Toolbar, EmptyState, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs, fmtDate } from "./vfs.js";
import { NodeGlyph } from "./files-ui.jsx";
import { useAutosave } from "./apps1.jsx";
const { useState, useEffect, useRef, useCallback } = React;

const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
const docsFolder = () => vfs.resolve("/Documentos") || vfs.getState().root;
async function newFile(name, content, openItem, folder = docsFolder()) {
  const id = await vfs.create(folder.id, vfs.uniqueName(folder, name), content);
  openItem(vfs.node(id)); return id;
}
/** lista de archivos de un tipo con botón de nuevo (cuando la app se abre sin archivo) */
function Picker({ title, types, icon, onNew, newLabel, openItem }) {
  useVfs(s => s.rev);
  const list = vfs.allOfType(types).sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 60);
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar><span className="tb-title">{title}</span><div className="tb-spacer" /><button className="tb-btn primary" onClick={onNew}><Ic name="add" /> {newLabel}</button></Toolbar>
      <div className="scroll" style={{ flex: 1 }}>
        <div className="file-list">{list.map(x => (
          <div key={x.id} className="file-row" onClick={() => openItem(x)} style={{ gridTemplateColumns: "1fr 140px" }}>
            <span className="fl-name"><NodeGlyph node={x} size={20} /><div className="fname">{x.name}</div></span><span>{fmtDate(x.mtime)}</span>
          </div>))}</div>
        {!list.length && <EmptyState icon={icon} text={`Aún no hay archivos. Crea uno con «${newLabel}».`} />}
      </div>
    </div>
  );
}

/* ---------------- Diagramas: draw.io en modo incrustado ----------------
   El diagrama viaja entre ventanas por postMessage; draw.io no lo guarda en sus servidores. */
// draw.io propio del servidor (DRAWIO_URL) o, si no hay, el público de diagrams.net
const PUBLIC_DRAWIO = "https://embed.diagrams.net";
let drawioBase = window.__SOTOS__?.drawio || null;
const drawioReady = drawioBase ? Promise.resolve(drawioBase) : fetch("/api/client-config").then(r => r.ok ? r.json() : {}).then(c => (drawioBase = c.drawio || PUBLIC_DRAWIO)).catch(() => (drawioBase = PUBLIC_DRAWIO));
const EMPTY_DRAWIO = '<mxfile><diagram name="Página-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
export function DiagramsApp({ fileId, openItem }) {
  const frame = useRef(null), xmlRef = useRef(null);
  const [state, setState] = useState("Cargando…"), [base, setBase] = useState(drawioBase);
  useEffect(() => { if (!base) drawioReady.then(setBase); }, []);
  const DRAWIO = base ? new URL(base).origin : null;
  useEffect(() => {
    if (!fileId || !DRAWIO) return;
    let alive = true; vfs.readText(fileId).then(t => { xmlRef.current = t || EMPTY_DRAWIO; }).catch(() => { xmlRef.current = EMPTY_DRAWIO; });
    const post = (m) => frame.current?.contentWindow?.postMessage(JSON.stringify(m), DRAWIO);
    const on = async (e) => {
      if (e.origin !== DRAWIO || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.event === "init") { for (let i = 0; i < 40 && xmlRef.current == null; i++) await new Promise(r => setTimeout(r, 50)); post({ action: "load", xml: xmlRef.current, autosave: 1, title: vfs.node(fileId)?.name }); setState("Listo"); }
      if ((m.event === "autosave" || m.event === "save") && typeof m.xml === "string") {
        xmlRef.current = m.xml; await vfs.write(fileId, m.xml); if (!alive) return;
        setState("Guardado " + new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }));
        if (m.event === "save") post({ action: "status", message: "Guardado en Sotos", modified: false });
      }
    };
    window.addEventListener("message", on); return () => { alive = false; window.removeEventListener("message", on); };
  }, [fileId, DRAWIO]);
  if (!fileId) return <Picker title="Diagramas" types={["drawio"]} icon="account_tree" newLabel="Nuevo diagrama" openItem={openItem} onNew={() => newFile("Diagrama.drawio", EMPTY_DRAWIO, openItem)} />;
  if (!base) return <div className="app"><EmptyState icon="hourglass_empty" text="Abriendo Diagramas…" /></div>;
  const own = base !== PUBLIC_DRAWIO;
  const src = `${base}/?embed=1&proto=json&spin=1&ui=${isDark() ? "dark" : "kennedy"}&lang=es&noExitBtn=1&saveAndExit=0&libraries=1`;
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <div className="proxy-bar"><Ic name="account_tree" size={14} /> Diagramas con draw.io (Apache 2.0){own ? ", alojado en tu servidor" : ""}. Se guarda solo en tu archivo de Sotos · <b>{state}</b></div>
      <iframe ref={frame} title="draw.io" src={src} className="cr-frame" />
    </div>
  );
}

/* ---------------- Pizarra: Excalidraw (MIT) ---------------- */
let exPromise = null;
const loadExcalidraw = () => exPromise ||= Promise.all([import("@excalidraw/excalidraw"), import("@excalidraw/excalidraw/index.css")]).then(([m]) => m);
const EMPTY_EX = JSON.stringify({ type: "excalidraw", version: 2, source: "sotos", elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} });
export function WhiteboardApp({ fileId, openItem }) {
  const [mod, setMod] = useState(null), [initial, setInitial] = useState(null), [settled, setSettled] = useState(false);
  // la ventana se abre con una animación de escala: Excalidraw se monta cuando ya terminó, para medir su tamaño real
  useEffect(() => { setSettled(false); const t = setTimeout(() => setSettled(true), 450); return () => clearTimeout(t); }, [fileId]);
  const api = useRef(null);
  const latest = useRef(null), box = useRef(null);
  // Excalidraw mide su contenedor al montarse (durante la animación de apertura de la ventana):
  // se le pide medir de nuevo al terminar y cada vez que cambia de tamaño
  useEffect(() => { if (!box.current) return; const kick = () => { api.current?.refresh?.(); window.dispatchEvent(new Event("resize")); }; const t = setTimeout(kick, 450);
    const ro = new ResizeObserver(kick); ro.observe(box.current); return () => { clearTimeout(t); ro.disconnect(); }; }, [mod, initial, settled]);
  const { status, touch } = useAutosave(() => latest.current ? vfs.write(fileId, latest.current) : Promise.resolve(), 1500);
  useEffect(() => { if (fileId) loadExcalidraw().then(setMod).catch(e => toast("No se pudo cargar la pizarra: " + e.message, { error: true })); }, [fileId]);
  useEffect(() => { if (!fileId) return; setInitial(null); vfs.readText(fileId).then(t => { let d = {}; try { d = JSON.parse(t || EMPTY_EX); } catch {} setInitial({ elements: d.elements || [], appState: { ...(d.appState || {}), collaborators: new Map() }, files: d.files || {} }); }); }, [fileId]);
  const onChange = useCallback((elements, appState, files) => {
    if (!mod) return; const json = mod.serializeAsJSON(elements, appState, files, "local");
    if (json !== latest.current) { const first = latest.current == null; latest.current = json; if (!first) touch(); }
  }, [mod, touch]);
  if (!fileId) return <Picker title="Pizarra" types={["excalidraw"]} icon="draw" newLabel="Nueva pizarra" openItem={openItem} onNew={() => newFile("Pizarra.excalidraw", EMPTY_EX, openItem)} />;
  if (!mod || !initial || !settled) return <div className="app"><EmptyState icon="hourglass_empty" text="Abriendo la pizarra…" /></div>;
  const { Excalidraw } = mod;
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <div className="proxy-bar"><Ic name="draw" size={14} /> Pizarra con Excalidraw (MIT) · {status === "saving" ? "Guardando…" : status === "dirty" ? "Cambios sin guardar" : "Guardado en tus archivos"}</div>
      <div className="cr-ex" ref={box}><Excalidraw excalidrawAPI={a => { api.current = a; }} initialData={initial} onChange={onChange} langCode="es-ES" theme={isDark() ? "dark" : "light"} UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }} /></div>
    </div>
  );
}

/* ---------------- Código: Monaco (MIT) ---------------- */
const LANG = { js: "javascript", mjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", json: "json", html: "html", htm: "html", css: "css", scss: "scss", less: "less",
  md: "markdown", xml: "xml", svg: "xml", yml: "yaml", yaml: "yaml", py: "python", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp", go: "go", rs: "rust", php: "php",
  rb: "ruby", sh: "shell", ps1: "powershell", sql: "sql", kt: "kotlin", swift: "swift", lua: "lua", ini: "ini", txt: "plaintext" };
let monacoPromise = null;
export function CodeApp({ fileId, openItem, openApp }) {
  useVfs(s => s.rev);
  const host = useRef(null), ed = useRef(null), textRef = useRef("");
  const [ready, setReady] = useState(false), [wrap, setWrap] = useState(false), [pos, setPos] = useState("");
  const n = fileId ? vfs.node(fileId) : null; const ext = n ? vfs.extOf(n.name) : "";
  const { status, touch, flush } = useAutosave(() => vfs.write(fileId, textRef.current), 1000);
  useEffect(() => {
    if (!fileId) return; let alive = true, editor;
    (async () => {
      const [{ default: monaco }, text] = await Promise.all([monacoPromise ||= import("./monaco-setup.js"), vfs.readText(fileId).catch(() => "")]);
      if (!alive || !host.current) return; textRef.current = text;
      editor = monaco.editor.create(host.current, { value: text, language: LANG[ext] || "plaintext", theme: isDark() ? "sotos-oscuro" : "sotos-claro", automaticLayout: true,
        fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 13.5, minimap: { enabled: true }, wordWrap: "off", tabSize: 2, smoothScrolling: true, renderWhitespace: "selection" });
      ed.current = editor; setReady(true);
      editor.onDidChangeModelContent(() => { textRef.current = editor.getValue(); touch(); });
      editor.onDidChangeCursorPosition(e => setPos(`Línea ${e.position.lineNumber}, col. ${e.position.column}`));
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => flush());
    })().catch(e => toast("No se pudo abrir el editor: " + e.message, { error: true }));
    return () => { alive = false; flush(); editor?.dispose(); ed.current = null; setReady(false); };
  }, [fileId]);
  useEffect(() => { ed.current?.updateOptions({ wordWrap: wrap ? "on" : "off" }); }, [wrap]);
  if (!fileId) return <Picker title="Código" types={["code"]} icon="code" newLabel="Nuevo archivo" openItem={openItem} onNew={() => newFile("nuevo.js", "// Escribe tu código\n", openItem)} />;
  if (!n) return <EmptyState icon="error" text="El archivo ya no existe" />;
  // los demás archivos de código de la misma carpeta, para saltar entre ellos
  const parent = vfs.parentOf?.(fileId); const siblings = (parent?.children || []).filter(x => x.type === "code" || x.type === "txt").sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="app">
      {siblings.length > 1 && <div className="app-side cr-side">{siblings.map(x => <div key={x.id} className={"side-item" + (x.id === fileId ? " active" : "")} onClick={() => openItem(x)}><NodeGlyph node={x} size={16} /><span>{x.name}</span></div>)}</div>}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Toolbar><span className="tb-title">{n.name}</span><span className="faint" style={{ fontSize: 12 }}>{(LANG[ext] || "texto").replace("plaintext", "texto")}</span><div className="tb-spacer" />
          <span className="faint" style={{ fontSize: 12 }}>{pos}</span>
          <button className={"tb-btn" + (wrap ? " primary" : "")} title="Ajustar líneas largas" onClick={() => setWrap(w => !w)}><Ic name="wrap_text" /></button>
          {["md", "html", "htm"].includes(ext) && openApp && <button className="tb-btn" title="Vista previa en Notas" onClick={() => { flush(); openApp("editor", { fileId }); }}><Ic name="preview" /> Vista previa</button>}
          <span className="faint" style={{ fontSize: 12, minWidth: 90, textAlign: "right" }}>{status === "saving" ? "Guardando…" : status === "dirty" ? "Sin guardar" : "Guardado"}</span></Toolbar>
        <div ref={host} style={{ flex: 1, minHeight: 0 }}>{!ready && <EmptyState icon="hourglass_empty" text="Abriendo el editor…" />}</div>
      </div>
    </div>
  );
}

/* ---------------- Paint (propio) ---------------- */
const PALETTE = ["#1f1d1a", "#ffffff", "#7d8590", "#c4532f", "#e8a33d", "#c9902a", "#4f7a3a", "#1f7a78", "#2f5d8a", "#5a5689", "#7a3e6b", "#d46a8c", "#8a5a3b", "#9dc3e6"];
const TOOLS = [["brush", "brush", "Pincel"], ["eraser", "ink_eraser", "Borrador"], ["line", "horizontal_rule", "Línea"], ["rect", "rectangle", "Rectángulo"], ["ellipse", "circle", "Elipse"],
  ["fill", "format_color_fill", "Relleno"], ["text", "text_fields", "Texto"], ["pick", "colorize", "Cuentagotas"]];
function floodFill(ctx, x, y, hex) {
  const { width: w, height: h } = ctx.canvas; const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const i0 = (y * w + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
  if (t.every((v, k) => Math.abs(v - c[k]) < 3)) return;
  const same = (i) => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) < 48;
  const stack = [[x, y]];
  while (stack.length) {
    let [cx, cy] = stack.pop(); let i = (cy * w + cx) * 4;
    while (cx >= 0 && same(i)) { cx--; i -= 4; } cx++; i += 4; let up = false, down = false;
    while (cx < w && same(i)) {
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      if (cy > 0) { const u = i - w * 4; if (same(u)) { if (!up) { stack.push([cx, cy - 1]); up = true; } } else up = false; }
      if (cy < h - 1) { const b = i + w * 4; if (same(b)) { if (!down) { stack.push([cx, cy + 1]); down = true; } } else down = false; }
      cx++; i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
}
export function PaintApp({ fileId }) {
  useVfs(s => s.rev);
  const canvas = useRef(null), overlay = useRef(null), wrap = useRef(null);
  const [tool, setTool] = useState("brush"), [color, setColor] = useState("#1f1d1a"), [size, setSize] = useState(6), [filled, setFilled] = useState(false);
  const [zoom, setZoom] = useState(1), [dirty, setDirty] = useState(false), [name, setName] = useState("Dibujo.png"), [textAt, setTextAt] = useState(null);
  const hist = useRef({ list: [], i: -1 }), drag = useRef(null), fileRef = useRef(fileId);
  const ctx = () => canvas.current.getContext("2d", { willReadFrequently: true });
  const snap = () => { const h = hist.current; const img = ctx().getImageData(0, 0, canvas.current.width, canvas.current.height); h.list = h.list.slice(0, h.i + 1).concat([img]).slice(-30); h.i = h.list.length - 1; };
  const undo = () => { const h = hist.current; if (h.i > 0) { h.i--; ctx().putImageData(h.list[h.i], 0, 0); setDirty(true); } };
  const redo = () => { const h = hist.current; if (h.i < h.list.length - 1) { h.i++; ctx().putImageData(h.list[h.i], 0, 0); setDirty(true); } };
  const blank = (w = 1280, h = 800) => { const c = canvas.current; c.width = w; c.height = h; overlay.current.width = w; overlay.current.height = h; const x = ctx(); x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h); hist.current = { list: [], i: -1 }; snap(); fit(); };
  const fit = () => { const box = wrap.current?.getBoundingClientRect(); if (!box || !canvas.current) return; setZoom(Math.min(1, (box.width - 40) / canvas.current.width, (box.height - 40) / canvas.current.height)); };
  const loadBlob = (blob) => new Promise((res, rej) => { const url = URL.createObjectURL(blob); const im = new Image(); im.onload = () => { const c = canvas.current; c.width = im.naturalWidth; c.height = im.naturalHeight; overlay.current.width = c.width; overlay.current.height = c.height; const x = ctx(); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0); URL.revokeObjectURL(url); hist.current = { list: [], i: -1 }; snap(); fit(); res(); }; im.onerror = () => rej(new Error("No es una imagen válida")); im.src = url; });
  useEffect(() => {
    fileRef.current = fileId;
    if (fileId && vfs.node(fileId)) { setName(vfs.node(fileId).name); vfs.read(fileId).then(loadBlob).catch(e => { toast(e.message, { error: true }); blank(); }); }
    else blank();
  }, [fileId]);
  useEffect(() => { const r = () => fit(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);
  // pegar una imagen del portapapeles
  useEffect(() => { const p = (e) => { if (!wrap.current?.closest(".window")?.classList.contains("focused") && !wrap.current?.matches(":hover")) return; const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/")); if (it) { e.preventDefault(); const im = new Image(); const url = URL.createObjectURL(it.getAsFile()); im.onload = () => { ctx().drawImage(im, 0, 0); URL.revokeObjectURL(url); snap(); setDirty(true); }; im.src = url; } }; document.addEventListener("paste", p); return () => document.removeEventListener("paste", p); }, []);
  const pt = (e) => { const r = canvas.current.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / zoom), Math.round((e.clientY - r.top) / zoom)]; };
  const style = (x) => { x.strokeStyle = color; x.fillStyle = color; x.lineWidth = size; x.lineCap = "round"; x.lineJoin = "round"; };
  const shape = (x, a, b) => { style(x); x.beginPath();
    if (tool === "line") { x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    if (tool === "rect") { const r = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; filled ? x.fillRect(...r) : x.strokeRect(...r); }
    if (tool === "ellipse") { x.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2); filled ? x.fill() : x.stroke(); } };
  const down = (e) => {
    if (e.button !== 0) return; const p = pt(e); const x = ctx();
    if (tool === "fill") { floodFill(x, Math.max(0, Math.min(p[0], canvas.current.width - 1)), Math.max(0, Math.min(p[1], canvas.current.height - 1)), color); snap(); setDirty(true); return; }
    if (tool === "pick") { const d = x.getImageData(p[0], p[1], 1, 1).data; setColor("#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join("")); setTool("brush"); return; }
    if (tool === "text") { setTextAt({ x: p[0], y: p[1], value: "" }); return; }
    e.currentTarget.setPointerCapture(e.pointerId); drag.current = { start: p, last: p };
    if (tool === "brush" || tool === "eraser") { style(x); if (tool === "eraser") x.strokeStyle = "#ffffff"; x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[0] + .01, p[1]); x.stroke(); }
  };
  const move = (e) => {
    if (!drag.current) return; const p = pt(e), x = ctx();
    if (tool === "brush" || tool === "eraser") { style(x); if (tool === "eraser") x.strokeStyle = "#ffffff"; x.beginPath(); x.moveTo(...drag.current.last); x.lineTo(...p); x.stroke(); drag.current.last = p; }
    else { const o = overlay.current.getContext("2d"); o.clearRect(0, 0, o.canvas.width, o.canvas.height); shape(o, drag.current.start, p); }
  };
  const up = (e) => {
    if (!drag.current) return; const p = pt(e);
    if (!["brush", "eraser"].includes(tool)) { const o = overlay.current.getContext("2d"); o.clearRect(0, 0, o.canvas.width, o.canvas.height); shape(ctx(), drag.current.start, p); }
    drag.current = null; snap(); setDirty(true);
  };
  const commitText = () => { if (textAt?.value.trim()) { const x = ctx(); x.fillStyle = color; x.textBaseline = "top"; x.font = `${Math.max(12, size * 4)}px Onest, system-ui, sans-serif`; textAt.value.split("\n").forEach((l, i) => x.fillText(l, textAt.x, textAt.y + i * Math.max(12, size * 4) * 1.25)); snap(); setDirty(true); } setTextAt(null); };
  const toBlob = () => new Promise(r => canvas.current.toBlob(r, "image/png"));
  const save = async (asNew = false) => {
    const blob = await toBlob(); const cur = fileRef.current && vfs.node(fileRef.current);
    if (cur && !asNew && vfs.extOf(cur.name) === "png") { await vfs.write(cur.id, blob); }
    else { const dir = vfs.resolve("/Imágenes") || vfs.getState().root; const base = (cur ? cur.name.replace(/\.[^.]+$/, "") : name.replace(/\.png$/i, "")) + ".png"; const id = await vfs.create(dir.id, vfs.uniqueName(dir, base), blob); fileRef.current = id; setName(vfs.node(id).name); toast(`Guardado en Imágenes como “${vfs.node(id).name}”`, { icon: "save" }); }
    setDirty(false);
  };
  useEffect(() => { const k = (e) => { if (!wrap.current?.isConnected || !wrap.current.closest(".window")?.contains(document.activeElement) && !wrap.current.matches(":hover")) return; if (e.target.closest?.("input,textarea")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); });
  const cursor = { brush: "crosshair", eraser: "cell", line: "crosshair", rect: "crosshair", ellipse: "crosshair", fill: "copy", text: "text", pick: "crosshair" }[tool];
  return (
    <div className="app paint-app" style={{ flexDirection: "column" }}>
      <Toolbar>
        <button className="tb-btn" onClick={() => { const x = ctx(); x.fillStyle = "#ffffff"; x.fillRect(0, 0, canvas.current.width, canvas.current.height); snap(); fileRef.current = null; setName("Dibujo.png"); setDirty(false); toast("Lienzo nuevo (Ctrl+Z recupera el anterior)", { icon: "note_add" }); }} title="Lienzo nuevo"><Ic name="note_add" /></button>
        <button className="tb-btn" onClick={() => save()} title="Guardar (Ctrl+S)"><Ic name="save" /> Guardar</button>
        <button className="tb-btn" onClick={() => save(true)} title="Guardar una copia en Imágenes"><Ic name="save_as" /></button>
        <span className="tb-sep" />
        <button className="tb-btn icon" onClick={undo} title="Deshacer (Ctrl+Z)"><Ic name="undo" /></button>
        <button className="tb-btn icon" onClick={redo} title="Rehacer (Ctrl+Y)"><Ic name="redo" /></button>
        <span className="tb-sep" />
        <button className="tb-btn icon" onClick={() => setZoom(z => Math.max(.1, +(z / 1.25).toFixed(2)))} title="Alejar"><Ic name="zoom_out" /></button>
        <span className="faint" style={{ fontSize: 12, width: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button className="tb-btn icon" onClick={() => setZoom(z => Math.min(8, +(z * 1.25).toFixed(2)))} title="Acercar"><Ic name="zoom_in" /></button>
        <button className="tb-btn icon" onClick={fit} title="Ajustar a la ventana"><Ic name="fit_screen" /></button>
        <div className="tb-spacer" /><span className="faint" style={{ fontSize: 12 }}>{name}{dirty ? " · sin guardar" : ""} · {canvas.current ? `${canvas.current.width}×${canvas.current.height}` : ""}</span>
      </Toolbar>
      <div className="paint-body">
        <div className="paint-tools">
          {TOOLS.map(([id, icon, label]) => <button key={id} className={"paint-tool" + (tool === id ? " on" : "")} title={label} onClick={() => setTool(id)}><Ic name={icon} size={20} /></button>)}
          <div className="paint-sep" />
          <label className="paint-size" title="Grosor"><input type="range" min="1" max="60" value={size} onChange={e => setSize(+e.target.value)} /><span>{size}</span></label>
          {["rect", "ellipse"].includes(tool) && <button className={"paint-tool" + (filled ? " on" : "")} title="Figura rellena" onClick={() => setFilled(f => !f)}><Ic name="format_color_fill" size={18} /></button>}
          <div className="paint-sep" />
          <div className="paint-colors">{PALETTE.map(c => <button key={c} className={"paint-swatch" + (color === c ? " on" : "")} style={{ background: c }} title={c} onClick={() => setColor(c)} />)}</div>
          <label className="paint-custom" title="Otro color"><input type="color" value={color} onChange={e => setColor(e.target.value)} /><span style={{ background: color }} /></label>
        </div>
        <div className="paint-stage" ref={wrap}>
          <div className="paint-sheet" style={{ width: (canvas.current?.width || 1280) * zoom, height: (canvas.current?.height || 800) * zoom }}>
            <canvas ref={canvas} style={{ width: "100%", height: "100%", cursor }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
            <canvas ref={overlay} className="paint-overlay" />
            {textAt && <textarea className="paint-text" autoFocus value={textAt.value} style={{ left: textAt.x * zoom, top: textAt.y * zoom, color, fontSize: Math.max(12, size * 4) * zoom }}
              onChange={e => setTextAt(t => ({ ...t, value: e.target.value }))} onBlur={commitText} onKeyDown={e => { if (e.key === "Escape") setTextAt(null); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
