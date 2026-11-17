/* ============================================================
   Sotos — Tareas
   Listas personales y de cada Mundo (con asignación y comentarios),
   vistas Hoy y Próximas. Sin cuenta, se guarda en este navegador.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Modal, EmptyState, toast } from "./ui.jsx";
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";
import { useVfs } from "./vfs.js";
import { PersonAvatar } from "./contacts.jsx";
import { timeAgo } from "./notifications.jsx";
const { useState, useEffect, useMemo } = React;

const DAY = 86400000;
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const PRIO = [["Normal", "#8a929c"], ["Alta", "#c9902a"], ["Urgente", "#d9452f"]];
const dueLabel = (t) => { if (!t) return null; const d0 = today0(), diff = Math.floor((t - d0) / DAY); return diff < 0 ? ["Vencida · " + new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" }), "late"] : diff === 0 ? ["Hoy", "today"] : diff === 1 ? ["Mañana", ""] : [new Date(t).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }), ""]; };
const dateIn = (t) => { if (!t) return ""; const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const LKEY = "sotos_tasks";
const lget = () => { try { return JSON.parse(localStorage.getItem(LKEY)); } catch { return null; } };
const lset = (d) => { try { localStorage.setItem(LKEY, JSON.stringify(d)); } catch {} };
const local = () => { let d = lget(); if (!d) { d = { lists: [{ id: "mis", name: "Mis tareas", color: "#4f7a3a" }], tasks: [] }; lset(d); } return d; };
const store = (cloud) => cloud ? {
  load: () => api("GET", "tasks"),
  addList: (b) => api("POST", "tasks/lists", b), delList: (id) => api("DELETE", "tasks/lists/" + id),
  add: (b) => api("POST", "tasks/items", b), update: (id, b) => api("PUT", "tasks/items/" + id, b), remove: (id) => api("DELETE", "tasks/items/" + id),
  comments: (id) => api("GET", `tasks/items/${id}/comments`).then(r => r.items), comment: (id, text) => api("POST", `tasks/items/${id}/comments`, { text }),
} : {
  load: async () => { const d = local(); return { lists: d.lists, worlds: [], tasks: d.tasks }; },
  addList: async (b) => { const d = local(); d.lists.push({ id: vfs.newId(), name: b.name, color: "#2f5d8a" }); lset(d); },
  delList: async (id) => { const d = local(); if (d.lists.length <= 1) throw new Error("Debe quedar al menos una lista"); d.lists = d.lists.filter(l => l.id !== id); d.tasks = d.tasks.filter(t => t.listId !== id); lset(d); },
  add: async (b) => { const d = local(); d.tasks.push({ id: vfs.newId(), done: false, priority: 0, created: Date.now(), updated: Date.now(), comments: 0, ...b }); lset(d); },
  update: async (id, b) => { const d = local(); d.tasks = d.tasks.map(t => t.id === id ? { ...t, ...b, doneAt: b.done ? Date.now() : b.done === false ? null : t.doneAt, updated: Date.now() } : t); lset(d); },
  remove: async (id) => { const d = local(); d.tasks = d.tasks.filter(t => t.id !== id); lset(d); },
  comments: async () => [], comment: async () => { throw new Error("Los comentarios necesitan una cuenta de Sotos"); },
};

export function TasksApp({ list: openList }) {
  const mode = useVfs(s => s.mode), cloud = mode === "cloud";
  const st = useMemo(() => store(cloud), [cloud]);
  const [data, setData] = useState({ lists: [], worlds: [], tasks: [] });
  const [view, setView] = useState(openList || "today");
  const [sel, setSel] = useState(null), [text, setText] = useState(""), [showDone, setShowDone] = useState(false), [newList, setNewList] = useState(null);
  const load = () => st.load().then(d => { setData(d); return d; }).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, [st]);
  useEffect(() => cloud ? onServer(["tasks", "world"], () => load()) : undefined, [cloud]);
  useEffect(() => { if (openList) setView(openList); }, [openList]);
  const list = data.lists.find(l => l.id === view);
  const t0 = today0();
  const shown = data.tasks.filter(t => view === "today" ? (t.due && t.due < t0 + DAY && !t.done) || (t.done && t.doneAt > t0)
    : view === "upcoming" ? t.due && t.due >= t0 && !t.done : t.listId === view);
  const open = shown.filter(t => !t.done), done = shown.filter(t => t.done);
  const add = async () => { const title = text.trim(); if (!title) return; const listId = list ? list.id : data.lists.find(l => !l.worldId)?.id; setText("");
    try { await st.add({ listId, title, due: view === "today" ? t0 + 18 * 3600000 : undefined }); load(); } catch (e) { toast(e.message, { error: true }); } };
  const upd = async (t, b) => { try { await st.update(t.id, b); load(); } catch (e) { toast(e.message, { error: true }); } };
  const count = (id) => data.tasks.filter(t => (id === "today" ? t.due && t.due < t0 + DAY : id === "upcoming" ? t.due && t.due >= t0 : t.listId === id) && !t.done).length;
  const cur = data.tasks.find(t => t.id === sel);
  return (
    <div className="app tasks-app">
      <div className="app-side">
        {[["today", "today", "Hoy"], ["upcoming", "event_upcoming", "Próximas"]].map(([id, icon, label]) =>
          <div key={id} className={"side-item" + (view === id ? " active" : "")} onClick={() => { setView(id); setSel(null); }}><Ic name={icon} /><span style={{ flex: 1 }}>{label}</span><span className="task-count">{count(id) || ""}</span></div>)}
        <div className="side-label">Mis listas</div>
        {data.lists.filter(l => !l.worldId).map(l => <div key={l.id} className={"side-item" + (view === l.id ? " active" : "")} onClick={() => { setView(l.id); setSel(null); }}>
          <i className="list-dot" style={{ background: l.color }} /><span style={{ flex: 1 }}>{l.name}</span><span className="task-count">{count(l.id) || ""}</span></div>)}
        {data.lists.some(l => l.worldId) && <div className="side-label">Listas de Mundos</div>}
        {data.lists.filter(l => l.worldId).map(l => <div key={l.id} className={"side-item" + (view === l.id ? " active" : "")} onClick={() => { setView(l.id); setSel(null); }}>
          <Ic name="diversity_3" size={17} /><span style={{ flex: 1 }}>{l.name}<span className="faint" style={{ fontSize: 11 }}> · {l.world}</span></span><span className="task-count">{count(l.id) || ""}</span></div>)}
        <button className="cal-add" onClick={() => setNewList({ name: "", worldId: "" })}><Ic name="add" size={15} /> Lista</button>
      </div>
      <div className="app-main tasks-main">
        <div className="tasks-head">
          <h2>{view === "today" ? "Hoy" : view === "upcoming" ? "Próximas" : list?.name}</h2>
          {list?.world && <span className="faint">Lista compartida del mundo {list.world}</span>}
          <div className="tb-spacer" />
          {list && <button className="tb-btn icon" title="Eliminar lista" onClick={async () => { try { await st.delList(list.id); setView("today"); load(); } catch (e) { toast(e.message, { error: true }); } }}><Ic name="delete" /></button>}
        </div>
        <div className="task-add"><Ic name="add_task" /><input placeholder={view === "today" ? "Añadir una tarea para hoy" : "Añadir una tarea"} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} /></div>
        <div className="scroll" style={{ flex: 1 }}>
          {open.map(t => <TaskRow key={t.id} t={t} sel={sel === t.id} lists={data.lists} showList={!list} onSel={() => setSel(t.id)} onDone={() => upd(t, { done: true })} />)}
          {!open.length && <EmptyState icon="task_alt" text={view === "today" ? "Nada pendiente para hoy" : "Sin tareas pendientes"} />}
          {done.length > 0 && <button className="tasks-done-toggle" onClick={() => setShowDone(s => !s)}><Ic name={showDone ? "expand_more" : "chevron_right"} size={18} /> Completadas ({done.length})</button>}
          {showDone && done.map(t => <TaskRow key={t.id} t={t} sel={sel === t.id} lists={data.lists} showList={!list} onSel={() => setSel(t.id)} onDone={() => upd(t, { done: false })} />)}
        </div>
      </div>
      {cur && <TaskDetail key={cur.id} t={cur} data={data} st={st} cloud={cloud} onUpdate={(b) => upd(cur, b)} onClose={() => setSel(null)}
        onDelete={async () => { await st.remove(cur.id); setSel(null); load(); toast("Tarea eliminada", { icon: "delete" }); }} />}
      {newList && <Modal title="Nueva lista" icon="playlist_add" onClose={() => setNewList(null)} width={380}
        actions={<><button className="tb-btn" onClick={() => setNewList(null)}>Cancelar</button><button className="tb-btn primary" disabled={!newList.name.trim()}
          onClick={async () => { try { await st.addList({ name: newList.name, worldId: newList.worldId || undefined }); setNewList(null); load(); } catch (e) { toast(e.message, { error: true }); } }}>Crear</button></>}>
        <div style={{ display: "grid", gap: 10 }}>
          <label className="field">Nombre<input autoFocus value={newList.name} onChange={e => setNewList({ ...newList, name: e.target.value })} /></label>
          {cloud && data.worlds.length > 0 && <label className="field">Compartir con un mundo<select className="sc-input" style={{ margin: 0 }} value={newList.worldId} onChange={e => setNewList({ ...newList, worldId: e.target.value })}>
            <option value="">Solo para mí</option>{data.worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
        </div></Modal>}
    </div>
  );
}

function TaskRow({ t, sel, onSel, onDone, lists, showList }) {
  const due = dueLabel(t.due), l = lists.find(x => x.id === t.listId);
  return (
    <div className={"task-row" + (t.done ? " done" : "") + (sel ? " sel" : "")} onClick={onSel}>
      <button className="task-check" onClick={e => { e.stopPropagation(); onDone(); }} title={t.done ? "Marcar pendiente" : "Completar"} style={{ "--p": PRIO[t.priority || 0][1] }}>{t.done && <Ic name="check" size={14} />}</button>
      <div className="task-main"><span className="task-title">{t.title}</span>
        <span className="task-meta">{due && <span className={"task-due " + due[1]}><Ic name="event" size={13} /> {due[0]}</span>}
          {t.priority > 0 && <span style={{ color: PRIO[t.priority][1] }}><Ic name="flag" size={13} /> {PRIO[t.priority][0]}</span>}
          {showList && l && <span className="faint">{l.name}</span>}{t.comments > 0 && <span className="faint"><Ic name="chat_bubble" size={12} /> {t.comments}</span>}</span></div>
      {t.assignee && <span title={"Asignada a " + t.assignee.name}><PersonAvatar name={t.assignee.name} size={24} /></span>}
    </div>
  );
}

function TaskDetail({ t, data, st, cloud, onUpdate, onClose, onDelete }) {
  const [title, setTitle] = useState(t.title), [notes, setNotes] = useState(t.notes || ""), [comments, setComments] = useState([]), [c, setC] = useState("");
  const list = data.lists.find(l => l.id === t.listId);
  const [members, setMembers] = useState([]);
  useEffect(() => { if (cloud) st.comments(t.id).then(setComments).catch(() => {}); if (cloud && list?.worldId) api("GET", "worlds/" + list.worldId).then(r => setMembers(r.members || [])).catch(() => {}); }, [t.id, t.comments]);
  return (
    <div className="task-detail">
      <div className="task-detail-head"><button className={"task-check big" + (t.done ? " on" : "")} onClick={() => onUpdate({ done: !t.done })}>{t.done && <Ic name="check" size={16} />}</button>
        <input className="ev-title" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && onUpdate({ title })} />
        <button className="tb-btn icon" onClick={onClose}><Ic name="close" /></button></div>
      <div className="ev-row"><Ic name="event" size={18} /><input type="date" value={dateIn(t.due)} onChange={e => { const [y, m, d] = e.target.value.split("-").map(Number); onUpdate({ due: e.target.value ? new Date(y, m - 1, d, 18).getTime() : null }); }} />
        {t.due && <button className="tb-btn icon" title="Quitar fecha" onClick={() => onUpdate({ due: null })}><Ic name="close" size={16} /></button>}</div>
      <div className="ev-row"><Ic name="flag" size={18} />{PRIO.map(([l, col], i) => <button key={l} className={"chip" + ((t.priority || 0) === i ? " on" : "")} style={{ "--chip": col }} onClick={() => onUpdate({ priority: i })}>{l}</button>)}</div>
      <div className="ev-row"><Ic name="list" size={18} /><select value={t.listId} onChange={e => onUpdate({ listId: e.target.value })}>{data.lists.map(l => <option key={l.id} value={l.id}>{l.name}{l.world ? ` · ${l.world}` : ""}</option>)}</select></div>
      {list?.worldId && <div className="ev-row"><Ic name="person" size={18} /><select value={t.assignee?.id || ""} onChange={e => onUpdate({ assignee: e.target.value || null })}>
        <option value="">Sin asignar</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
      <div className="ev-row top"><Ic name="notes" size={18} /><textarea rows={4} placeholder="Notas" value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (t.notes || "") && onUpdate({ notes })} /></div>
      {cloud && <div className="task-comments"><div className="side-label">Comentarios</div>
        {comments.map(k => <div key={k.id} className="post-comment"><PersonAvatar name={k.author} size={24} /><div><b>{k.author}</b> <span className="faint">{timeAgo(k.created)}</span><div>{k.text}</div></div></div>)}
        <div className="post-reply"><input placeholder="Escribe un comentario…" value={c} onChange={e => setC(e.target.value)} onKeyDown={async e => { if (e.key === "Enter" && c.trim()) { try { await st.comment(t.id, c); setC(""); setComments(await st.comments(t.id)); } catch (err) { toast(err.message, { error: true }); } } }} /></div></div>}
      <div className="faint" style={{ fontSize: 11.5, marginTop: "auto" }}>{t.creator ? `Creada por ${t.creator} · ` : ""}{new Date(t.created).toLocaleDateString("es-CO")}</div>
      <button className="tb-btn danger" onClick={onDelete}><Ic name="delete" /> Eliminar tarea</button>
    </div>
  );
}
