/* ============================================================
   Sotos — WhatsApp nativo (cada cuenta vincula su propio WhatsApp)
   Habla con el servidor de Sotos (/api/wa), que usa el servicio
   opcional services/whatsapp. Cliente no oficial: se avisa del riesgo.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, EmptyState, Modal, toast } from "./ui.jsx";
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";
import { fmtSize } from "./vfs.js";
import { PersonAvatar } from "./contacts.jsx";
const { useState, useEffect, useRef, useCallback } = React;

const hhmm = (t) => new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (t) => { const d = new Date(t), n = new Date(); const y = new Date(n); y.setDate(n.getDate() - 1);
  return d.toDateString() === n.toDateString() ? "Hoy" : d.toDateString() === y.toDateString() ? "Ayer" : d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }); };
const when = (t) => !t ? "" : new Date(t).toDateString() === new Date().toDateString() ? hhmm(t) : new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
const KIND_LABEL = { image: "📷 Foto", video: "🎬 Video", audio: "🎤 Audio", document: "📄 Documento", sticker: "Sticker", location: "📍 Ubicación", contact: "👤 Contacto", poll: "📊 Encuesta", other: "Mensaje" };
const mediaUrl = (m) => `/api/wa/media?jid=${encodeURIComponent(m.jid)}&id=${encodeURIComponent(m.id)}`;

/** ¿el servidor tiene WhatsApp nativo? (null = aún no se sabe) */
export function useNativeWa(enabledMode) {
  const [info, setInfo] = useState(null);
  useEffect(() => { if (!enabledMode) { setInfo({ enabled: false }); return; } fetch("/api/wa").then(r => r.ok ? r.json() : { enabled: false }).then(setInfo).catch(() => setInfo({ enabled: false })); }, [enabledMode]);
  return info;
}

function Intro({ onStart, busy }) {
  return (
    <div className="wa-intro">
      <div className="wa-intro-card">
        <div className="lp-svc" style={{ background: "#4f7a3a", width: 72, height: 72, borderRadius: 20 }}><Ic name="chat" size={38} /></div>
        <h2>Tu WhatsApp en Sotos</h2>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>Vincula tu WhatsApp como un dispositivo más (igual que WhatsApp Web) y usa tus chats con la interfaz de Sotos: mensajes, fotos, audios, documentos y archivos de tu nube. Cada cuenta de Sotos tiene su propia sesión.</div>
        <div className="wa-warn"><Ic name="warning" size={18} /><div><b>Antes de vincular:</b> Sotos se conecta con un cliente <b>no oficial</b> del protocolo de WhatsApp. WhatsApp no lo autoriza y puede <b>suspender el número</b> que lo usa, sobre todo si envía muchos mensajes seguidos o a desconocidos. Úsalo con un número que puedas arriesgar. Tus chats recientes se guardan en tu servidor de Sotos.</div></div>
        <button className="tb-btn primary" disabled={busy} onClick={onStart} style={{ width: "100%", justifyContent: "center" }}><Ic name="qr_code_2" /> {busy ? "Preparando…" : "Entiendo el riesgo, vincular"}</button>
      </div>
    </div>
  );
}

function Qr({ qr, onCancel }) {
  return (
    <div className="wa-intro">
      <div className="wa-intro-card">
        <h2>Escanea el código</h2>
        {qr ? <img className="wa-qr" src={qr} alt="Código QR para vincular WhatsApp" /> : <div className="wa-qr wa-qr-wait"><Ic name="progress_activity" size={32} /></div>}
        <ol className="wa-steps"><li>Abre WhatsApp en tu celular.</li><li>Toca <b>Ajustes</b> (o los tres puntos) → <b>Dispositivos vinculados</b>.</li><li>Toca <b>Vincular un dispositivo</b> y apunta al código.</li></ol>
        <div className="faint" style={{ fontSize: 12 }}>El código se renueva solo cada pocos segundos.</div>
        <button className="tb-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function Bubble({ m, group, onSave }) {
  const body = () => {
    switch (m.kind) {
      case "image": case "sticker": return <a href={mediaUrl(m)} target="_blank" rel="noopener"><img className={m.kind === "sticker" ? "wa-sticker" : "wa-img"} src={mediaUrl(m)} loading="lazy" alt={m.text || "Foto"} /></a>;
      case "video": return <video className="wa-img" src={mediaUrl(m)} controls preload="none" />;
      case "audio": return <audio src={mediaUrl(m)} controls preload="none" style={{ width: 260 }} />;
      case "document": return <div className="wa-doc"><Ic name="description" size={26} /><span><b>{m.file || m.text || "Documento"}</b>{m.size ? <span className="faint">{fmtSize(m.size)}</span> : null}</span>
        <a className="tb-btn icon" title="Descargar" href={mediaUrl(m)} download={m.file || "documento"}><Ic name="download" /></a>
        <button className="tb-btn icon" title="Guardar en mis archivos" onClick={() => onSave(m)}><Ic name="drive_folder_upload" /></button></div>;
      case "location": { const [la, lo] = (m.text || "").split(","); return <a href={`https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=16/${la}/${lo}`} target="_blank" rel="noopener"><Ic name="location_on" /> Ver ubicación</a>; }
      case "text": return null;
      default: return <span className="faint">{KIND_LABEL[m.kind] || "Mensaje"} (ábrelo en el celular)</span>;
    }
  };
  const showText = m.text && !(m.kind === "document" && m.text === m.file) && m.kind !== "location";
  return (
    <div className={"wa-msg" + (m.fromMe ? " me" : "")}>
      <div className="wa-bubble">
        {group && !m.fromMe && m.senderName && <div className="wa-sender">{m.senderName}</div>}
        {body()}
        {showText && <div className="wa-text">{m.text}</div>}
        <div className="wa-meta">{m.reaction && <span className="wa-react">{m.reaction}</span>}{hhmm(m.ts)}{m.fromMe && <Ic name={m.status >= 4 ? "done_all" : m.status >= 3 ? "done_all" : "done"} size={14} style={{ color: m.status >= 4 ? "var(--accent)" : undefined }} />}</div>
      </div>
    </div>
  );
}

function Conversation({ chat, onBack }) {
  const [msgs, setMsgs] = useState(null), [text, setText] = useState(""), [busy, setBusy] = useState(false), [pick, setPick] = useState(false), [more, setMore] = useState(true);
  const box = useRef(null), stick = useRef(true);
  const load = useCallback(async (before) => { const r = await api("GET", `wa/messages?jid=${encodeURIComponent(chat.jid)}${before ? "&before=" + before : ""}`); const list = Array.isArray(r?.messages) ? r.messages : []; if (list.length < 60) setMore(false); return list; }, [chat.jid]);
  useEffect(() => { let live = true; setMsgs(null); setMore(true); stick.current = true;
    load().then(m => live && setMsgs(m)).catch(e => toast(e.message, { error: true }));
    if (chat.unread) api("POST", "wa/read", { jid: chat.jid }).catch(() => {});
    return () => { live = false; }; }, [chat.jid]);
  // mensajes nuevos, acuses y reacciones en vivo
  useEffect(() => {
    const on = (e) => { const { type, data } = e.detail || {}; if (!data || data.jid !== chat.jid) return;
      if (type === "message") { setMsgs(l => l && !l.some(x => x.id === data.id) ? [...l, data] : l); if (!data.fromMe) api("POST", "wa/read", { jid: chat.jid }).catch(() => {}); }
      if (type === "ack") setMsgs(l => l?.map(x => x.id === data.id ? { ...x, status: data.status } : x));
      if (type === "reaction") setMsgs(l => l?.map(x => x.id === data.to ? { ...x, reaction: data.emoji } : x)); };
    window.addEventListener("sotos-wa", on); return () => window.removeEventListener("sotos-wa", on);
  }, [chat.jid]);
  useEffect(() => { if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  const older = async () => { const el = box.current, h = el.scrollHeight; stick.current = false; const m = await load(msgs[0]?.ts).catch(e => { toast(e.message, { error: true }); return []; }); setMsgs(l => [...m.filter(x => !l.some(y => y.id === x.id)), ...l]); requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - h; }); };
  const send = async (extra = {}) => { const t = text.trim(); if (!t && !extra.nodeId) return; setBusy(true); stick.current = true;
    try { const r = await api("POST", "wa/send", { jid: chat.jid, text: t, ...extra }); setText(""); if (r.message) setMsgs(l => l && !l.some(x => x.id === r.message.id) ? [...l, r.message] : l); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const save = async (m) => { try { const r = await fetch(mediaUrl(m)); if (!r.ok) throw new Error("No se pudo descargar"); const b = await r.blob(); const d = vfs.resolve("/Descargas") || vfs.getState().root; const name = vfs.uniqueName(d, m.file || m.text || "archivo de WhatsApp"); await vfs.create(d.id, name, b); toast(`“${name}” guardado en Descargas`, { icon: "download_done" }); } catch (e) { toast(e.message, { error: true }); } };
  const files = []; if (pick) vfs.walk(n => { if (!n.children && n.size > 0 && n.size < 64e6) files.push(n); });
  let lastDay = "";
  return (
    <div className="wa-conv">
      <div className="wa-conv-head"><button className="tb-btn icon wa-back" onClick={onBack}><Ic name="arrow_back" /></button><PersonAvatar name={chat.name} size={34} /><div><b>{chat.name}</b><div className="faint" style={{ fontSize: 11.5 }}>{chat.group ? "Grupo" : chat.jid.split("@")[0].replace(/^(\d+)$/, "+$1")}</div></div></div>
      <div className="wa-msgs" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {msgs && more && msgs.length >= 60 && <button className="tb-btn wa-older" onClick={older}><Ic name="keyboard_arrow_up" /> Mensajes anteriores</button>}
        {!msgs && <div className="faint" style={{ padding: 20 }}>Cargando…</div>}
        {msgs && !msgs.length && <EmptyState icon="forum" text="Aún no hay mensajes guardados de este chat. Los nuevos aparecerán aquí." />}
        {msgs?.map(m => { const dl = dayLabel(m.ts); const sep = dl !== lastDay; lastDay = dl;
          return <React.Fragment key={m.id}>{sep && <div className="wa-day"><span>{dl}</span></div>}<Bubble m={m} group={chat.group} onSave={save} /></React.Fragment>; })}
      </div>
      {pick && <div className="wa-pick">{files.slice(0, 200).map(n => <button key={n.id} onClick={() => { setPick(false); send({ nodeId: n.id }); }}><Ic name="description" size={16} /> {n.name} <span className="faint">{fmtSize(n.size)}</span></button>)}{!files.length && <div className="faint" style={{ padding: 10 }}>No hay archivos para enviar.</div>}</div>}
      <div className="wa-compose">
        <button className="tb-btn icon" title="Enviar un archivo de Sotos" onClick={() => { vfs.flush?.().catch(() => {}); setPick(p => !p); }}><Ic name="attach_file" /></button>
        <textarea rows={1} placeholder="Escribe un mensaje" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="tb-btn primary icon" title="Enviar" disabled={busy || !text.trim()} onClick={() => send()}><Ic name="send" /></button>
      </div>
    </div>
  );
}

export function NativeWhatsApp() {
  const [st, setSt] = useState({ state: "loading" }), [chats, setChats] = useState(null), [sel, setSel] = useState(null), [q, setQ] = useState(""), [busy, setBusy] = useState(false), [newChat, setNewChat] = useState(null);
  const loadChats = useCallback(() => api("GET", "wa/chats").then(r => setChats(Array.isArray(r?.chats) ? r.chats : [])).catch(() => {}), []);
  // estado inicial con una petición normal; los cambios en vivo llegan por la conexión que Sotos ya tiene
  // abierta (/api/fs/events → "wa"), así WhatsApp no ocupa conexiones extra del navegador
  useEffect(() => { let stop = false;
    const poll = () => api("GET", "wa/status").then(s => { if (!stop && s && s.state) setSt(cur => cur.state === "loading" || cur.state === "down" || cur.state === "reconnecting" || s.state !== cur.state ? { ...cur, ...s } : cur); })
      .catch((e) => { if (!stop) setSt(cur => cur.state === "loading" || cur.state === "down" ? { state: "down", error: e.message } : cur); });
    poll(); const iv = setInterval(poll, 10000); // red de seguridad por si se pierde algún evento
    return () => { stop = true; clearInterval(iv); }; }, []);
  useEffect(() => { let t = null;
    const off = onServer("wa", ({ type, data }) => {
      window.dispatchEvent(new CustomEvent("sotos-wa", { detail: { type, data } }));
      if (type === "status" && data && data.state) setSt(data);
      if (type === "chats" || type === "message") { clearTimeout(t); t = setTimeout(loadChats, 400); } });
    return () => { off(); clearTimeout(t); };
  }, []);
  useEffect(() => { if (st.state === "open") loadChats(); }, [st.state]);
  const start = async () => { setBusy(true); try { setSt(await api("POST", "wa/start")); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const logout = async () => { try { await api("POST", "wa/logout"); setSt({ state: "off" }); setChats(null); setSel(null); toast("WhatsApp desvinculado de Sotos", { icon: "link_off" }); } catch (e) { toast(e.message, { error: true }); } };
  if (st.state === "loading") return <div className="app"><EmptyState icon="hourglass_empty" text="Conectando con WhatsApp…" /></div>;
  if (st.state === "down") return <div className="app"><div className="wa-intro"><div className="wa-intro-card"><Ic name="cloud_off" size={38} /><h2>WhatsApp no responde</h2>
    <div className="muted" style={{ fontSize: 13.5 }}>El servicio de WhatsApp del servidor no está en marcha o se está reiniciando. Sotos lo vuelve a intentar solo cada pocos segundos; tus chats siguen guardados.</div>
    <button className="tb-btn primary" onClick={() => api("GET", "wa/status").then(s => s?.state && setSt(s)).catch(e => toast(e.message, { error: true }))}><Ic name="refresh" size={18} /> Reintentar ahora</button></div></div></div>;

  if (st.state === "off") return <div className="app">{st.reason && <div className="proxy-bar"><Ic name="info" size={14} /> {st.reason}</div>}<Intro onStart={start} busy={busy} /></div>;
  if (st.state === "qr") return <div className="app"><Qr qr={st.qr} onCancel={logout} /></div>;
  const list = [...new Map((chats || []).map(c => [c.jid, c])).values()].filter(c => !q || (c.name || "").toLowerCase().includes(q.toLowerCase()));
  const cur = sel && (chats || []).find(c => c.jid === sel) || (sel ? { jid: sel, name: newChat?.name || sel.split("@")[0], group: sel.endsWith("@g.us") } : null);
  return (
    <div className={"app wa-app" + (sel ? " has-chat" : "")}>
      <div className="wa-side">
        <div className="wa-side-head">
          <div className="search-box" style={{ flex: 1 }}><Ic name="search" size={16} /><input placeholder="Buscar chat" value={q} onChange={e => setQ(e.target.value)} /></div>
          <button className="tb-btn icon" title="Chat nuevo" onClick={() => setNewChat({ phone: "" })}><Ic name="add_comment" /></button>
          <button className="tb-btn icon" title="Desvincular WhatsApp de Sotos" onClick={logout}><Ic name="link_off" /></button>
        </div>
        {st.state !== "open" && <div className="proxy-bar"><Ic name="progress_activity" size={14} /> Reconectando…</div>}
        <div className="scroll" style={{ flex: 1 }}>
          {!chats && <div className="faint" style={{ padding: 16 }}>Cargando chats… (la primera vez WhatsApp envía tus chats recientes; puede tardar un minuto)</div>}
          {chats && !list.length && <EmptyState icon="forum" text={q ? "Sin resultados" : "Aún no hay chats"} />}
          {list.map(c => <div key={c.jid} className={"wa-chat" + (sel === c.jid ? " sel" : "") + (c.unread ? " unread" : "")} onClick={() => { setSel(c.jid); if (c.unread) setChats(l => l.map(x => x.jid === c.jid ? { ...x, unread: 0 } : x)); }}>
            <PersonAvatar name={c.name} size={40} />
            <div className="wa-chat-main"><div className="wa-chat-top"><b>{c.name}</b><span className="faint">{when(c.ts)}</span></div>
              <div className="wa-chat-sub"><span>{c.last ? (c.last.fromMe ? "Tú: " : "") + (c.last.kind === "text" ? c.last.text : (KIND_LABEL[c.last.kind] || "") + (c.last.text ? " · " + c.last.text : "")) : ""}</span>{c.unread > 0 && <em>{c.unread}</em>}</div></div>
          </div>)}
        </div>
        {st.me && <div className="faint wa-me">Vinculado: {st.me.name || ""} {st.me.id ? "+" + st.me.id.split("@")[0] : ""}</div>}
      </div>
      <div className="wa-main">{cur ? <Conversation key={cur.jid} chat={cur} onBack={() => setSel(null)} /> : <EmptyState icon="chat" text="Elige un chat" />}</div>
      {newChat && <Modal title="Chat nuevo" icon="add_comment" onClose={() => setNewChat(null)} width={380}
        actions={<><button className="tb-btn" onClick={() => setNewChat(null)}>Cancelar</button><button className="tb-btn primary" onClick={async () => { try { const r = await api("POST", "wa/check", { phone: newChat.phone }); setSel(r.jid); setNewChat(null); } catch (e) { toast(e.message, { error: true }); } }}>Abrir chat</button></>}>
        <label className="field">Número con indicativo del país<input autoFocus placeholder="57 300 123 4567" value={newChat.phone} onChange={e => setNewChat({ phone: e.target.value })} /></label>
      </Modal>}
    </div>
  );
}
