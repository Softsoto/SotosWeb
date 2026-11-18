/* ============================================================
   Sotos — idioma de la interfaz (español / English)
   La interfaz está escrita en español. En inglés, un diccionario traduce lo que se ve
   en pantalla (también lo que aparece después) y las fechas y números pasan a formato inglés.
   Nunca se traduce lo que escribe la gente: correos, chats, documentos, notas, campos de texto.
   © 2026 Sebastian Sotomontes
   ============================================================ */
const KEY = "sotos_lang";
export const LANGS = [["es", "Español"], ["en", "English"]];
export function getLang() {
  try { const v = localStorage.getItem(KEY); if (v === "es" || v === "en") return v; } catch {}
  return /^es\b/i.test(navigator.language || "es") ? "es" : "en";
}
export function setLang(l) { try { localStorage.setItem(KEY, l); } catch {} location.reload(); }

// zonas con contenido de las personas: no se tocan
const SKIP = "textarea, input, [contenteditable], .no-translate, .mail-body, .mail-html, .chat-msg, .wa-bubble, .wall-text, .post-body, .comment-text, .note-body, .code-editor, .monaco-editor, .excalidraw, .terminal, .term-out, .file-name-user, iframe, script, style, code, pre";
let dict = null, tmpls = [];
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

function translate(raw) {
  const s = raw.replace(/\s+/g, " ").trim(); if (!s || s.length < 2) return null;
  const hit = dict.get(s); if (hit !== undefined) return raw.replace(s.length === raw.length ? raw : raw.trim(), hit);
  for (const [re, en] of tmpls) { const m = re.exec(s); if (m) return raw.replace(raw.trim(), en.replace(/\{(\d+)\}/g, (_, i) => m[+i + 1] ?? "")); }
  return null;
}
const done = new WeakSet();
function visitText(n) {
  if (done.has(n)) return; const p = n.parentElement; if (!p || p.closest(SKIP)) return;
  const t = translate(n.nodeValue); if (t != null && t !== n.nodeValue) { done.add(n); n.nodeValue = t; }
}
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
function visitEl(el) {
  if (el.closest?.(SKIP) && !el.matches?.("input, textarea")) return;
  for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const t = translate(v); if (t != null && t !== v) el.setAttribute(a, t); } }
}
function walk(root) {
  if (root.nodeType === 3) return visitText(root);
  if (root.nodeType !== 1) return;
  visitEl(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? visitText(n) : visitEl(n);
}

/** fechas y números en formato inglés aunque el código pida "es" */
function englishFormats() {
  const fix = (l) => (typeof l === "string" && /^es\b/i.test(l)) || l === undefined ? "en-US" : Array.isArray(l) ? l.map(x => /^es\b/i.test(x) ? "en-US" : x) : l;
  for (const [obj, fns] of [[Date.prototype, ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]], [Number.prototype, ["toLocaleString"]]])
    for (const f of fns) { const orig = obj[f]; obj[f] = function (l, o) { return orig.call(this, fix(l), o); }; }
  const DTF = Intl.DateTimeFormat; Intl.DateTimeFormat = function (l, o) { return new DTF(fix(l), o); }; Intl.DateTimeFormat.prototype = DTF.prototype; Intl.DateTimeFormat.supportedLocalesOf = DTF.supportedLocalesOf;
  const NF = Intl.NumberFormat; Intl.NumberFormat = function (l, o) { return new NF(fix(l), o); }; Intl.NumberFormat.prototype = NF.prototype; Intl.NumberFormat.supportedLocalesOf = NF.supportedLocalesOf;
  const RTF = Intl.RelativeTimeFormat; if (RTF) { Intl.RelativeTimeFormat = function (l, o) { return new RTF(fix(l), o); }; Intl.RelativeTimeFormat.prototype = RTF.prototype; }
}

/** se llama antes de pintar la interfaz */
export async function startI18n() {
  const lang = getLang(); document.documentElement.lang = lang;
  if (lang === "es") return;
  englishFormats();
  const { default: en } = await import("./i18n/en.json");
  dict = new Map(Object.entries(en.textos));
  tmpls = Object.entries(en.plantillas).map(([es, tr]) => [new RegExp("^" + esc(es).replace(/\\\{(\d+)\\\}|\{(\d+)\}/g, "(.+?)") + "$"), tr]);
  // traducción en vivo de todo lo que aparece o cambia
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") { done.delete(m.target); visitText(m.target); }
      else if (m.type === "attributes") visitEl(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  });
  const go = () => { walk(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); };
  if (document.body) go(); else addEventListener("DOMContentLoaded", go);
  const t = document.title; if (dict.has(t)) document.title = dict.get(t);
}
