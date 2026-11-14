/* ============================================================
   Sotos OS — proxy web del Navegador
   © 2026 Sebastian Sotomontes

   Sirve páginas externas bajo /px/<url-completa> desde un ORIGEN
   distinto al del escritorio (aislamiento: la página proxificada no
   puede leer la sesión ni el localStorage de Sotos).
   - quita X-Frame-Options / CSP / COOP / COEP para poder incrustarla
   - reescribe enlaces, formularios, redirecciones, url() en CSS
   - inyecta un cliente que parchea fetch/XHR/window.open/history
   - jar de cookies por visitante (cookie sotos_px_sid)
   - bloquea hosts privados (protección SSRF)
   ============================================================ */
import { lookup } from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";

const PREFIX = "/px/";
const MAX_BYTES = 40 * 1024 * 1024;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/* ---------------- SSRF guard ---------------- */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}
const hostCache = new Map();
async function hostAllowed(host) {
  if (hostCache.has(host)) return hostCache.get(host);
  let ok = false;
  try {
    if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) ok = false;
    else {
      const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
      ok = addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address));
    }
  } catch { ok = false; }
  hostCache.set(host, ok); setTimeout(() => hostCache.delete(host), 5 * 60_000);
  return ok;
}

/* ---------------- cookie jar ---------------- */
const jars = new Map(); // sid -> Map(domain -> Map(name -> {value, path, expires}))
function jarFor(sid) { if (!jars.has(sid)) jars.set(sid, new Map()); return jars.get(sid); }
function storeCookies(jar, url, setCookies) {
  for (const sc of setCookies) {
    const [pair, ...attrs] = sc.split(";");
    const eq = pair.indexOf("="); if (eq < 1) continue;
    const name = pair.slice(0, eq).trim(), value = pair.slice(eq + 1).trim();
    let domain = url.hostname, path = "/", expires = null;
    for (const a of attrs) {
      const [k, v = ""] = a.split("=").map(s => s.trim());
      const kl = k.toLowerCase();
      if (kl === "domain" && v) { const d = v.replace(/^\./, "").toLowerCase(); if (url.hostname === d || url.hostname.endsWith("." + d)) domain = d; }
      else if (kl === "path" && v) path = v;
      else if (kl === "max-age") expires = Date.now() + Number(v) * 1000;
      else if (kl === "expires" && !expires) { const t = Date.parse(v); if (!isNaN(t)) expires = t; }
    }
    if (!jar.has(domain)) jar.set(domain, new Map());
    if (expires !== null && expires <= Date.now()) jar.get(domain).delete(name);
    else jar.get(domain).set(name, { value, path, expires });
  }
}
function cookieHeader(jar, url) {
  const out = [];
  for (const [domain, m] of jar) {
    if (url.hostname !== domain && !url.hostname.endsWith("." + domain)) continue;
    for (const [name, c] of m) {
      if (c.expires && c.expires <= Date.now()) { m.delete(name); continue; }
      if (url.pathname.startsWith(c.path)) out.push(name + "=" + c.value);
    }
  }
  return out.join("; ");
}

/* ---------------- URL helpers ---------------- */
const SKIP = /^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i;
function prox(u, base) {
  if (!u) return u;
  const s = u.trim();
  if (SKIP.test(s) || s.startsWith(PREFIX)) return u;
  try { const abs = new URL(s, base); if (!/^https?:$/.test(abs.protocol)) return u; return PREFIX + abs.href; } catch { return u; }
}
const decodeEntities = (s) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/");

function rewriteCss(css, base) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => `url(${q}${prox(u, base)}${q})`)
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, u) => `@import ${q}${prox(u, base)}${q}`);
}

function rewriteHtml(html, base) {
  const attr = /(\s(?:href|src|action|formaction|poster|data-src|background))\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  html = html.replace(/<(a|link|script|img|iframe|frame|form|source|video|audio|embed|track|input|button|area|image|use|body|td|table)\b[^>]*>/gi, (tag) =>
    tag
      .replace(attr, (m, name, dq, sq) => {
        const v = dq ?? sq; const q = dq != null ? '"' : "'";
        return `${name}=${q}${prox(decodeEntities(v), base)}${q}`;
      })
      .replace(/\s(srcset|imagesrcset)\s*=\s*(["'])([^"']*)\2/gi, (m, name, q, v) =>
        ` ${name}=${q}${v.split(",").map(p => { const [u, ...d] = p.trim().split(/\s+/); return [prox(u, base), ...d].join(" "); }).join(", ")}${q}`)
      .replace(/\s(integrity|nonce)\s*=\s*(["'])[^"']*\2/gi, "")
      .replace(/\sstyle\s*=\s*(["'])([^"']*)\1/gi, (m, q, v) => ` style=${q}${rewriteCss(v, base)}${q}`)
  );
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, c) => a + rewriteCss(css, base) + c);
  // metas que estorban: CSP, referrer y refresh (este último se reescribe)
  html = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?(content-security-policy|x-frame-options)["']?[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name\s*=\s*["']?referrer["']?[^>]*>/gi, "");
  html = html.replace(/(<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]+content\s*=\s*["']\s*\d+\s*;\s*url=)([^"']+)/gi, (m, a, u) => a + prox(u, base));
  html = html.replace(/<base\b[^>]*>/gi, "");
  const inject = `<script>${clientScript(base)}</script>`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, m => m + inject);
  else html = inject + html;
  return html;
}

/* cliente inyectado: corre dentro de la página proxificada */
function clientScript(base) {
  return `(function(){
var P=${JSON.stringify(PREFIX)},B=${JSON.stringify(base)};
function px(u){try{if(u==null)return u;u=String(u);if(/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(u)||u.indexOf(P)===0)return u;var a=new URL(u,B);if(!/^https?:$/.test(a.protocol))return u;if(a.origin===location.origin&&a.pathname.indexOf(P)===0)return a.pathname+a.search+a.hash;return P+a.href;}catch(e){return u}}
window.__sotosPx=px;
var F=window.fetch;if(F)window.fetch=function(i,o){try{if(typeof i==="string"||i instanceof URL)i=px(String(i));else if(i&&i.url)i=new Request(px(i.url),i);}catch(e){}return F.call(this,i,o)};
var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=px(u);return XO.apply(this,arguments)};
var WO=window.open;window.open=function(u,t,f){return WO.call(window,px(u),"_self",f)};
["pushState","replaceState"].forEach(function(k){var o=history[k];history[k]=function(s,t,u){if(u!=null)u=px(u);var r=o.call(this,s,t,u);tell();return r}});
var SB=navigator.sendBeacon;if(SB)navigator.sendBeacon=function(u,d){return SB.call(navigator,px(u),d)};
if(window.Worker){var W=window.Worker;window.Worker=function(u,o){return new W(px(u),o)};}
var A=["href","src","action","poster","formaction"];
function fix(el){if(!el||el.nodeType!==1)return;for(var i=0;i<A.length;i++){var v=el.getAttribute&&el.getAttribute(A[i]);if(v&&v.indexOf(P)!==0&&!/^(data:|blob:|javascript:|#)/i.test(v)){var n=px(v);if(n!==v)el.setAttribute(A[i],n)}}if(el.target==="_blank"||el.target==="_top"||el.target==="_parent")el.target="_self";}
new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==="attributes")fix(m.target);else m.addedNodes.forEach(function(n){fix(n);if(n.querySelectorAll)n.querySelectorAll("[href],[src],[action],[target]").forEach(fix)})})}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:A.concat(["target"])});
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a)fix(a)},true);
document.addEventListener("submit",function(e){fix(e.target)},true);
function real(){try{var p=location.pathname;if(p.indexOf(P)===0)return p.slice(P.length)+location.search+location.hash}catch(e){}return B}
function tell(){try{parent.postMessage({type:"sotos-px",url:real(),title:document.title},"*")}catch(e){}}
addEventListener("DOMContentLoaded",tell);addEventListener("load",tell);addEventListener("hashchange",tell);
function realOf(u){try{var a=new URL(u,location.href);var i=a.href.indexOf(P);return i>=0&&a.origin===location.origin?a.href.slice(i+P.length):a.href}catch(e){return u}}
var lastEd=null;
document.addEventListener("contextmenu",function(e){if(e.shiftKey)return;e.preventDefault();var t=e.target,c=function(s){return t.closest?t.closest(s):null};
var a=c("a[href]"),im=c("img"),ed=c('input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),textarea,[contenteditable="true"],[contenteditable=""]');lastEd=ed;
var sel=String(getSelection()||"");if(ed&&ed.matches("input,textarea")){try{sel=ed.value.slice(ed.selectionStart,ed.selectionEnd)}catch(x){}}
parent.postMessage({type:"sotos-ctx",x:e.clientX,y:e.clientY,link:a&&/^https?:/i.test(realOf(a.href))?realOf(a.href):null,img:im?realOf(im.currentSrc||im.src):null,text:sel.slice(0,4000),editable:!!ed},"*")},true);
addEventListener("message",function(e){if(e.source!==parent||!e.data||e.data.type!=="sotos-cmd")return;var d=e.data;
if(lastEd&&lastEd.focus)lastEd.focus();
if(d.cmd==="selectAll"&&lastEd&&lastEd.select){lastEd.select();return}
if(["insertText","delete","selectAll","undo","redo","copy"].indexOf(d.cmd)>=0)document.execCommand(d.cmd,false,d.text==null?null:d.text)});
new MutationObserver(tell).observe(document.querySelector("title")||document.documentElement,{childList:true,subtree:!document.querySelector("title")?false:true});
})();`;
}

/* ---------------- request handler ---------------- */
const STRIP_RES = new Set(["x-frame-options", "content-security-policy", "content-security-policy-report-only",
  "cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy", "strict-transport-security",
  "content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie", "referrer-policy",
  "permissions-policy", "report-to", "nel", "alt-svc", "clear-site-data", "public-key-pins", "expect-ct", "keep-alive"]);

// HTTPS (o localhost, que el navegador trata como seguro): cookie de terceros permitida en el iframe.
// Por IP en HTTP: Lax, válido porque escritorio y proxy comparten host (mismo sitio).
const ckAttrs = (req) => { const host = String(req.headers.host || '').split(':')[0]; const https = !!req.socket.encrypted || (process.env.TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https'); return https || host === 'localhost' || host === '127.0.0.1' ? 'SameSite=None; Secure' : 'SameSite=Lax'; };
function sidOf(req, res) {
  const m = /(?:^|;\s*)sotos_px_sid=([a-f0-9]{32})/.exec(req.headers.cookie || "");
  if (m) return m[1];
  const sid = crypto.randomBytes(16).toString("hex");
  res.appendHeader("set-cookie", `sotos_px_sid=${sid}; Path=/; HttpOnly; ${ckAttrs(req)}`);
  return sid;
}
function lastOriginOf(req) {
  const ref = req.headers.referer || "";
  const i = ref.indexOf(PREFIX);
  if (i >= 0) { try { return new URL(decodeURIComponent(ref.slice(i + PREFIX.length))).origin; } catch {} try { return new URL(ref.slice(i + PREFIX.length)).origin; } catch {} }
  const m = /(?:^|;\s*)sotos_px_origin=([^;]+)/.exec(req.headers.cookie || "");
  return m ? decodeURIComponent(m[1]) : null;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > 20 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}
function errorPage(res, code, title, msg) {
  res.writeHead(code, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset=utf-8><body style="font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#333;background:#f4f5f7"><div style="text-align:center;max-width:420px"><h2 style="margin:0 0 8px">${title}</h2><p style="color:#666">${msg}</p></div>`);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function handleProxy(req, res) {
  let raw = req.url;
  // petición "huérfana" con ruta raíz (/static/x.js) => reubicar al último origen
  if (!raw.startsWith(PREFIX)) {
    const origin = lastOriginOf(req);
    if (!origin) return errorPage(res, 404, "Sin página", "Abre una dirección desde el Navegador de Sotos.");
    res.writeHead(307, { location: PREFIX + origin + raw }); return res.end();
  }
  raw = raw.slice(PREFIX.length);
  // los navegadores colapsan "https://" a "https:/" en algunos casos
  raw = raw.replace(/^(https?):\/(?!\/)/i, "$1://");
  if (/^https?%3A/i.test(raw)) raw = decodeURIComponent(raw);
  let target;
  try { target = new URL(raw); } catch { return errorPage(res, 400, "Dirección no válida", esc(raw)); }
  if (!/^https?:$/.test(target.protocol)) return errorPage(res, 400, "Protocolo no soportado", esc(target.protocol));
  if (!(await hostAllowed(target.hostname))) return errorPage(res, 403, "Destino bloqueado", "Por seguridad el Navegador no abre direcciones de redes privadas o locales.");

  const sid = sidOf(req, res);
  const jar = jarFor(sid);
  const headers = {
    "user-agent": UA,
    "accept": req.headers.accept || "*/*",
    "accept-language": req.headers["accept-language"] || "es-ES,es;q=0.9,en;q=0.8",
  };
  for (const h of ["content-type", "range", "if-none-match", "if-modified-since", "x-requested-with"]) if (req.headers[h]) headers[h] = req.headers[h];
  const ck = cookieHeader(jar, target); if (ck) headers.cookie = ck;
  const refOrigin = lastOriginOf(req); if (refOrigin) { headers.referer = refOrigin + "/"; if (req.method !== "GET") headers.origin = refOrigin; }

  let upstream;
  try {
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
    upstream = await fetch(target, { method: req.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    return errorPage(res, 502, "No se pudo abrir la página", esc(target.host) + " no respondió (" + esc(e.cause?.code || e.name) + ").");
  }

  const sc = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
  if (sc.length) storeCookies(jar, target, sc);

  const out = {};
  upstream.headers.forEach((v, k) => { if (!STRIP_RES.has(k)) out[k] = v; });
  out["cross-origin-resource-policy"] = "cross-origin";
  out["access-control-allow-origin"] = "*";

  if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get("location")) {
    out.location = prox(upstream.headers.get("location"), target.href);
    res.writeHead(upstream.status, out); return res.end();
  }

  const ct = (upstream.headers.get("content-type") || "").toLowerCase();
  const isHtml = ct.includes("text/html") || ct.includes("application/xhtml");
  const isCss = ct.includes("text/css");

  if (isHtml || isCss) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return errorPage(res, 413, "Página demasiado grande", "");
    const cs = /charset=([\w-]+)/.exec(ct)?.[1] || (isHtml && /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString("latin1"))?.[1]) || "utf-8";
    let text; try { text = new TextDecoder(cs).decode(buf); } catch { text = buf.toString("utf8"); }
    const final = upstream.url || target.href;
    text = isHtml ? rewriteHtml(text, final) : rewriteCss(text, final);
    out["content-type"] = (isHtml ? "text/html" : "text/css") + "; charset=utf-8";
    out["cache-control"] = "no-store";
    if (isHtml) res.appendHeader("set-cookie", `sotos_px_origin=${encodeURIComponent(new URL(final).origin)}; Path=/; ${ckAttrs(req)}`);
    res.writeHead(upstream.status, out);
    return res.end(req.method === "HEAD" ? undefined : text);
  }

  // binarios / JS / JSON: stream directo con límite
  res.writeHead(upstream.status, out);
  if (!upstream.body || req.method === "HEAD") return res.end();
  let n = 0;
  try {
    for await (const chunk of upstream.body) {
      n += chunk.length; if (n > MAX_BYTES * 5) break;
      if (!res.write(chunk)) await new Promise(r => res.once("drain", r));
    }
  } catch {}
  res.end();
}
