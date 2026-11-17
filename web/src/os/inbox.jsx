/* ============================================================
   Sotos — "Enviar a…" y bandeja de Recibidos
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Modal, EmptyState, toast } from "./ui.jsx";
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";
import { fmtSize, fmtDate } from "./vfs.js";
import { NodeGlyph } from "./files-ui.jsx";
import { PersonAvatar } from "./contacts.jsx";
import { PresenceDot } from "./presence.jsx";
const { useState, useEffect } = React;

/* contador de pendientes (para el dock y la barra de Archivos) */
let pending = 0; const subs = new Set(); let started = false;
const setPending = (n) => { pending = n; subs.forEach(f => f(n)); };
export function useInboxCount() {
  const [n, setN] = useState(pending);
  const mode = vfs.useVfs(s => s.mode);
  useEffect(() => {
    subs.add(setN);
    if (!started && mode === "cloud") {
      started = true;
      api("GET", "inbox").then(r => setPending(r.pending)).catch(() => {});
      onServer("inbox", (d) => setPending(d.pending ?? pending));
    }
    return () => subs.delete(setN);
  }, [mode]);
  return mode === "cloud" ? n : 0;
}

export function SendToDialog({ nodeId, onClose }) {
  const node = vfs.node(nodeId);
  const [people, setPeople] = useState(null), [groups, setGroups] = useState([]);
  const [pick, setPick] = useState(new Set()), [email, setEmail] = useState(""), [msg, setMsg] = useState(""), [q, setQ] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    api("GET", "contacts").then(r => setPeople(r.items.filter(c => c.sotos))).catch(() => setPeople([]));
    api("GET", "contacts/groups").then(r => setGroups(r.items)).catch(() => {});
  }, []);
  const toggle = (id) => setPick(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addGroup = (g) => setPick(p => { const n = new Set(p); (people || []).filter(c => g.members.includes(c.id)).forEach(c => n.add(c.sotos.id)); return n; });
  const send = async () => {
    const to = [...pick, ...email.split(/[,;\s]+/).filter(Boolean)];
    if (!to.length) return toast("Elige al menos una persona", { error: true });
    setBusy(true);
    try {
      const r = await api("POST", "inbox/send", { nodeId, to, message: msg });
      if (r.sent.length) toast(`“${node.name}” enviado a ${r.sent.join(", ")}`, { icon: "send" });
      r.skipped.forEach(s => toast(`${s.who}: ${s.reason}`, { error: true }));
      if (r.sent.length) onClose();
    } catch (e) { toast(e.message, { error: true }); }
    setBusy(false);
  };
  if (!node) return null;
  const list = (people || []).filter(c => (c.name + " " + c.email).toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Enviar a…" icon="send" onClose={onClose} width={480}
      actions={<><button className="tb-btn" onClick={onClose}>Cancelar</button><button className="tb-btn primary" disabled={busy || (!pick.size && !email.trim())} onClick={send}><Ic name="send" /> Enviar</button></>}>
      <div className="sendto">
        <div className="sendto-file"><NodeGlyph node={node} size={30} /><div><b>{node.name}</b><div className="faint">{fmtSize(node.size || 0)} · llega a su bandeja y decide si lo guarda</div></div></div>
        {groups.length > 0 && <div className="sendto-groups">{groups.map(g => <button key={g.id} className="chip" onClick={() => addGroup(g)} style={{ "--chip": g.color }}><Ic name="group" size={14} /> {g.name}</button>)}</div>}
        <div className="search-box"><Ic name="search" size={16} /><input placeholder="Buscar en tus contactos con cuenta" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="sendto-list">
          {people == null && <div className="faint" style={{ padding: 10 }}>Cargando…</div>}
          {list.map(c => (
            <label key={c.id} className={"sendto-row" + (pick.has(c.sotos.id) ? " on" : "")}>
              <input type="checkbox" checked={pick.has(c.sotos.id)} onChange={() => toggle(c.sotos.id)} />
              <span className="sendto-av"><PersonAvatar name={c.name} color={c.color} size={30} /><PresenceDot userId={c.sotos.id} /></span>
              <span className="sendto-name"><b>{c.name}</b><span className="faint">{c.email}</span></span>
            </label>))}
          {people && !people.length && <div className="faint" style={{ padding: 10, fontSize: 12.5 }}>Ninguno de tus contactos tiene cuenta todavía. Escribe un correo abajo.</div>}
        </div>
        <label className="field">Otros correos (de cuentas de Sotos)<input placeholder="ana@ejemplo.com, beto@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field">Mensaje (opcional)<input maxLength={500} placeholder="Te paso el archivo que hablamos" value={msg} onChange={e => setMsg(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

const STATUS = { pending: ["Pendiente", "#c9902a"], accepted: ["Aceptado", "#4f9e4a"], refused: ["Rechazado", "#d9452f"], withdrawn: ["Retirado", "#8a929c"] };
export function InboxView({ openItem }) {
  const [data, setData] = useState(null), [tab, setTab] = useState("in");
  const load = () => api("GET", "inbox").then(r => { setData(r); setPending(r.pending); }).catch(e => { toast(e.message, { error: true }); setData({ received: [], sent: [] }); });
  useEffect(() => { load(); return onServer(["inbox", "notif"], () => load()); }, []);
  const act = async (it, what) => {
    try {
      if (what === "accept") { const r = await api("POST", `inbox/${it.id}/accept`, {}); toast(`“${r.name}” guardado en Recibidos`, { icon: "download_done", action: { label: "Abrir", run: () => { const n = vfs.node(r.nodeId); n && openItem(n); } } }); }
      if (what === "refuse") { await api("POST", `inbox/${it.id}/refuse`, {}); toast("Envío rechazado", { icon: "block" }); }
      if (what === "withdraw") { await api("DELETE", `inbox/${it.id}`); toast("Envío retirado", { icon: "undo" }); }
      load();
    } catch (e) { toast(e.message, { error: true }); }
  };
  if (vfs.getState().mode !== "cloud") return <div className="files-body"><EmptyState icon="inbox" text="Inicia sesión con una cuenta de Sotos para recibir archivos de otras personas" /></div>;
  if (!data) return <div className="files-body"><EmptyState icon="hourglass_empty" text="Cargando…" /></div>;
  const rows = tab === "in" ? data.received : data.sent;
  return (
    <div className="files-body inbox-view">
      <div className="world-tabs" style={{ padding: "0 4px", marginBottom: 6 }}>
        <button className={tab === "in" ? "on" : ""} onClick={() => setTab("in")}><Ic name="inbox" size={17} /> Recibidos{data.pending ? <span className="world-unread sm">{data.pending}</span> : null}</button>
        <button className={tab === "out" ? "on" : ""} onClick={() => setTab("out")}><Ic name="outbox" size={17} /> Enviados</button>
      </div>
      {rows.map(it => {
        const who = tab === "in" ? it.from : it.to, [label, col] = STATUS[it.status] || [it.status, "#888"];
        return (
          <div key={it.id} className={"inbox-row" + (it.status === "pending" ? " pending" : "")}>
            <NodeGlyph node={{ id: it.id, name: it.name, type: it.type, size: it.size }} size={34} />
            <div className="inbox-main">
              <b>{it.name}</b>
              <span className="faint">{tab === "in" ? "De" : "Para"} {who?.name} · {fmtSize(it.size)} · {fmtDate(it.created)}</span>
              {it.message && <span className="inbox-msg">“{it.message}”</span>}
            </div>
            {tab === "in" && it.status === "pending" ? <div className="wl-btns" style={{ margin: 0 }}>
              <button className="tb-btn primary" onClick={() => act(it, "accept")}><Ic name="check" /> Aceptar</button>
              <button className="tb-btn" onClick={() => act(it, "refuse")}>Rechazar</button></div>
              : tab === "out" && it.status === "pending" ? <button className="tb-btn" onClick={() => act(it, "withdraw")}><Ic name="undo" /> Retirar</button>
              : <span className="inbox-status" style={{ color: col }}>{label}</span>}
          </div>);
      })}
      {!rows.length && <EmptyState icon={tab === "in" ? "inbox" : "outbox"} text={tab === "in" ? "No tienes archivos recibidos. Cuando alguien te envíe uno, aparece aquí." : "Aún no has enviado archivos. Clic derecho sobre uno → Enviar a…"} />}
    </div>
  );
}
