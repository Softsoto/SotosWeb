/* ============================================================
   Sotos — Mundos: espacios compartidos con muro, carpeta y chat
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { pickAsFiles } from "./filepicker.jsx";
import { Ic, EmptyState, Modal, toast, ContextMenu } from "./ui.jsx";
import { api, onServer } from "./api.js";
import * as vfs from "./vfs.js";
import { useVfs, fmtSize, fmtDate, typeOf, uniqueName } from "./vfs.js";
import { NodeGlyph, DRAG_MIME } from "./files-ui.jsx";
import { PersonAvatar } from "./contacts.jsx";
import { timeAgo } from "./notifications.jsx";
import { PresenceDot } from "./presence.jsx";
import { DEMO, SHOWCASE_URL } from "./config.js";
import { ROUTE } from "./data.jsx";
import { useOnlyOffice } from "./onlyoffice.jsx";
import { WorldCall } from "./call.jsx";
const { useState, useEffect, useRef, useCallback } = React;

const ICONS = ["diversity_3", "groups", "family_restroom", "school", "work", "sports_soccer", "music_note", "travel_explore", "pets", "rocket_launch", "palette", "restaurant"];
const COLORS = ["#c4532f", "#4f7a3a", "#2f5d8a", "#c9902a", "#7a3e6b", "#1f7a78"];
const meId = () => vfs.getState().user?.id;
const linkify = (t) => t.split(/(https?:\/\/[^\s]+)/g).map((p, i) => i % 2 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p);

/* contador de mensajes sin leer en todos los mundos (para el dock) */
export function useWorldsUnread() {
  const [n, setN] = useState(0);
  const mode = useVfs(s => s.mode);
  useEffect(() => {
    if (mode !== "cloud") { setN(0); return; }
    let t = null; const load = () => api("GET", "worlds").then(r => setN(r.items.reduce((s, w) => s + (w.unread || 0), 0))).catch(() => {});
    load(); const off = onServer(["world", "world-msg"], () => { clearTimeout(t); t = setTimeout(load, 400); });
    return () => { off(); clearTimeout(t); };
  }, [mode]);
  return n;
}

/* ---------------- app ---------------- */
export function WorldsApp({ worldId, tab, openItem }) {
  const mode = useVfs(s => s.mode);
  const [worlds, setWorlds] = useState(null);
  const [sel, setSel] = useState(worldId || null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => api("GET", "worlds").then(r => { setWorlds(r.items); return r.items; }).catch(e => { toast(e.message, { error: true }); setWorlds([]); }), []);
  useEffect(() => { if (mode === "cloud") load().then(l => { if (!sel && l?.length) setSel(l[0].id); }); }, [mode]);
  useEffect(() => { if (worldId) setSel(worldId); }, [worldId]);
  useEffect(() => mode === "cloud" ? onServer(["world", "world-msg"], (d, type) => {
    if (type === "world" && (d.kind === "deleted" || d.kind === "removed") && d.world === sel) { setSel(null); toast(d.kind === "deleted" ? "El mundo fue eliminado" : "Saliste del mundo", { icon: "info" }); }
    load();
  }) : undefined, [mode, sel]);

  if (mode !== "cloud") return (
    <div className="app worlds-app" style={{ flexDirection: "column" }}>
      <div className="worlds-intro">
        <div className="worlds-intro-icon"><Ic name="diversity_3" size={44} /></div>
        <h2>Mundos</h2>
        <p>Espacios compartidos con tu familia, amigos o equipo: un <b>muro</b> para publicar, una <b>carpeta</b> en común y un <b>chat</b> en vivo.</p>
        <p className="muted">{DEMO ? "En el demo no hay servidor, así que los Mundos no están disponibles. Con Sotos instalado y una cuenta podrás crearlos e invitar a otras personas." : "Inicia sesión con una cuenta de Sotos para crear mundos e invitar a otras personas."}</p>
        {DEMO && <a className="tb-btn primary" href={SHOWCASE_URL} target="_blank" rel="noopener"><Ic name="info" /> Conocer Sotos</a>}
      </div>
    </div>
  );
  const cur = worlds?.find(w => w.id === sel);
  return (
    <div className="app worlds-app">
      <div className="app-side worlds-side">
        <div className="side-label" style={{ display: "flex", alignItems: "center" }}>Mis mundos<div className="tb-spacer" />
          <button className="tb-btn icon" title="Nuevo mundo" onClick={() => setCreating(true)}><Ic name="add" /></button></div>
        {(worlds || []).map(w => (
          <div key={w.id} className={"world-row" + (sel === w.id ? " on" : "")} onClick={() => setSel(w.id)}>
            <span className="world-tile" style={{ background: w.color }}><Ic name={w.icon} size={18} /></span>
            <span className="world-row-text"><b>{w.name}</b><span className="faint">{w.members} miembro{w.members === 1 ? "" : "s"} · {timeAgo(w.activity)}</span></span>
            {w.unread > 0 && <span className="world-unread">{w.unread}</span>}
          </div>
        ))}
        {worlds && !worlds.length && <div className="faint" style={{ fontSize: 12.5, padding: "8px 10px", lineHeight: 1.5 }}>Aún no estás en ningún mundo. Crea uno e invita a tu familia, tus amigos o tu equipo.</div>}
      </div>
      <div className="app-main">
        {cur ? <WorldView key={cur.id} w={cur} initialTab={worldId === cur.id ? tab : null} onChanged={load} onGone={() => { setSel(null); load(); }} openItem={openItem} />
          : <EmptyState icon="diversity_3" text={worlds?.length ? "Elige un mundo" : "Crea tu primer mundo"} />}
      </div>
      {creating && <WorldForm onClose={() => setCreating(false)} onSaved={(w) => { setCreating(false); load().then(() => setSel(w.id)); }} />}
    </div>
  );
}

function WorldForm({ w, onClose, onSaved }) {
  const [f, setF] = useState({ name: w?.name || "", description: w?.description || "", icon: w?.icon || "diversity_3", color: w?.color || COLORS[0] });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = w ? await api("PUT", "worlds/" + w.id, f) : await api("POST", "worlds", f); onSaved(r.item); toast(w ? "Mundo actualizado" : `Mundo “${r.item.name}” creado`, { icon: "diversity_3" }); }
    catch (e) { toast(e.message, { error: true }); setBusy(false); }
  };
  return (
    <Modal title={w ? "Editar mundo" : "Nuevo mundo"} icon="diversity_3" onClose={onClose} width={440}
      actions={<><button className="tb-btn" onClick={onClose}>Cancelar</button><button className="tb-btn primary" disabled={busy || !f.name.trim()} onClick={save}><Ic name="check" /> {w ? "Guardar" : "Crear"}</button></>}>
      <div style={{ display: "grid", gap: 12 }}>
        <label className="field">Nombre<input autoFocus maxLength={60} placeholder="Familia, Proyecto final, Equipo de fútbol…" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} onKeyDown={e => e.key === "Enter" && f.name.trim() && save()} /></label>
        <label className="field">Descripción<input maxLength={300} placeholder="Opcional" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
        <div className="field">Icono<div className="world-icons">{ICONS.map(i => <button key={i} className={"world-pick" + (f.icon === i ? " on" : "")} onClick={() => setF({ ...f, icon: i })} style={{ background: f.icon === i ? f.color : undefined }}><Ic name={i} size={20} /></button>)}</div></div>
        <div className="field">Color<div className="world-icons">{COLORS.map(c => <button key={c} className={"bg-swatch" + (f.color === c ? " on" : "")} style={{ background: c }} onClick={() => setF({ ...f, color: c })} />)}</div></div>
      </div>
    </Modal>
  );
}

/* ---------------- un mundo ---------------- */
function WorldView({ w, initialTab, onChanged, onGone, openItem }) {
  const [tab, setTab] = useState(initialTab || "wall");
  const [info, setInfo] = useState(null), [inCall, setInCall] = useState(false), [callers, setCallers] = useState(0);
  const loadInfo = () => api("GET", "worlds/" + w.id).then(setInfo).catch(() => {});
  useEffect(() => { api("GET", `worlds/${w.id}/call`).then(r => setCallers(r.participants.length)).catch(() => {}); return onServer("call", (d) => { if (d.world === w.id && d.participants) setCallers(d.participants.length); }); }, [w.id]);
  useEffect(() => { loadInfo(); }, [w.id]);
  useEffect(() => onServer("world", (d) => { if (d.world === w.id && (d.kind === "members" || d.kind === "meta")) loadInfo(); }), [w.id]);
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const owner = w.role === "owner";
  const tabs = [["wall", "Muro", "forum"], ["files", "Archivos", "folder_shared"], ["chat", "Chat", "chat"], ["call", "Llamada", "video_call"], ["members", "Miembros", "group"], ...(owner ? [["settings", "Ajustes", "tune"]] : [])];
  return (
    <div className="world-view">
      <div className="world-head" style={{ "--world": w.color }}>
        <span className="world-tile big" style={{ background: w.color }}><Ic name={w.icon} size={30} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="world-title">{w.name}</div>
          <div className="muted world-desc">{w.description || "Espacio compartido"}</div>
        </div>
        <div className="world-faces">{(info?.members || []).slice(0, 6).map(m => <span key={m.id} title={m.name}><PersonAvatar name={m.name} size={28} /></span>)}
          {(info?.members?.length || 0) > 6 && <span className="faint" style={{ fontSize: 12 }}>+{info.members.length - 6}</span>}</div>
      </div>
      <div className="world-tabs">{tabs.map(([id, label, icon]) => <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><Ic name={icon} size={17} /> {label}{id === "chat" && w.unread > 0 && tab !== "chat" && <span className="world-unread sm">{w.unread}</span>}{id === "call" && (inCall || callers > 0) && <span className="call-live" title={inCall ? "Estás en la llamada" : "Hay una llamada en curso"} />}</button>)}</div>
      <div className="world-body">
        <WorldCall w={w} visible={tab === "call"} onActive={setInCall} />
        {tab === "wall" && <WorldWall w={w} owner={owner} />}
        {tab === "files" && <WorldFiles w={w} openItem={openItem} />}
        {tab === "chat" && <WorldChat w={w} onRead={onChanged} />}
        {tab === "members" && <WorldMembers w={w} info={info} owner={owner} onChanged={() => { loadInfo(); onChanged(); }} onGone={onGone} />}
        {tab === "settings" && owner && <WorldSettings w={w} onChanged={onChanged} onGone={onGone} />}
      </div>
    </div>
  );
}

function WorldWall({ w, owner }) {
  const [posts, setPosts] = useState(null);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState({});
  const load = () => api("GET", `worlds/${w.id}/posts`).then(r => setPosts(r.items)).catch(() => setPosts([]));
  useEffect(() => { load(); }, [w.id]);
  useEffect(() => onServer("world", (d) => { if (d.world === w.id && d.kind === "posts") load(); }), [w.id]);
  const post = async () => { if (!text.trim()) return; try { await api("POST", `worlds/${w.id}/posts`, { text }); setText(""); load(); } catch (e) { toast(e.message, { error: true }); } };
  const comment = async (pid) => { const t = drafts[pid]; if (!t?.trim()) return; try { await api("POST", `worlds/${w.id}/posts/${pid}/comments`, { text: t }); setDrafts(d => ({ ...d, [pid]: "" })); load(); } catch (e) { toast(e.message, { error: true }); } };
  const del = async (pid) => { try { await api("DELETE", `worlds/${w.id}/posts/${pid}`); load(); } catch (e) { toast(e.message, { error: true }); } };
  return (
    <div className="scroll world-wall">
      <div className="post-composer">
        <textarea rows={3} maxLength={5000} placeholder={`Comparte algo con “${w.name}”…`} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) post(); }} />
        <div style={{ display: "flex", alignItems: "center" }}><span className="faint" style={{ fontSize: 11.5 }}>Ctrl + Enter para publicar</span><div className="tb-spacer" /><button className="tb-btn primary" disabled={!text.trim()} onClick={post}><Ic name="send" /> Publicar</button></div>
      </div>
      {posts?.map(p => (
        <div key={p.id} className="post-card">
          <div className="post-head"><PersonAvatar name={p.author} size={34} /><div style={{ flex: 1 }}><b>{p.author}</b><div className="faint" style={{ fontSize: 12 }}>{timeAgo(p.created)}</div></div>
            {(p.user === meId() || owner) && <button className="tb-btn icon" title="Borrar publicación" onClick={() => del(p.id)}><Ic name="delete" size={17} /></button>}</div>
          <div className="post-text">{linkify(p.text)}</div>
          <div className="post-comments">
            {p.comments.map(c => <div key={c.id} className="post-comment"><PersonAvatar name={c.author} size={24} /><div><b>{c.author}</b> <span className="faint">{timeAgo(c.created)}</span><div>{linkify(c.text)}</div></div></div>)}
            <div className="post-reply"><input placeholder="Escribe un comentario…" maxLength={2000} value={drafts[p.id] || ""} onChange={e => setDrafts(d => ({ ...d, [p.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && comment(p.id)} />
              <button className="tb-btn icon" disabled={!drafts[p.id]?.trim()} onClick={() => comment(p.id)}><Ic name="send" size={17} /></button></div>
          </div>
        </div>
      ))}
      {posts && !posts.length && <EmptyState icon="forum" text="El muro está vacío. ¡Publica lo primero!" />}
    </div>
  );
}

function WorldChat({ w, onRead }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const end = useRef(null);
  const markRead = () => api("POST", `worlds/${w.id}/read`, {}).then(onRead).catch(() => {});
  useEffect(() => { api("GET", `worlds/${w.id}/messages`).then(r => setMsgs(r.items)).catch(() => setMsgs([])); markRead(); }, [w.id]);
  useEffect(() => onServer("world-msg", (d) => { if (d.world === w.id) { setMsgs(m => m && !m.some(x => x.id === d.message.id) ? [...m, d.message] : m); if (d.message.user !== meId()) markRead(); } }), [w.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs?.length]);
  const send = async () => { const t = text.trim(); if (!t) return; setText(""); try { const r = await api("POST", `worlds/${w.id}/messages`, { text: t }); setMsgs(m => m.some(x => x.id === r.item.id) ? m : [...m, r.item]); } catch (e) { toast(e.message, { error: true }); setText(t); } };
  let lastDay = "";
  return (
    <div className="world-chat">
      <div className="scroll chat-scroll">
        {msgs?.map((m, i) => {
          const mine = m.user === meId(), day = new Date(m.created).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
          const showDay = day !== lastDay; lastDay = day;
          const grouped = i > 0 && msgs[i - 1].user === m.user && m.created - msgs[i - 1].created < 5 * 60_000 && !showDay;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="chat-day">{day[0].toUpperCase() + day.slice(1)}</div>}
              <div className={"chat-msg" + (mine ? " mine" : "") + (grouped ? " grouped" : "")}>
                {!mine && !grouped && <PersonAvatar name={m.author} size={28} />}
                <div className="chat-bubble">{!mine && !grouped && <b className="chat-author">{m.author}</b>}<span>{linkify(m.text)}</span>
                  <span className="chat-time">{new Date(m.created).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span></div>
              </div>
            </React.Fragment>);
        })}
        {msgs && !msgs.length && <EmptyState icon="chat" text="Todavía no hay mensajes" />}
        <div ref={end} />
      </div>
      <div className="chat-input"><input autoFocus placeholder={`Mensaje para ${w.name}`} maxLength={2000} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
        <button className="tb-btn icon primary" disabled={!text.trim()} onClick={send}><Ic name="send" /></button></div>
    </div>
  );
}

/* ---------------- carpeta del mundo ---------------- */
function WorldFiles({ w, openItem }) {
  const oo = useOnlyOffice();
  const [st, setSt] = useState(null);
  const [path, setPath] = useState([]); // ids de carpeta
  const [busy, setBusy] = useState(0);
  const [hot, setHot] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [preview, setPreview] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const up = useRef(null);
  const load = () => api("GET", `worlds/${w.id}/fs/state`).then(setSt).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, [w.id]);
  useEffect(() => onServer("world-fs", (d) => { if (d.world === w.id) load(); }), [w.id]);
  if (!st) return <EmptyState icon="hourglass_empty" text="Cargando carpeta…" />;
  const find = (n, id) => { if (n.id === id) return n; for (const c of n.children || []) { const f = find(c, id); if (f) return f; } return null; };
  const folder = path.length ? find(st.state.root, path[path.length - 1]) || st.state.root : st.state.root;
  const items = [...(folder.children || [])].sort((a, b) => (b.type === "folder") - (a.type === "folder") || a.name.localeCompare(b.name, "es"));
  const ops = (o) => api("POST", `worlds/${w.id}/fs/ops`, { ops: o }).then(load);
  const uploadBlob = async (name, blob, parent = folder) => {
    const id = vfs.newId();
    await api("PUT", `worlds/${w.id}/fs/blob/${id}`, blob);
    const nm = uniqueName(parent, name);
    await ops([{ t: "create", parent: parent.id, node: { id, name: nm, type: typeOf(nm), size: blob.size, ctime: Date.now(), mtime: Date.now() } }]);
  };
  const uploadFiles = async (files) => {
    setBusy(b => b + files.length);
    for (const f of files) { try { await uploadBlob(f.name, f); } catch (e) { toast(`${f.name}: ${e.message}`, { error: true }); } finally { setBusy(b => b - 1); } }
  };
  const onDrop = async (e) => {
    e.preventDefault(); setHot(false);
    const types = [...e.dataTransfer.types];
    if (types.includes(DRAG_MIME)) { // desde Archivos de Sotos: copiar el contenido al mundo
      const ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME) || "[]").map(vfs.node).filter(n => n && n.type !== "folder");
      setBusy(b => b + ids.length);
      for (const n of ids) { try { await uploadBlob(n.name, await vfs.read(n.id)); } catch (err) { toast(err.message, { error: true }); } finally { setBusy(b => b - 1); } }
      if (ids.length) toast(`${ids.length} archivo(s) compartido(s) en ${w.name}`, { icon: "folder_shared" });
    } else if (e.dataTransfer.files?.length) uploadFiles([...e.dataTransfer.files]);
  };
  const getBlob = async (n) => { const r = await api("GET", `worlds/${w.id}/fs/blob/${n.id}?v=${n.mtime || 0}`, null, { raw: true }); return new Blob([await r.arrayBuffer()], { type: vfs.mimeOf(n.name) }); };
  const download = async (n) => { const b = await getBlob(n); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = n.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 20_000); };
  const saveMine = async (n, open) => {
    const dest = vfs.resolve("/Descargas") || vfs.getState().root;
    const id = await vfs.create(dest.id, n.name, await getBlob(n));
    toast(`“${n.name}” guardado en ${dest.name}`, { icon: "download_done" });
    if (open) openItem(vfs.node(id));
  };
  const open = async (n) => {
    if (n.type === "folder") return setPath(p => [...p, n.id]);
    // Word, Excel y PowerPoint del mundo: se editan EN el mundo y a la vez con los demás miembros
    if (oo?.enabled && ["docx", "xlsx", "pptx"].includes(n.type)) return window.dispatchEvent(new CustomEvent("sotos-open-with", { detail: { app: ROUTE[n.type], payload: { world: w.id, sharedNode: n } } }));
    if (["img", "pdf", "video", "audio", "txt", "code"].includes(n.type)) { const b = await getBlob(n); setPreview({ n, url: URL.createObjectURL(b), text: ["txt", "code"].includes(n.type) ? await b.text() : null }); }
    else saveMine(n, true);
  };
  const remove = (n) => ops([{ t: "trash", ids: [n.id], at: Date.now() }, { t: "destroy", ids: [n.id] }]).then(() => toast(`“${n.name}” eliminado`, { icon: "delete" }));
  const mkdir = () => { const id = vfs.newId(); ops([{ t: "create", parent: folder.id, node: { id, name: uniqueName(folder, "Nueva carpeta"), type: "folder", children: [], ctime: Date.now(), mtime: Date.now() } }]).then(() => setRenaming({ id, name: "Nueva carpeta" })); };
  const rename = (n, name) => { const nm = name.trim(); if (nm && nm !== n.name) ops([{ t: "rename", id: n.id, name: uniqueName(folder, nm, n.id), type: n.type === "folder" ? undefined : typeOf(nm), mtime: Date.now() }]); setRenaming(null); };
  const crumbs = path.map(id => find(st.state.root, id)).filter(Boolean);
  return (
    <div className={"world-files" + (hot ? " hot" : "")} onDragOver={e => { e.preventDefault(); setHot(true); }} onDragLeave={e => { if (e.currentTarget === e.target) setHot(false); }} onDrop={onDrop}>
      <input ref={up} type="file" multiple style={{ display: "none" }} onChange={e => { const f = [...e.target.files]; e.target.value = ""; uploadFiles(f); }} />
      <div className="world-files-bar">
        <div className="breadcrumb"><span className="crumb" style={{ cursor: "pointer" }} onClick={() => setPath([])}>Carpeta del mundo</span>
          {crumbs.map((c, i) => <React.Fragment key={c.id}><Ic name="chevron_right" size={16} className="sep" /><span className="crumb" style={{ cursor: "pointer" }} onClick={() => setPath(path.slice(0, i + 1))}>{c.name}</span></React.Fragment>)}</div>
        <div className="tb-spacer" />
        {busy > 0 && <span className="faint" style={{ fontSize: 12 }}><Ic name="progress_activity" size={15} /> Subiendo {busy}…</span>}
        <button className="tb-btn icon" title="Nueva carpeta" onClick={mkdir}><Ic name="create_new_folder" /></button>
        <button className="tb-btn primary" onClick={async () => { const f = await pickAsFiles({ title: "Subir al mundo", multiple: true }); if (f?.length) uploadFiles(f); }}><Ic name="upload" /> Subir</button>
      </div>
      <div className="scroll" style={{ flex: 1 }}>
        <div className="file-list">
          {items.map(n => (
            <div key={n.id} className="file-row" style={{ gridTemplateColumns: "1fr 110px 90px" }} onDoubleClick={() => open(n)}
              onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, n }); }}>
              <span className="fl-name"><NodeGlyph node={n} size={20} />{renaming?.id === n.id
                ? <input className="rename-input" autoFocus defaultValue={n.name} onBlur={e => rename(n, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenaming(null); }} />
                : <div className="fname">{n.name}</div>}</span>
              <span>{fmtDate(n.mtime)}</span><span style={{ textAlign: "right" }}>{n.type === "folder" ? `${(n.children || []).length} el.` : fmtSize(n.size)}</span>
            </div>))}
        </div>
        {!items.length && <EmptyState icon="folder_shared" text="Carpeta vacía · arrastra aquí archivos de tu PC o de tu Sotos" />}
      </div>
      <div className="files-status"><span>{fmtSize(st.used)} de {fmtSize(st.quota)} · lo que subas aquí lo ven todos los miembros</span></div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y}
        items={[{ id: "open", label: "Abrir", icon: "open_in_new" }, ...(ctx.n.type !== "folder" ? [{ id: "mine", label: "Guardar en mis archivos", icon: "download_done" }, { id: "dl", label: "Descargar", icon: "download" }] : []),
          { sep: true }, { id: "ren", label: "Renombrar", icon: "drive_file_rename" }, { id: "del", label: "Eliminar para todos", icon: "delete", danger: true }]}
        onSelect={(id) => { const n = ctx.n; if (id === "open") open(n); if (id === "mine") saveMine(n); if (id === "dl") download(n); if (id === "ren") setRenaming(n); if (id === "del") remove(n); }}
        onClose={() => setCtx(null)} />}
      {preview && (
        <div className="gal-viewer" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
          <div className="gal-bar" onClick={e => e.stopPropagation()}><span className="gal-name">{preview.n.name}</span><div className="tb-spacer" />
            <button title="Guardar en mis archivos" onClick={() => saveMine(preview.n)}><Ic name="download_done" /></button>
            <button title="Descargar" onClick={() => download(preview.n)}><Ic name="download" /></button>
            <button title="Cerrar" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}><Ic name="close" /></button></div>
          <div className="gal-stage" onClick={e => e.stopPropagation()}>
            {preview.n.type === "img" && <img src={preview.url} alt={preview.n.name} />}
            {preview.n.type === "pdf" && <iframe title={preview.n.name} src={preview.url} style={{ width: "100%", height: "100%", border: 0, background: "#525659" }} />}
            {preview.n.type === "video" && <video src={preview.url} controls autoPlay style={{ maxWidth: "100%", maxHeight: "100%" }} />}
            {preview.n.type === "audio" && <audio src={preview.url} controls autoPlay />}
            {preview.text != null && <pre className="sp-text" style={{ maxWidth: 900, background: "var(--surface)", color: "var(--text)" }}>{preview.text}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}

function WorldMembers({ w, info, owner, onChanged, onGone }) {
  const [email, setEmail] = useState("");
  const [sugg, setSugg] = useState([]);
  useEffect(() => { api("GET", "contacts").then(r => setSugg(r.items.filter(c => c.sotos && c.email))).catch(() => {}); }, []);
  const invite = async (em) => { try { await api("POST", `worlds/${w.id}/members`, { email: em }); setEmail(""); onChanged(); toast("Invitación enviada", { icon: "person_add" }); } catch (e) { toast(e.message, { error: true }); } };
  const remove = async (m) => { try { await api("DELETE", `worlds/${w.id}/members/${m.id}`); if (m.id === meId()) onGone(); else onChanged(); } catch (e) { toast(e.message, { error: true }); } };
  const memberIds = new Set((info?.members || []).map(m => m.id));
  return (
    <div className="scroll world-members">
      {owner && <div className="member-invite">
        <Ic name="person_add" />
        <input list="sotos-contact-emails" type="email" placeholder="Correo de una cuenta de Sotos" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && email && invite(email)} />
        <datalist id="sotos-contact-emails">{sugg.filter(c => !memberIds.has(c.sotos.id)).map(c => <option key={c.id} value={c.email}>{c.name}</option>)}</datalist>
        <button className="tb-btn primary" disabled={!email} onClick={() => invite(email)}>Invitar</button>
      </div>}
      {(info?.members || []).map(m => (
        <div key={m.id} className="member-row">
          <span className="sendto-av"><PersonAvatar name={m.name} size={36} />{m.id !== meId() && <PresenceDot userId={m.id} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}><b>{m.name}{m.id === meId() ? " (tú)" : ""}</b><div className="faint" style={{ fontSize: 12 }}>{m.email} · desde {fmtDate(m.joined)}</div></div>
          <span className={"member-role" + (m.role === "owner" ? " owner" : "")}>{m.role === "owner" ? "Creador" : "Miembro"}</span>
          {m.role !== "owner" && (owner || m.id === meId()) && <button className="tb-btn" onClick={() => remove(m)}>{m.id === meId() ? "Salir" : "Quitar"}</button>}
        </div>
      ))}
    </div>
  );
}

function WorldSettings({ w, onChanged, onGone }) {
  const [edit, setEdit] = useState(false), [confirm, setConfirm] = useState(false);
  return (
    <div className="scroll" style={{ padding: "18px 24px" }}>
      <div className="member-row"><Ic name="edit" /><div style={{ flex: 1 }}><b>Nombre, descripción, icono y color</b></div><button className="tb-btn" onClick={() => setEdit(true)}>Editar</button></div>
      <div className="member-row"><Ic name="delete_forever" style={{ color: "#c4532f" }} /><div style={{ flex: 1 }}><b>Eliminar el mundo</b><div className="faint" style={{ fontSize: 12 }}>Se borran el muro, el chat y la carpeta para todos los miembros.</div></div><button className="tb-btn danger" onClick={() => setConfirm(true)}>Eliminar</button></div>
      {edit && <WorldForm w={w} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onChanged(); }} />}
      {confirm && <Modal title={`¿Eliminar “${w.name}”?`} icon="delete_forever" onClose={() => setConfirm(false)}
        actions={<><button className="tb-btn" onClick={() => setConfirm(false)}>Cancelar</button><button className="tb-btn danger" onClick={async () => { try { await api("DELETE", "worlds/" + w.id); onGone(); toast("Mundo eliminado", { icon: "delete" }); } catch (e) { toast(e.message, { error: true }); } }}>Eliminar para todos</button></>}>
        <div className="muted" style={{ fontSize: 13.5 }}>No se puede deshacer.</div></Modal>}
    </div>
  );
}
