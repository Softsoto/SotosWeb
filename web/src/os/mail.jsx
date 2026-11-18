/* ============================================================
   Sotos — Correo real (IMAP/SMTP vía el servidor de Sotos)
   El HTML de los mensajes se muestra en un marco aislado (sin scripts)
   y sin imágenes remotas hasta que lo pidas (evita los rastreadores).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
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

function Setup({ onDone, current }) {
  const [presets, setPresets] = useState({}), [p, setP] = useState(current ? "otro" : "gmail");
  const [f, setF] = useState({ email: current?.email || "", name: current?.name || "", password: "", imapHost: current?.imap_host || "", imapPort: current?.imap_port || 993, smtpHost: current?.smtp_host || "", smtpPort: current?.smtp_port || 465, smtpTls: current?.smtp_tls || "", username: current?.username || "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("GET", "mail/presets").then(r => setPresets(r.presets)).catch(() => {}); }, []);
  const save = async () => { setBusy(true); try { const r = await api("PUT", "mail/account", { ...f, preset: p === "otro" ? undefined : p, username: f.username || f.email }); toast(`Cuenta conectada · ${r.boxes} carpetas`, { icon: "mark_email_read" }); onDone(); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  return (
    <div className="mail-setup">
      <div className="mail-setup-card">
        <Ic name="alternate_email" size={40} style={{ color: "var(--accent)" }} />
        <h2>Conecta tu correo</h2>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>Sotos lee y envía tu correo directamente con tu proveedor (IMAP y SMTP). La contraseña se guarda cifrada en tu servidor de Sotos y nunca vuelve al navegador.</div>
        <div className="mail-presets">{[...Object.entries(presets), ["otro", { label: "Otro" }]].map(([k, v]) => <button key={k} className={"chip" + (p === k ? " on" : "")} onClick={() => setP(k)}>{v.label}</button>)}</div>
        {presets[p]?.help && <div className="mail-help"><Ic name="info" size={16} /> {presets[p].help}</div>}
        <div style={{ display: "grid", gap: 10, width: "100%" }}>
          <label className="field">Tu nombre<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Como te verán al recibir tus correos" /></label>
          <label className="field">Correo<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="tu@correo.com" /></label>
          <label className="field">Contraseña {p !== "otro" ? "de aplicación" : ""}<input type="password" autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
          {p === "otro" && <div className="mail-server-grid">
            <label className="field">Servidor IMAP<input value={f.imapHost} onChange={e => setF({ ...f, imapHost: e.target.value })} placeholder="imap.ejemplo.com" /></label>
            <label className="field">Puerto<input type="number" value={f.imapPort} onChange={e => setF({ ...f, imapPort: e.target.value })} /></label>
            <label className="field">Servidor SMTP<input value={f.smtpHost} onChange={e => setF({ ...f, smtpHost: e.target.value })} placeholder="smtp.ejemplo.com" /></label>
            <label className="field">Puerto<input type="number" value={f.smtpPort} onChange={e => setF({ ...f, smtpPort: e.target.value })} /></label>
            <label className="field">Seguridad SMTP<select className="sc-input" style={{ margin: 0 }} value={f.smtpTls} onChange={e => setF({ ...f, smtpTls: e.target.value })}><option value="">Automática por puerto</option><option value="ssl">SSL/TLS</option><option value="starttls">STARTTLS</option></select></label>
            <label className="field">Usuario<input value={f.username} onChange={e => setF({ ...f, username: e.target.value })} placeholder="Normalmente tu correo" /></label>
          </div>}
        </div>
        <button className="tb-btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy || !f.email || !f.password} onClick={save}>{busy ? "Comprobando…" : <><Ic name="link" /> Conectar</>}</button>
      </div>
    </div>
  );
}

function Compose({ init, onClose, onSent, account }) {
  const [f, setF] = useState({ to: "", cc: "", subject: "", text: "", ...init }), [att, setAtt] = useState([]), [busy, setBusy] = useState(false), [pick, setPick] = useState(false);
  const send = async () => { setBusy(true); try { await vfs.flush?.().catch(() => {}); await api("POST", "mail/send", { ...f, attachments: att.map(n => n.id) }); toast("Correo enviado", { icon: "send" }); onSent(); } catch (e) { toast(e.message, { error: true }); setBusy(false); } };
  const files = []; vfs.walk(n => { if (!n.children && n.size > 0 && n.size < 20e6) files.push(n); });
  return (
    <Modal title={init?.subject ? f.subject : "Correo nuevo"} icon="edit" onClose={onClose} width={620}
      actions={<><button className="tb-btn" onClick={() => setPick(p => !p)}><Ic name="attach_file" /> Adjuntar de Archivos</button><div style={{ flex: 1 }} /><button className="tb-btn" onClick={onClose}>Descartar</button>
        <button className="tb-btn primary" disabled={busy || !f.to.trim()} onClick={send}><Ic name="send" /> {busy ? "Enviando…" : "Enviar"}</button></>}>
      <div className="compose">
        <div className="faint" style={{ fontSize: 12 }}>De: {account.name} &lt;{account.email}&gt;</div>
        <label className="compose-row"><span>Para</span><input autoFocus value={f.to} onChange={e => setF({ ...f, to: e.target.value })} placeholder="correo@ejemplo.com, otro@ejemplo.com" /></label>
        <label className="compose-row"><span>Cc</span><input value={f.cc} onChange={e => setF({ ...f, cc: e.target.value })} /></label>
        <label className="compose-row"><span>Asunto</span><input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></label>
        <textarea rows={12} value={f.text} onChange={e => setF({ ...f, text: e.target.value })} placeholder="Escribe tu mensaje…" />
        {att.length > 0 && <div className="compose-atts">{att.map(n => <span key={n.id} className="chip on" style={{ "--chip": "#5a5689" }}><Ic name="attach_file" size={14} /> {n.name} · {fmtSize(n.size)} <Ic name="close" size={14} style={{ cursor: "pointer" }} onClick={() => setAtt(a => a.filter(x => x.id !== n.id))} /></span>)}</div>}
        {pick && <div className="compose-pick">{files.slice(0, 200).map(n => <button key={n.id} onClick={() => { setAtt(a => a.some(x => x.id === n.id) ? a : [...a, n]); setPick(false); }}><Ic name="description" size={16} /> {n.name} <span className="faint">{fmtSize(n.size)}</span></button>)}</div>}
      </div>
    </Modal>
  );
}

function MessageView({ m, onReply, onForward, onDelete, onFlag, flagged }) {
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
        {hasRemote && !remote && <div className="mail-help"><Ic name="image_not_supported" size={16} /> Las imágenes externas están bloqueadas para que el remitente no sepa que abriste el correo. <a onClick={() => setRemote(true)}>Mostrar imágenes</a></div>}
      </div>
      {html ? <iframe ref={frame} title="mensaje" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} className="mail-frame" />
        : <pre className="mail-text">{m.text || "(mensaje vacío)"}</pre>}
      {m.attachments?.length > 0 && <div className="mail-atts">{m.attachments.map(a => (
        <div key={a.part} className="mail-att"><Ic name="attach_file" /><span><b>{a.name}</b><span className="faint">{fmtSize(a.size)}</span></span>
          <a className="tb-btn icon" title="Descargar" href={`/api/mail/messages/${m.uid}/attachment?box=${encodeURIComponent(m.box)}&part=${a.part}`} download={a.name}><Ic name="download" /></a>
          <button className="tb-btn icon" title="Guardar en mis archivos" onClick={async () => { try { const r = await fetch(`/api/mail/messages/${m.uid}/attachment?box=${encodeURIComponent(m.box)}&part=${a.part}`); const b = await r.blob(); const d = vfs.resolve("/Descargas") || vfs.getState().root; await vfs.create(d.id, vfs.uniqueName(d, a.name), b); toast(`“${a.name}” guardado en Descargas`, { icon: "download_done" }); } catch (e) { toast(e.message, { error: true }); } }}><Ic name="drive_folder_upload" /></button></div>))}</div>}
    </div>
  );
}

export function RealMail() {
  const [account, setAccount] = useState(undefined), [boxes, setBoxes] = useState([]), [box, setBox] = useState("INBOX");
  const [list, setList] = useState(null), [total, setTotal] = useState(0), [page, setPage] = useState(0), [q, setQ] = useState(""), [sel, setSel] = useState(null), [msg, setMsg] = useState(null), [compose, setCompose] = useState(null), [setup, setSetup] = useState(false), [loading, setLoading] = useState(false);
  const loadAcc = () => api("GET", "mail/account").then(r => setAccount(r.account)).catch(() => setAccount(null));
  useEffect(() => { loadAcc(); }, []);
  useEffect(() => { if (account) api("GET", "mail/boxes").then(r => setBoxes(r.boxes)).catch(e => toast(e.message, { error: true })); }, [account?.email]);
  const loadList = (b = box, query = q, pg = 0) => { setLoading(true); return api("GET", `mail/messages?box=${encodeURIComponent(b)}&page=${pg}${query ? "&q=" + encodeURIComponent(query) : ""}`).then(r => { setPage(pg); setTotal(r.total || 0); setList(l => pg && l ? [...l, ...r.items.filter(x => !l.some(y => y.uid === x.uid))] : r.items); }).catch(e => { toast(e.message, { error: true }); setList([]); }).finally(() => setLoading(false)); };
  useEffect(() => { if (account) { setList(null); setSel(null); setMsg(null); loadList(box, ""); setQ(""); } }, [account?.email, box]);
  const open = async (it) => { setSel(it.uid); setMsg(null); try { const m = await api("GET", `mail/messages/${it.uid}?box=${encodeURIComponent(box)}`); setMsg({ ...m, box }); setList(l => l.map(x => x.uid === it.uid ? { ...x, seen: true } : x)); } catch (e) { toast(e.message, { error: true }); } };
  if (account === undefined) return <div className="app"><EmptyState icon="hourglass_empty" text="Cargando correo…" /></div>;
  if (!account || setup) return <div className="app"><Setup current={account} onDone={() => { setSetup(false); loadAcc(); }} /></div>;
  const cur = list?.find(x => x.uid === sel);
  const quote = (m) => `\n\n—— El ${m.date ? new Date(m.date).toLocaleString("es-CO") : ""}, ${m.from} escribió:\n` + (m.text || "").split("\n").map(l => "> " + l).join("\n");
  return (
    <div className="app mail-app">
      <div className="app-side">
        <button className="tb-btn primary" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} onClick={() => setCompose({})}><Ic name="edit" /> Redactar</button>
        {boxes.map(b => <div key={b.id} className={"side-item" + (box === b.id ? " active" : "")} onClick={() => setBox(b.id)}><Ic name={BOX_ICON[b.role] || "folder"} /><span>{b.role === "inbox" ? "Recibidos" : b.role === "sent" ? "Enviados" : b.role === "trash" ? "Papelera" : b.role === "junk" ? "Spam" : b.role === "drafts" ? "Borradores" : b.name}</span></div>)}
        <div style={{ marginTop: "auto", fontSize: 12 }} className="faint">{account.email}<br /><a style={{ cursor: "pointer", color: "var(--accent)" }} onClick={() => setSetup(true)}>Configurar cuenta</a></div>
      </div>
      <div className="mail-list">
        <div className="mail-list-bar"><div className="search-box" style={{ flex: 1 }}><Ic name="search" size={16} /><input placeholder="Buscar en el correo" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList(box, q)} /></div>
          <button className="tb-btn icon" title="Actualizar" onClick={() => loadList()}><Ic name={loading ? "progress_activity" : "refresh"} /></button></div>
        <div className="scroll" style={{ flex: 1 }}>
          {list?.map(it => <div key={it.uid} className={"mail-row" + (it.seen ? "" : " unread") + (sel === it.uid ? " sel" : "")} onClick={() => open(it)}>
            <div className="mail-row-top"><b>{nameOf(box === boxes.find(b => b.role === "sent")?.id ? it.to : it.from)}</b><span className="faint">{when(it.date)}</span></div>
            <div className="mail-row-sub">{it.flagged && <Ic name="star" size={13} style={{ color: "#e8a33d", fontVariationSettings: "'FILL' 1" }} />}{it.attach && <Ic name="attach_file" size={13} />}{it.subject}</div></div>)}
          {list && list.length > 0 && !q && list.length < total && <button className="tb-btn" style={{ margin: 10, width: "calc(100% - 20px)", justifyContent: "center" }} disabled={loading} onClick={() => loadList(box, "", page + 1)}><Ic name="expand_more" /> {loading ? "Cargando…" : `Cargar más (${list.length} de ${total.toLocaleString("es-CO")})`}</button>}
          {list && !list.length && <EmptyState icon="inbox" text={q ? "Sin resultados" : "No hay mensajes"} />}
          {!list && <div className="faint" style={{ padding: 16 }}>Cargando…</div>}
        </div>
      </div>
      <div className="app-main">
        {msg ? <MessageView m={msg} flagged={cur?.flagged}
          onReply={() => setCompose({ to: msg.replyTo || emailOf(msg.from), subject: /^re:/i.test(msg.subject) ? msg.subject : "Re: " + msg.subject, text: quote(msg), inReplyTo: msg.messageId })}
          onForward={() => setCompose({ subject: "Rv: " + msg.subject, text: `\n\n—— Mensaje reenviado ——\nDe: ${msg.from}\nAsunto: ${msg.subject}\n\n${msg.text || ""}` })}
          onFlag={async () => { await api("POST", `mail/messages/${msg.uid}/flags?box=${encodeURIComponent(box)}`, { flagged: !cur?.flagged }); setList(l => l.map(x => x.uid === msg.uid ? { ...x, flagged: !x.flagged } : x)); }}
          onDelete={async () => { try { const r = await api("DELETE", `mail/messages/${msg.uid}?box=${encodeURIComponent(box)}`); toast(r.to ? `Movido a ${r.to}` : "Mensaje eliminado", { icon: "delete" }); setMsg(null); setSel(null); loadList(); } catch (e) { toast(e.message, { error: true }); } }} />
          : <EmptyState icon="mail" text={sel ? "Abriendo…" : "Elige un mensaje"} />}
      </div>
      {compose && <Compose init={compose} account={account} onClose={() => setCompose(null)} onSent={() => { setCompose(null); if (boxes.find(b => b.id === box)?.role === "sent") loadList(); }} />}
    </div>
  );
}
