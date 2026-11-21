/* ============================================================
   Sotos — Correo real (IMAP/SMTP vía el servidor de Sotos)
   El HTML de los mensajes se muestra en un marco aislado (sin scripts)
   y sin imágenes remotas hasta que lo pidas (evita los rastreadores).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { pickFiles } from "./filepicker.jsx";
import { Ic, Modal, EmptyState, toast } from "./ui.jsx";
import { api } from "./api.js";
import * as vfs from "./vfs.js";
import { fmtSize } from "./vfs.js";
import { PersonAvatar } from "./contacts.jsx";
const { useState, useEffect, useRef } = React;

const BOX_ICON = { inbox: "inbox", sent: "send", drafts: "draft", trash: "delete", junk: "report", archive: "archive" };
const nameOf = (s) => (s || "").replace(/<[^>]+>/, "").replace(/"/g, "").trim() || (s || "").replace(/[<>]/g, "");
const emailOf = (s) => (s || "").match(/<([^>]+)>/)?.[1] || (s || "").trim();
const when = (t) => { if (!t) return ""; const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: d.getFullYear() === n.getFullYear() ? undefined : "numeric" }); };

function Setup({ onDone, onCancel, current }) {
  const [presets, setPresets] = useState({}), [p, setP] = useState(current ? "otro" : "gmail");
  const [f, setF] = useState({ id: current?.id, email: current?.email || "", name: current?.name || "", password: "", imapHost: current?.imap_host || "", imapPort: current?.imap_port || 993, smtpHost: current?.smtp_host || "", smtpPort: current?.smtp_port || 465, smtpTls: current?.smtp_tls || "", username: current?.username || "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("GET", "mail/presets").then(r => setPresets(r.presets)).catch(() => {}); }, []);
  const save = async () => { setBusy(true); try { const r = await api("PUT", "mail/account", { ...f, preset: p === "otro" ? undefined : p, username: f.username || f.email }); toast(`${r.created ? "Cuenta conectada" : "Cuenta actualizada"} · ${r.boxes} carpetas`, { icon: "mark_email_read" }); onDone(r.id); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  return (
    <div className="mail-setup">
      <div className="mail-setup-card">
        <Ic name="alternate_email" size={40} style={{ color: "var(--accent)" }} />
        <h2>{current ? "Editar cuenta de correo" : onCancel ? "Añadir otra cuenta" : "Conecta tu correo"}</h2>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>Sotos lee y envía tu correo directamente con tu proveedor (IMAP y SMTP). La contraseña se guarda cifrada en tu servidor de Sotos y nunca vuelve al navegador.</div>
        <div className="mail-presets">{[...Object.entries(presets), ["otro", { label: "Otro" }]].map(([k, v]) => <button key={k} className={"chip" + (p === k ? " on" : "")} onClick={() => setP(k)}>{v.label}</button>)}</div>
        {presets[p]?.help && <div className="mail-help"><Ic name="info" size={16} /> {presets[p].help}</div>}
        <div style={{ display: "grid", gap: 10, width: "100%" }}>
          <label className="field">Tu nombre<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Como te verán al recibir tus correos" /></label>
          <label className="field">Correo<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="tu@correo.com" /></label>
          <label className="field">Contraseña {p !== "otro" ? "de aplicación" : ""}<input type="password" autoComplete="new-password" value={f.password} placeholder={current ? "Déjala vacía para conservar la guardada" : ""} onChange={e => setF({ ...f, password: e.target.value })} /></label>
          {p !== "otro" && <label className="field">Usuario para iniciar sesión<input value={f.username} onChange={e => setF({ ...f, username: e.target.value })} placeholder={presets[p]?.userHint ? `Si es distinto del correo: ${presets[p].userHint}` : "Déjalo vacío para usar tu correo"} /></label>}
          {p === "otro" && <div className="mail-server-grid">
            <label className="field">Servidor IMAP<input value={f.imapHost} onChange={e => setF({ ...f, imapHost: e.target.value })} placeholder="imap.ejemplo.com" /></label>
            <label className="field">Puerto<input type="number" value={f.imapPort} onChange={e => setF({ ...f, imapPort: e.target.value })} /></label>
            <label className="field">Servidor SMTP<input value={f.smtpHost} onChange={e => setF({ ...f, smtpHost: e.target.value })} placeholder="smtp.ejemplo.com" /></label>
            <label className="field">Puerto<input type="number" value={f.smtpPort} onChange={e => setF({ ...f, smtpPort: e.target.value })} /></label>
            <label className="field">Seguridad SMTP<select className="sc-input" style={{ margin: 0 }} value={f.smtpTls} onChange={e => setF({ ...f, smtpTls: e.target.value })}><option value="">Automática por puerto</option><option value="ssl">SSL/TLS</option><option value="starttls">STARTTLS</option></select></label>
            <label className="field">Usuario<input value={f.username} onChange={e => setF({ ...f, username: e.target.value })} placeholder="Normalmente tu correo" /></label>
          </div>}
        </div>
        <button className="tb-btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy || !f.email || (!f.password && !current)} onClick={save}>{busy ? "Comprobando…" : <><Ic name="link" /> {current ? "Guardar" : "Conectar"}</>}</button>
        {onCancel && <button className="tb-btn" style={{ width: "100%", justifyContent: "center" }} onClick={onCancel}>Cancelar</button>}
        {current && <button className="tb-btn" style={{ width: "100%", justifyContent: "center", color: "var(--danger, #b3261e)" }} onClick={async () => { try { await api("DELETE", `mail/account?acc=${current.id}`); toast(`Se desvinculó ${current.email}`, { icon: "link_off" }); onDone(null); } catch (e) { toast(e.message, { error: true }); } }}><Ic name="link_off" /> Desvincular esta cuenta</button>}
      </div>
    </div>
  );
}

/* ---------- correo en HTML: editor con formato, saneado y plantilla ---------- */
const OK_TAGS = new Set(["P", "DIV", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "FONT", "A", "UL", "OL", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "HR", "IMG", "TABLE", "TBODY", "THEAD", "TR", "TD", "TH", "SMALL", "SUB", "SUP", "CODE", "PRE"]);
const OK_ATTR = new Set(["href", "src", "alt", "title", "style", "color", "size", "face", "align", "width", "height", "colspan", "rowspan", "target"]);
/** deja solo etiquetas y atributos de formato; quita scripts, eventos y enlaces javascript: */
export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const walk = (el) => { for (const c of [...el.children]) {
    if (!OK_TAGS.has(c.tagName)) { if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"].includes(c.tagName)) c.remove(); else { walk(c); c.replaceWith(...c.childNodes); } continue; }
    for (const at of [...c.attributes]) { const v = at.value.trim().toLowerCase(); if (!OK_ATTR.has(at.name) || /^(javascript|vbscript|data:text)/.test(v) || (at.name === "style" && /expression|url\(\s*["']?\s*javascript/.test(v))) c.removeAttribute(at.name); }
    if (c.tagName === "A") { c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener"); }
    walk(c); } };
  walk(doc.body.firstChild); return doc.body.firstChild.innerHTML;
}
const wrapHtml = (body) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222222">${body}</div>`;
const esc = (t) => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const textToHtml = (t) => esc(t).replace(/\n/g, "<br>");
function RichEditor({ html, onChange, placeholder, minHeight = 220 }) {
  const ref = useRef(null), [link, setLink] = useState(null), [img, setImg] = useState(false);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html || ""; }, []);
  const cmd = (c, v = null) => { ref.current.focus(); document.execCommand(c, false, v); onChange(ref.current.innerHTML); };
  const B = ({ c, v, icon, title }) => <button type="button" className="re-btn" title={title} onMouseDown={e => { e.preventDefault(); cmd(c, v); }}><Ic name={icon} size={18} /></button>;
  const images = []; if (img) vfs.walk(n => { if (n.type === "img" && n.size > 0 && n.size < 2e6) images.push(n); });
  return (
    <div className="re">
      <div className="re-bar">
        <select className="re-sel" title="Estilo" onChange={e => { cmd("formatBlock", e.target.value); e.target.value = ""; }} defaultValue=""><option value="" disabled>Estilo</option><option value="P">Normal</option><option value="H1">Título</option><option value="H2">Subtítulo</option><option value="H3">Encabezado</option><option value="BLOCKQUOTE">Cita</option><option value="PRE">Código</option></select>
        <select className="re-sel" title="Tamaño" onChange={e => { cmd("fontSize", e.target.value); e.target.value = ""; }} defaultValue=""><option value="" disabled>Tamaño</option><option value="2">Pequeño</option><option value="3">Normal</option><option value="4">Grande</option><option value="6">Muy grande</option></select>
        <select className="re-sel" title="Letra" onChange={e => { cmd("fontName", e.target.value); e.target.value = ""; }} defaultValue=""><option value="" disabled>Letra</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Trebuchet MS">Trebuchet</option><option value="Courier New">Courier</option></select>
        <span className="re-sep" />
        <B c="bold" icon="format_bold" title="Negrita" /><B c="italic" icon="format_italic" title="Cursiva" /><B c="underline" icon="format_underlined" title="Subrayado" /><B c="strikeThrough" icon="strikethrough_s" title="Tachado" />
        <label className="re-btn re-color" title="Color del texto"><Ic name="format_color_text" size={18} /><input type="color" onChange={e => cmd("foreColor", e.target.value)} /></label>
        <label className="re-btn re-color" title="Resaltar"><Ic name="ink_highlighter" size={18} /><input type="color" defaultValue="#fff59d" onChange={e => cmd("hiliteColor", e.target.value)} /></label>
        <span className="re-sep" />
        <B c="justifyLeft" icon="format_align_left" title="Izquierda" /><B c="justifyCenter" icon="format_align_center" title="Centrar" /><B c="justifyRight" icon="format_align_right" title="Derecha" />
        <B c="insertUnorderedList" icon="format_list_bulleted" title="Viñetas" /><B c="insertOrderedList" icon="format_list_numbered" title="Numerada" />
        <span className="re-sep" />
        <button type="button" className="re-btn" title="Enlace" onMouseDown={e => { e.preventDefault(); const sel = window.getSelection(); setLink({ url: "https://", range: sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null }); }}><Ic name="link" size={18} /></button>
        <button type="button" className="re-btn" title="Imagen de tus archivos" onMouseDown={e => { e.preventDefault(); setImg(v => !v); }}><Ic name="image" size={18} /></button>
        <B c="insertHorizontalRule" icon="horizontal_rule" title="Línea" /><B c="removeFormat" icon="format_clear" title="Quitar formato" />
      </div>
      {link && <div className="re-pop"><input autoFocus value={link.url} onChange={e => setLink({ ...link, url: e.target.value })} onKeyDown={e => e.key === "Enter" && e.currentTarget.nextSibling.click()} />
        <button className="tb-btn primary" onClick={() => { if (link.range) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(link.range); } if (/^(https?:|mailto:)/i.test(link.url)) cmd(link.range && !link.range.collapsed ? "createLink" : "insertHTML", link.range && !link.range.collapsed ? link.url : `<a href="${esc(link.url)}">${esc(link.url)}</a>`); setLink(null); }}>Insertar</button>
        <button className="tb-btn" onClick={() => setLink(null)}>Cancelar</button></div>}
      {img && <div className="re-imgs">{images.slice(0, 60).map(n => <button key={n.id} title={n.name} onClick={async () => { const b = await vfs.read(n.id); const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); setImg(false); cmd("insertHTML", `<img src="${url}" alt="${esc(n.name)}" style="max-width:100%;height:auto">`); }}><Ic name="image" size={16} /> {n.name}</button>)}{!images.length && <span className="faint">No hay imágenes de menos de 2 MB en tus archivos.</span>}</div>}
      <div ref={ref} className="re-area" contentEditable suppressContentEditableWarning data-placeholder={placeholder} style={{ minHeight }}
        onInput={e => onChange(e.currentTarget.innerHTML)}
        onPaste={e => { const h = e.clipboardData.getData("text/html"); if (h) { e.preventDefault(); document.execCommand("insertHTML", false, cleanHtml(h)); onChange(e.currentTarget.innerHTML); } }} />
    </div>
  );
}

function Aliases({ account, onClose, onSaved }) {
  const [list, setList] = useState(account.aliases || []), [busy, setBusy] = useState(false);
  const [main, setMain] = useState(account.default_from || account.email.toLowerCase()), [sig, setSig] = useState(account.signature || "");
  const set = (i, k, v) => setList(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const save = async () => { setBusy(true); try {
    const clean = list.filter(x => x.email.trim()); await api("PUT", `mail/aliases?acc=${account.id}`, { aliases: clean });
    const valid = [account.email.toLowerCase(), ...clean.map(x => x.email.trim().toLowerCase())]; await api("PUT", `mail/prefs?acc=${account.id}`, { defaultFrom: valid.includes(main) ? (main === account.email.toLowerCase() ? "" : main) : "", signature: cleanHtml(sig) });
    toast("Alias, remitente y firma guardados", { icon: "alternate_email" }); onSaved(); } catch (e) { toast(e.message, { error: true }); setBusy(false); } };
  const Main = ({ email }) => <label className="alias-main" title="Remitente principal"><input type="radio" name="alias-main" checked={main === email.trim().toLowerCase()} onChange={() => setMain(email.trim().toLowerCase())} /> Principal</label>;
  return (
    <Modal title={`Alias, remitente y firma · ${account.email}`} icon="alternate_email" onClose={onClose} width={680}
      actions={<><button className="tb-btn" onClick={() => setList(l => [...l, { email: "", name: "" }])}><Ic name="add" /> Añadir alias</button><div style={{ flex: 1 }} /><button className="tb-btn" onClick={onClose}>Cancelar</button><button className="tb-btn primary" disabled={busy} onClick={save}>Guardar</button></>}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>Otras direcciones desde las que envías con esta misma cuenta: tu dominio propio en iCloud+, los alias de Outlook o las direcciones «Enviar como» de Gmail. El proveedor debe tenerlas autorizadas; si no, rechazará el envío. Al redactar eliges desde cuál sale el correo.</div>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="alias-row"><input value={account.email} disabled /><input value={account.name} disabled /><Main email={account.email} /><span style={{ width: 32 }} /></div>
        {list.map((x, i) => <div key={i} className="alias-row"><input type="email" placeholder="alias@tudominio.com" value={x.email} onChange={e => set(i, "email", e.target.value)} /><input placeholder={`Nombre (${account.name})`} value={x.name} onChange={e => set(i, "name", e.target.value)} />
          {x.email.trim() ? <Main email={x.email} /> : <span style={{ width: 78 }} />}<button className="tb-btn icon" title="Quitar" onClick={() => setList(l => l.filter((_, j) => j !== i))}><Ic name="delete" /></button></div>)}
        {!list.length && <div className="faint" style={{ fontSize: 13 }}>Aún no tienes alias.</div>}
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>El <b>principal</b> es el remitente que sale por defecto al redactar con esta cuenta.</div>
      <div className="admin-sub" style={{ marginTop: 14 }}>Firma (se añade al final de tus correos)</div>
      <RichEditor html={sig} onChange={setSig} placeholder="Tu nombre, cargo, teléfono, sitio web…" minHeight={90} />
    </Modal>
  );
}

function Compose({ init, onClose, onSent, account, accounts }) {
  const idents = accounts.flatMap(a => [{ acc: a.id, email: a.email, name: a.name }, ...(a.aliases || []).map(x => ({ acc: a.id, email: x.email, name: x.name || a.name }))]);
  const key = (x) => x.acc + "|" + x.email;
  // remitente por defecto: el principal de la cuenta (o el alias al que llegó el correo que respondes)
  const first = idents.find(x => x.acc === account.id && x.email.toLowerCase() === String(init?.from || account.default_from || account.email).toLowerCase()) || idents.find(x => x.acc === account.id) || idents[0];
  const sigOf = (acc) => accounts.find(a => a.id === acc)?.signature || "";
  const [f, setF] = useState({ to: "", cc: "", subject: "", ...init, ident: key(first) }), [att, setAtt] = useState([]), [busy, setBusy] = useState(false), [pick, setPick] = useState(false);
  // selector del sistema: de Sotos Drive o del equipo (lo del equipo se sube primero a la carpeta «Adjuntos»)
  const attachPick = async () => {
    const r = await pickFiles({ title: "Adjuntar archivos", multiple: true }); if (!r?.length) return;
    let nodes = r.filter(n => !(n instanceof File)); const local = r.filter(n => n instanceof File);
    if (local.length) { const root = vfs.getState().root; const dir = (root.children || []).find(c => c.type === "folder" && c.name === "Adjuntos")?.id || vfs.mkdir(vfs.ROOT, "Adjuntos");
      toast(`Subiendo ${local.length} archivo(s) a Adjuntos…`, { icon: "upload" }); const ids = await vfs.importFiles(dir, local); nodes = [...nodes, ...ids.map(vfs.node).filter(Boolean)]; }
    setAtt(a => [...a, ...nodes.filter(n => !a.some(x => x.id === n.id))]);
  };
  const [body, setBody] = useState(() => (init?.html || (init?.text ? textToHtml(init.text) : "<p><br></p>")) + (sigOf(first.acc) ? `<p><br></p><div class="sotos-firma">${sigOf(first.acc)}</div>` : ""));
  const send = async () => { setBusy(true); try { await vfs.flush?.().catch(() => {}); const who = idents.find(x => key(x) === f.ident) || first;
    const html = cleanHtml(body); const tmp = document.createElement("div"); tmp.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-3]|blockquote)>/gi, "\n");
    const text = (tmp.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    await api("POST", "mail/send", { to: f.to, cc: f.cc, subject: f.subject, inReplyTo: f.inReplyTo, text, html: wrapHtml(html), from: who.email, account: who.acc, attachments: att.map(n => n.id) }); toast("Correo enviado", { icon: "send" }); onSent(); } catch (e) { toast(e.message, { error: true }); setBusy(false); } };
  const files = []; vfs.walk(n => { if (!n.children && n.size > 0 && n.size < 20e6) files.push(n); });
  return (
    <Modal title={init?.subject ? f.subject : "Correo nuevo"} icon="edit" onClose={onClose} width={820}
      actions={<><button className="tb-btn" onClick={attachPick}><Ic name="attach_file" /> Adjuntar</button><div style={{ flex: 1 }} /><button className="tb-btn" onClick={onClose}>Descartar</button>
        <button className="tb-btn primary" disabled={busy || !f.to.trim()} onClick={send}><Ic name="send" /> {busy ? "Enviando…" : "Enviar"}</button></>}>
      <div className="mail-compose">
        {idents.length > 1 ? <label className="compose-row"><span>De</span><select className="compose-from" value={f.ident} onChange={e => setF({ ...f, ident: e.target.value })}>
          {idents.map(x => <option key={key(x)} value={key(x)}>{x.name} &lt;{x.email}&gt;</option>)}</select></label>
          : <div className="faint" style={{ fontSize: 12 }}>De: {account.name} &lt;{account.email}&gt;</div>}
        <label className="compose-row"><span>Para</span><input autoFocus value={f.to} onChange={e => setF({ ...f, to: e.target.value })} placeholder="correo@ejemplo.com, otro@ejemplo.com" /></label>
        <label className="compose-row"><span>Cc</span><input value={f.cc} onChange={e => setF({ ...f, cc: e.target.value })} /></label>
        <label className="compose-row"><span>Asunto</span><input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></label>
        <RichEditor html={body} onChange={setBody} placeholder="Escribe tu mensaje…" minHeight={260} />
        {att.length > 0 && <div className="compose-atts">{att.map(n => <span key={n.id} className="chip on" style={{ "--chip": "#5a5689" }}><Ic name="attach_file" size={14} /> {n.name} · {fmtSize(n.size)} <Ic name="close" size={14} style={{ cursor: "pointer" }} onClick={() => setAtt(a => a.filter(x => x.id !== n.id))} /></span>)}</div>}
        {pick && <div className="compose-pick">{files.slice(0, 200).map(n => <button key={n.id} onClick={() => { setAtt(a => a.some(x => x.id === n.id) ? a : [...a, n]); setPick(false); }}><Ic name="description" size={16} /> {n.name} <span className="faint">{fmtSize(n.size)}</span></button>)}</div>}
      </div>
    </Modal>
  );
}

function MessageView({ m, acc, onReply, onForward, onDelete, onFlag, flagged }) {
  const [remote, setRemote] = useState(false);
  const frame = useRef(null);
  const html = m.html ? `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:14px/1.55 system-ui,sans-serif;color:#222;margin:14px;word-break:break-word}img{max-width:100%;height:auto}</style>${remote ? m.html : m.html.replace(/(<img\b[^>]*?\s)src=(["'])https?:[^"']*\2/gi, "$1data-blocked=$2$2 src=\"data:image/gif;base64,R0lGODlhAQABAAAAACw=\"")}` : null;
  const hasRemote = m.html && /<img\b[^>]*\ssrc=["']https?:/i.test(m.html);
  return (
    <div className="mail-view">
      <div className="mail-view-head">
        <h2>{m.subject || "(sin asunto)"}</h2>
        <div className="mail-actions">
          <button className="tb-btn" onClick={onReply}><Ic name="reply" /> Responder</button>
          <button className="tb-btn" onClick={onForward}><Ic name="forward" /> Reenviar</button>
          <button className="tb-btn icon" title={flagged ? "Quitar destacado" : "Destacar"} onClick={onFlag}><Ic name="star" style={{ color: flagged ? "#e8a33d" : undefined, fontVariationSettings: flagged ? "'FILL' 1" : undefined }} /></button>
          <button className="tb-btn icon" title="Eliminar" onClick={onDelete}><Ic name="delete" /></button>
        </div>
        <div className="mail-from"><PersonAvatar name={nameOf(m.from)} size={36} /><div><b>{nameOf(m.from)}</b> <span className="faint">&lt;{emailOf(m.from)}&gt;</span>
          <div className="faint" style={{ fontSize: 12 }}>Para: {m.to}{m.cc ? ` · Cc: ${m.cc}` : ""} · {m.date ? new Date(m.date).toLocaleString("es-CO") : ""}</div></div></div>
        {hasRemote && !remote && <div className="mail-help"><Ic name="hide_image" size={16} /> Las imágenes externas están bloqueadas para que el remitente no sepa que abriste el correo. <a onClick={() => setRemote(true)}>Mostrar imágenes</a></div>}
      </div>
      {html ? <iframe ref={frame} title="mensaje" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} className="mail-frame" />
        : <pre className="mail-text">{m.text || "(mensaje vacío)"}</pre>}
      {m.attachments?.length > 0 && <div className="mail-atts">{m.attachments.map(a => (
        <div key={a.part} className="mail-att"><Ic name="attach_file" /><span><b>{a.name}</b><span className="faint">{fmtSize(a.size)}</span></span>
          <a className="tb-btn icon" title="Descargar" href={`/api/mail/messages/${m.uid}/attachment?acc=${acc}&box=${encodeURIComponent(m.box)}&part=${a.part}`} download={a.name}><Ic name="download" /></a>
          <button className="tb-btn icon" title="Guardar en mis archivos" onClick={async () => { try { const r = await fetch(`/api/mail/messages/${m.uid}/attachment?acc=${acc}&box=${encodeURIComponent(m.box)}&part=${a.part}`); const b = await r.blob(); const d = vfs.resolve("/Descargas") || vfs.getState().root; await vfs.create(d.id, vfs.uniqueName(d, a.name), b); toast(`“${a.name}” guardado en Descargas`, { icon: "download_done" }); } catch (e) { toast(e.message, { error: true }); } }}><Ic name="drive_folder_upload" /></button></div>))}</div>}
    </div>
  );
}

const LS_ACC = "sotos_mail_acc";
export function RealMail() {
  const [accounts, setAccounts] = useState(undefined), [accId, setAccId] = useState(() => { try { return localStorage.getItem(LS_ACC); } catch { return null; } }), [boxes, setBoxes] = useState([]), [box, setBox] = useState("INBOX");
  const [list, setList] = useState(null), [total, setTotal] = useState(0), [page, setPage] = useState(0), [q, setQ] = useState(""), [sel, setSel] = useState(null), [msg, setMsg] = useState(null), [compose, setCompose] = useState(null), [setup, setSetup] = useState(false), [aliasDlg, setAliasDlg] = useState(false), [loading, setLoading] = useState(false);
  const account = accounts?.find(a => a.id === accId) || accounts?.[0] || null;
  const A = account ? `acc=${account.id}` : "";
  const loadAcc = (pick) => api("GET", "mail/accounts").then(r => { setAccounts(r.accounts); if (pick !== undefined) choose(pick); }).catch(() => setAccounts([]));
  const choose = (id) => { setAccId(id); setBox("INBOX"); try { id ? localStorage.setItem(LS_ACC, id) : localStorage.removeItem(LS_ACC); } catch {} };
  useEffect(() => { loadAcc(); }, []);
  useEffect(() => { setBoxes([]); if (account) api("GET", `mail/boxes?${A}`).then(r => setBoxes(r.boxes)).catch(e => toast(e.message, { error: true })); }, [account?.id]);
  const loadList = (b = box, query = q, pg = 0) => { setLoading(true); return api("GET", `mail/messages?${A}&box=${encodeURIComponent(b)}&page=${pg}${query ? "&q=" + encodeURIComponent(query) : ""}`).then(r => { setPage(pg); setTotal(r.total || 0); setList(l => pg && l ? [...l, ...r.items.filter(x => !l.some(y => y.uid === x.uid))] : r.items); }).catch(e => { toast(e.message, { error: true }); setList([]); }).finally(() => setLoading(false)); };
  useEffect(() => { if (account) { setList(null); setSel(null); setMsg(null); loadList(box, ""); setQ(""); } }, [account?.id, box]);
  const open = async (it) => { setSel(it.uid); setMsg(null); try { const m = await api("GET", `mail/messages/${it.uid}?${A}&box=${encodeURIComponent(box)}`); setMsg({ ...m, box }); setList(l => l.map(x => x.uid === it.uid ? { ...x, seen: true } : x)); } catch (e) { toast(e.message, { error: true }); } };
  if (accounts === undefined) return <div className="app"><EmptyState icon="hourglass_empty" text="Cargando correo…" /></div>;
  if (!account || setup) return <div className="app"><Setup key={setup === "edit" ? account?.id : "nueva"} current={setup === "edit" ? account : null} onCancel={account ? () => setSetup(false) : null}
    onDone={(id) => { setSetup(false); loadAcc(id === null ? null : id); }} /></div>;
  const cur = list?.find(x => x.uid === sel);
  const quote = (m) => `\n\n—— El ${m.date ? new Date(m.date).toLocaleString("es-CO") : ""}, ${m.from} escribió:\n` + (m.text || "").split("\n").map(l => "> " + l).join("\n");
  const quoteHtml = (m, head) => `<p><br></p><p style="color:#666">${esc(head)}</p><blockquote style="margin:0 0 0 8px;padding-left:12px;border-left:3px solid #ccc;color:#555">${m.html ? cleanHtml(m.html) : textToHtml(m.text || "")}</blockquote>`;
  return (
    <div className="app mail-app">
      <div className="app-side">
        <button className="tb-btn primary" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} onClick={() => setCompose({})}><Ic name="edit" /> Redactar</button>
        {boxes.map(b => <div key={b.id} className={"side-item" + (box === b.id ? " active" : "")} onClick={() => setBox(b.id)}><Ic name={BOX_ICON[b.role] || "folder"} /><span>{b.role === "inbox" ? "Recibidos" : b.role === "sent" ? "Enviados" : b.role === "trash" ? "Papelera" : b.role === "junk" ? "Spam" : b.role === "drafts" ? "Borradores" : b.name}</span></div>)}
        <div className="mail-accounts">
          <div className="side-label">Cuentas</div>
          {accounts.map(a => <div key={a.id} className={"mail-acc" + (a.id === account.id ? " on" : "")} onClick={() => a.id !== account.id && choose(a.id)} title={a.id === account.id ? "Cuenta abierta" : "Cambiar a esta cuenta"}>
            <PersonAvatar name={a.name || a.email} size={26} />
            <div className="mail-acc-main"><b>{a.name || a.email.split("@")[0]}</b><span>{a.default_from || a.email}</span></div>
            {a.id === account.id && <><button className="tb-btn icon" title="Alias, remitente principal y firma" onClick={e => { e.stopPropagation(); setAliasDlg(true); }}><Ic name="alternate_email" size={17} /></button>
              <button className="tb-btn icon" title="Configurar cuenta" onClick={e => { e.stopPropagation(); setSetup("edit"); }}><Ic name="settings" size={17} /></button></>}
          </div>)}
          <button className="tb-btn mail-acc-add" onClick={() => setSetup("nueva")}><Ic name="add" /> Añadir cuenta</button>
        </div>
      </div>
      <div className="mail-list">
        <div className="mail-list-bar"><div className="search-box" style={{ flex: 1 }}><Ic name="search" size={16} /><input placeholder="Buscar en el correo" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList(box, q)} /></div>
          <button className="tb-btn icon" title="Actualizar" onClick={() => loadList()}><Ic name={loading ? "progress_activity" : "refresh"} /></button></div>
        <div className="scroll" style={{ flex: 1 }}>
          {list?.map(it => <div key={it.uid} className={"mail-row" + (it.seen ? "" : " unread") + (sel === it.uid ? " sel" : "")} onClick={() => open(it)}>
            <div className="mail-row-top"><b>{nameOf(box === boxes.find(b => b.role === "sent")?.id ? it.to : it.from)}</b><span className="faint">{when(it.date)}</span></div>
            <div className="mail-row-sub">{it.flagged && <Ic name="star" size={13} style={{ color: "#e8a33d", fontVariationSettings: "'FILL' 1" }} />}{it.attach && <Ic name="attach_file" size={13} />}{it.subject}</div></div>)}
          {list && list.length > 0 && !q && list.length < total && <button className="tb-btn" style={{ margin: 10, width: "calc(100% - 20px)", justifyContent: "center" }} disabled={loading} onClick={() => loadList(box, "", page + 1)}><Ic name="keyboard_arrow_down" /> {loading ? "Cargando…" : `Cargar más (${list.length} de ${total.toLocaleString("es-CO")})`}</button>}
          {list && !list.length && <EmptyState icon="inbox" text={q ? "Sin resultados" : "No hay mensajes"} />}
          {!list && <div className="faint" style={{ padding: 16 }}>Cargando…</div>}
        </div>
      </div>
      <div className="app-main">
        {msg ? <MessageView m={msg} acc={account.id} flagged={cur?.flagged}
          onReply={() => setCompose({ from: (account.aliases || []).find(x => (msg.to + " " + (msg.cc || "")).toLowerCase().includes(x.email))?.email, to: msg.replyTo || emailOf(msg.from), subject: /^re:/i.test(msg.subject) ? msg.subject : "Re: " + msg.subject, html: quoteHtml(msg, `El ${msg.date ? new Date(msg.date).toLocaleString("es-CO") : ""}, ${msg.from} escribió:`), inReplyTo: msg.messageId })}
          onForward={() => setCompose({ subject: "Rv: " + msg.subject, html: quoteHtml(msg, `Mensaje reenviado · De: ${msg.from} · Asunto: ${msg.subject}`) })}
          onFlag={async () => { await api("POST", `mail/messages/${msg.uid}/flags?${A}&box=${encodeURIComponent(box)}`, { flagged: !cur?.flagged }); setList(l => l.map(x => x.uid === msg.uid ? { ...x, flagged: !x.flagged } : x)); }}
          onDelete={async () => { try { const r = await api("DELETE", `mail/messages/${msg.uid}?${A}&box=${encodeURIComponent(box)}`); toast(r.to ? `Movido a ${r.to}` : "Mensaje eliminado", { icon: "delete" }); setMsg(null); setSel(null); loadList(); } catch (e) { toast(e.message, { error: true }); } }} />
          : <EmptyState icon="mail" text={sel ? "Abriendo…" : "Elige un mensaje"} />}
      </div>
      {aliasDlg && <Aliases account={account} onClose={() => setAliasDlg(false)} onSaved={() => { setAliasDlg(false); loadAcc(); }} />}
      {compose && <Compose init={compose} account={account} accounts={accounts} onClose={() => setCompose(null)} onSent={() => { setCompose(null); if (boxes.find(b => b.id === box)?.role === "sent") loadList(); }} />}
    </div>
  );
}
