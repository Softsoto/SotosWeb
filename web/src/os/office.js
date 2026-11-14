/* ============================================================
   Sotos OS — conversores de formatos (Word, Excel, PowerPoint, PDF, CSV)
   © 2026 Sebastian Sotomontes
   Las librerías pesadas se cargan bajo demanda (import dinámico).
   ============================================================ */
import { makeEvaluator, parseRef, refName, isErr } from "./formula.js";

/* =================== Word (.docx) =================== */
export async function docxToHtml(blob) {
  const mammoth = await import("mammoth");
  const res = await (mammoth.default || mammoth).convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
  return res.value || "<p></p>";
}

export async function htmlToDocx(html, title = "Documento") {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun } = d;
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
  const HEAD = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4 };
  const colorOf = (el) => { const c = el.style?.color || el.getAttribute?.("color"); if (!c) return undefined; const m = /^#([0-9a-f]{6})$/i.exec(c); if (m) return m[1]; const r = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return r ? [1, 2, 3].map(i => (+r[i]).toString(16).padStart(2, "0")).join("") : undefined; };
  const fontOf = (el) => (el.style?.fontFamily || el.getAttribute?.("face") || "").split(",")[0].replace(/["']/g, "").trim() || undefined;

  const runs = (node, fmt = {}) => {
    const out = [];
    node.childNodes.forEach(ch => {
      if (ch.nodeType === 3) { if (ch.textContent) out.push(new TextRun({ text: ch.textContent.replace(/\s+/g, " "), ...fmt })); return; }
      if (ch.nodeType !== 1) return;
      const t = ch.tagName; const f = { ...fmt };
      if (t === "B" || t === "STRONG" || /bold|[6-9]00/.test(ch.style.fontWeight)) f.bold = true;
      if (t === "I" || t === "EM" || ch.style.fontStyle === "italic") f.italics = true;
      if (t === "U" || /underline/.test(ch.style.textDecoration)) f.underline = {};
      if (t === "S" || t === "STRIKE" || t === "DEL" || /line-through/.test(ch.style.textDecoration)) f.strike = true;
      if (t === "SUP") f.superScript = true; if (t === "SUB") f.subScript = true;
      const col = colorOf(ch); if (col) f.color = col;
      const font = fontOf(ch); if (font) f.font = font;
      if (t === "BR") { out.push(new TextRun({ text: "", break: 1, ...fmt })); return; }
      if (t === "IMG") { const img = imageRun(ch); if (img) out.push(img); return; }
      out.push(...runs(ch, f));
    });
    return out;
  };
  const imageRun = (img) => {
    const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(img.getAttribute("src") || ""); if (!m) return null;
    const bin = atob(m[2]); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const w = Math.min(560, +img.getAttribute("width") || img.naturalWidth || 400), h = +img.getAttribute("height") || Math.round(w * 0.66);
    return new ImageRun({ data, type: m[1].toLowerCase().replace("jpeg", "jpg"), transformation: { width: w, height: h } });
  };
  const alignOf = (el) => ALIGN[(el.style?.textAlign || el.getAttribute?.("align") || "").toLowerCase()];

  const blocks = [];
  const block = (el, listCtx) => {
    if (el.nodeType === 3) { if (el.textContent.trim()) blocks.push(new Paragraph({ children: [new TextRun(el.textContent)] })); return; }
    if (el.nodeType !== 1) return;
    const t = el.tagName;
    if (HEAD[t]) return blocks.push(new Paragraph({ heading: HEAD[t], alignment: alignOf(el), children: runs(el) }));
    if (t === "UL" || t === "OL") { el.childNodes.forEach(li => li.nodeType === 1 && block(li, { ordered: t === "OL", level: (listCtx?.level ?? -1) + 1 })); return; }
    if (t === "LI") {
      const inner = [...el.childNodes].filter(c => !(c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")));
      const frag = document.createElement("span"); inner.forEach(c => frag.appendChild(c.cloneNode(true)));
      const lvl = Math.min(listCtx?.level ?? 0, 4);
      blocks.push(new Paragraph(listCtx?.ordered ? { numbering: { reference: "sotos-num", level: lvl }, children: runs(frag) } : { bullet: { level: lvl }, children: runs(frag) }));
      el.querySelectorAll(":scope > ul, :scope > ol").forEach(sub => block(sub, listCtx));
      return;
    }
    if (t === "TABLE") {
      const rows = [...el.querySelectorAll("tr")].map(tr => new TableRow({ children: [...tr.children].map(td => new TableCell({ children: [new Paragraph({ children: runs(td, td.tagName === "TH" ? { bold: true } : {}) })] })) }));
      if (rows.length) blocks.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      return;
    }
    if (t === "BLOCKQUOTE") return blocks.push(new Paragraph({ indent: { left: 720 }, children: runs(el, { italics: true }) }));
    if (t === "HR") return blocks.push(new Paragraph({ border: { bottom: { color: "999999", style: "single", size: 6, space: 1 } }, children: [] }));
    if (t === "DIV" || t === "SECTION" || t === "ARTICLE") { const hasBlocks = [...el.children].some(c => /^(P|H\d|UL|OL|TABLE|DIV|BLOCKQUOTE)$/.test(c.tagName)); if (hasBlocks) { el.childNodes.forEach(c => block(c)); return; } }
    blocks.push(new Paragraph({ alignment: alignOf(el), children: runs(el) }));
  };
  dom.childNodes.forEach(c => block(c));
  if (!blocks.length) blocks.push(new Paragraph({ children: [] }));

  const doc = new Document({
    creator: "Sotos OS", title, description: "Creado con Sotos OS · © 2026 Sebastian Sotomontes",
    styles: { default: { document: { run: { font: "Calibri", size: 23 } } } },
    numbering: { config: [{ reference: "sotos-num", levels: [0, 1, 2, 3, 4].map(level => ({ level, format: "decimal", text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) }] },
    sections: [{ children: blocks }],
  });
  return Packer.toBlob(doc);
}

/* =================== Hojas (.xlsx / .csv) =================== */
// modelo: { sheets: [{ name, cells: {A1:"raw"}, fmt: {A1:{b:true, align:"right"}}, widths: {A: 120} }] }
export async function xlsxToBook(blob) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer());
  const sheets = [];
  wb.eachSheet(ws => {
    const cells = {}, fmt = {}, widths = {};
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      const ref = cell.address.replace(/\$/g, "");
      let raw;
      const v = cell.value;
      if (v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)) raw = "=" + (v.formula || cell.formula || "");
      else if (v && typeof v === "object" && v.richText) raw = v.richText.map(r => r.text).join("");
      else if (v && typeof v === "object" && v.text != null) raw = String(v.text);
      else if (v instanceof Date) raw = v.toLocaleDateString("es-ES");
      else if (v && typeof v === "object" && "error" in v) raw = v.error;
      else raw = v == null ? "" : String(v);
      if (raw !== "") cells[ref] = raw;
      const f = {}; if (cell.font?.bold) f.b = true; if (cell.font?.italic) f.i = true;
      if (cell.alignment?.horizontal) f.align = cell.alignment.horizontal;
      if (Object.keys(f).length) fmt[ref] = f;
    }));
    ws.columns?.forEach((col, i) => { if (col.width) widths[refName(i, 0).replace(/\d+/, "")] = Math.round(col.width * 7.5); });
    sheets.push({ name: ws.name, cells, fmt, widths });
  });
  return { sheets: sheets.length ? sheets : [{ name: "Hoja1", cells: {}, fmt: {}, widths: {} }] };
}

export async function bookToXlsx(book) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "Sotos OS · Sebastian Sotomontes"; wb.created = new Date();
  for (const sh of book.sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31) || "Hoja");
    const ev = makeEvaluator(sh.cells);
    for (const [ref, raw] of Object.entries(sh.cells)) {
      if (!parseRef(ref)) continue;
      const cell = ws.getCell(ref);
      if (typeof raw === "string" && raw[0] === "=") { const r = ev.value(ref); cell.value = { formula: raw.slice(1), result: isErr(r) ? undefined : r }; }
      else { const s = String(raw).trim(); cell.value = s !== "" && !isNaN(Number(s)) ? Number(s) : raw; }
      const f = sh.fmt?.[ref]; if (f) { if (f.b || f.i) cell.font = { bold: !!f.b, italic: !!f.i }; if (f.align) cell.alignment = { horizontal: f.align }; }
    }
    Object.entries(sh.widths || {}).forEach(([col, px]) => { ws.getColumn(col).width = Math.max(4, Math.round(px / 7.5)); });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function csvToBook(text) {
  const sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const cells = {}; let r = 0, c = 0, cur = "", q = false;
  const push = () => { if (cur !== "") cells[refName(c, r)] = cur; cur = ""; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { push(); c++; } else if (ch === "\n") { push(); r++; c = 0; } else if (ch !== "\r") cur += ch;
  }
  push();
  return { sheets: [{ name: "Hoja1", cells, fmt: {}, widths: {} }] };
}
export function bookToCsv(book) {
  const sh = book.sheets[0]; const ev = makeEvaluator(sh.cells);
  let maxR = -1, maxC = -1; Object.keys(sh.cells).forEach(k => { const p = parseRef(k); if (p) { maxR = Math.max(maxR, p.r); maxC = Math.max(maxC, p.c); } });
  const rows = [];
  for (let r = 0; r <= maxR; r++) {
    const row = []; for (let c = 0; c <= maxC; c++) { let v = ev.value(refName(c, r)); v = isErr(v) ? v.code : v == null ? "" : String(v); row.push(/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v); }
    rows.push(row.join(","));
  }
  return rows.join("\r\n");
}

/* =================== Presentaciones (.pptx) =================== */
// modelo: [{ bg, dark, kicker, title, sub, bullets: [] }]
const firstColor = (bg) => (/#([0-9a-f]{6})/i.exec(bg || "") || [, "FFFFFF"])[1].toUpperCase();
export async function slidesToPptx(slides, title = "Presentación") {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.author = "Sotos OS"; pptx.company = "Sebastian Sotomontes"; pptx.title = title;
  for (const s of slides) {
    const sl = pptx.addSlide(); sl.background = { color: firstColor(s.bg) };
    const ink = s.dark ? "1B1F24" : "FFFFFF";
    let y = s.bullets ? 0.6 : 2.2;
    if (s.kicker) { sl.addText(s.kicker, { x: 0.7, y, w: 11.9, h: 0.5, fontSize: 14, bold: true, color: ink, charSpacing: 3 }); y += 0.6; }
    sl.addText(s.title || "", { x: 0.7, y, w: 11.9, h: 1.2, fontSize: 40, bold: true, color: ink }); y += 1.3;
    if (s.sub) sl.addText(s.sub, { x: 0.7, y, w: 11.9, h: 0.8, fontSize: 22, color: ink });
    if (s.bullets?.length) sl.addText(s.bullets.map(b => ({ text: b, options: { bullet: true } })), { x: 0.9, y: s.sub ? y + 0.9 : y, w: 11.5, h: 4.2, fontSize: 22, color: ink, valign: "top", paraSpaceAfter: 10 });
  }
  const blob = await pptx.write({ outputType: "blob" });
  // incrustar el modelo de Sotos para reabrir sin pérdida
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(blob);
  zip.file("sotos/slides.json", JSON.stringify({ v: 1, slides }));
  const ct = await zip.file("[Content_Types].xml").async("string");
  if (!/Extension="json"/.test(ct)) zip.file("[Content_Types].xml", ct.replace("<Types ", "<Types ").replace(/(<Types[^>]*>)/, `$1<Default Extension="json" ContentType="application/json"/>`));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}
export async function pptxToSlides(blob) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const own = zip.file("sotos/slides.json");
  if (own) { try { const d = JSON.parse(await own.async("string")); if (Array.isArray(d.slides)) return d.slides; } catch {} }
  const files = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]);
  const slides = [];
  for (const f of files) {
    const xml = new DOMParser().parseFromString(await zip.file(f).async("string"), "application/xml");
    const paras = [...xml.getElementsByTagName("a:p")].map(p => [...p.getElementsByTagName("a:t")].map(t => t.textContent).join("")).filter(t => t.trim());
    const bgClr = xml.getElementsByTagName("p:bg")[0]?.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val");
    const dark = !bgClr || parseInt(bgClr.slice(0, 2), 16) + parseInt(bgClr.slice(2, 4), 16) + parseInt(bgClr.slice(4, 6), 16) > 380;
    slides.push({ bg: "#" + (bgClr || "ffffff"), dark, title: paras[0] || "", bullets: paras.slice(1) });
  }
  return slides.length ? slides : [{ bg: "#ffffff", dark: true, title: "Presentación vacía", bullets: [] }];
}

/* =================== PDF mínimo (texto) =================== */
// Genera un PDF real (Helvetica, WinAnsi) con título y párrafos; usado por los archivos de ejemplo.
export function textPdf(title, paragraphs) {
  const W = 595, H = 842, M = 64, LH = 15, maxChars = 88;
  const enc = (s) => { let out = ""; for (const ch of s) { const c = ch.charCodeAt(0); out += c < 256 ? (ch === "(" || ch === ")" || ch === "\\" ? "\\" + ch : ch) : "?"; } return out; };
  const wrap = (s) => { const lines = []; let cur = ""; for (const w of s.split(/\s+/)) { if ((cur + " " + w).trim().length > maxChars) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); } if (cur) lines.push(cur); return lines; };
  const items = [{ t: title, size: 20, bold: true }, { t: "", size: 8 }];
  paragraphs.forEach(p => { wrap(p).forEach(l => items.push({ t: l, size: 11 })); items.push({ t: "", size: 6 }); });
  const pages = []; let cur = [], y = H - M;
  for (const it of items) { const h = it.size === 20 ? 26 : it.t ? LH : it.size; if (y - h < M) { pages.push(cur); cur = []; y = H - M; } cur.push({ ...it, y: y - (it.size === 20 ? 20 : 11) }); y -= h; }
  if (cur.length) pages.push(cur);
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const kids = [];
  pages.forEach((pg, i) => {
    const pid = 5 + i * 2, cid = pid + 1; kids.push(`${pid} 0 R`);
    const stream = pg.filter(l => l.t).map(l => `BT /${l.bold ? "F2" : "F1"} ${l.size} Tf ${M} ${l.y} Td (${enc(l.t)}) Tj ET`).join("\n")
      + `\nBT /F1 8 Tf ${M} 30 Td (${enc("Sotos OS - (c) 2026 Sebastian Sotomontes   |   pagina " + (i + 1) + " de " + pages.length)}) Tj ET`;
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`;
    objs[cid] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const offs = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Producer (Sotos OS) /Author (Sebastian Sotomontes) >> >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return new Blob([bytes], { type: "application/pdf" });
}

/* =================== imprimir / PDF de un documento =================== */
// iframe aislado: sin allow-scripts, el contenido del documento nunca ejecuta código
export function printHtml(html, title) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  f.setAttribute("sandbox", "allow-same-origin allow-modals");
  f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${String(title).replace(/</g, "&lt;")}</title><style>body{font:12pt/1.6 Georgia,serif;margin:2cm;color:#111}h1{font-size:22pt}h2{font-size:16pt}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}</style></head><body>${sanitizeHtml(html)}</body></html>`;
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 2000); } };
  document.body.appendChild(f);
}

/* =================== sanitizar HTML de documentos =================== */
const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "SUB", "SUP", "SPAN", "FONT", "DIV",
  "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "A", "IMG", "PRE", "CODE"]);
const ATTRS = new Set(["style", "href", "src", "alt", "width", "height", "colspan", "rowspan", "align", "color", "face", "size"]);
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const clean = (el) => {
    [...el.children].forEach(ch => {
      if (!ALLOWED.has(ch.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|BASE|FORM|INPUT|BUTTON|TEXTAREA|SELECT|SVG|MATH|TEMPLATE)$/.test(ch.tagName)) ch.remove(); else { clean(ch); ch.replaceWith(...ch.childNodes); } return; }
      [...ch.attributes].forEach(a => {
        const n = a.name.toLowerCase(), v = a.value.trim();
        if (!ATTRS.has(n)) ch.removeAttribute(a.name);
        else if ((n === "href" || n === "src") && !/^(https?:|data:image\/(png|jpe?g|gif|webp|bmp);|#|mailto:)/i.test(v)) ch.removeAttribute(a.name);
        else if (n === "style" && /expression|url\s*\(|javascript:/i.test(v)) ch.removeAttribute(a.name);
      });
      if (ch.tagName === "A") { ch.setAttribute("target", "_blank"); ch.setAttribute("rel", "noopener noreferrer"); }
      clean(ch);
    });
  };
  clean(doc.body);
  return doc.body.innerHTML;
}
