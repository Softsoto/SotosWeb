/* ============================================================
   Sotos — Administración (cuentas con rol de administrador)
   Resumen del servidor, usuarios (cuota, rol, desactivar, apps
   visibles, contraseña, sesiones) y ajustes del servidor.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, Modal, EmptyState, Tile, toast } from "./ui.jsx";
import { api } from "./api.js";
import * as vfs from "./vfs.js";
import { fmtSize, fmtDate, useVfs } from "./vfs.js";
import { APPS } from "./data.jsx";
import { PersonAvatar } from "./contacts.jsx";
const { useState, useEffect } = React;

const dur = (s) => s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} días`;
const MANAGEABLE = () => APPS.filter(a => !["launchpad", "web", "settings", "files", "admin", "trash"].includes(a.id));

export function AdminApp() {
  const user = useVfs(s => s.user);
  const [tab, setTab] = useState("resumen");
  const [stats, setStats] = useState(null), [users, setUsers] = useState(null);
  const [q, setQ] = useState(""), [edit, setEdit] = useState(null), [files, setFiles] = useState(null), [creating, setCreating] = useState(false), [confirm, setConfirm] = useState(null);
  // si el servidor se está reiniciando, se reintenta solo unas veces antes de mostrar el error
  const retry = (fn, n = 5) => fn().catch(e => n > 0 && (e.status === 0 || e.status >= 500 || !e.status) ? new Promise(r => setTimeout(r, 1500)).then(() => retry(fn, n - 1)) : Promise.reject(e));
  const [loadErr, setLoadErr] = useState(null);
  const loadStats = () => retry(() => api("GET", "admin/stats")).then(setStats).catch(e => setLoadErr(e.message));
  const loadUsers = () => retry(() => api("GET", "admin/users")).then(r => { setUsers(r.items); setLoadErr(null); }).catch(e => setLoadErr(e.message));
  useEffect(() => { if (user?.role === "admin") { loadStats(); loadUsers(); } }, [user?.role]);
  if (user?.role !== "admin") return <div className="app"><EmptyState icon="admin_panel_settings" text="Solo las cuentas administradoras pueden abrir este panel" /></div>;

  const patch = async (u, body, msg) => { try { await api("PUT", "admin/users/" + u.id, body); msg && toast(msg, { icon: "check" }); loadUsers(); loadStats(); } catch (e) { toast(e.message, { error: true }); } };
  const list = (users || []).filter(u => (u.name + " " + u.email).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="app admin-app">
      <div className="app-side">
        <div className="side-label">Administración</div>
        {[["resumen", "monitoring", "Resumen"], ["usuarios", "group", "Usuarios"], ["registro", "history", "Registro"], ["servidor", "dns", "Servidor"]].map(([id, icon, label]) =>
          <div key={id} className={"side-item" + (tab === id ? " active" : "")} onClick={() => setTab(id)}><Ic name={icon} /><span>{label}</span></div>)}
      </div>
      <div className="app-main scroll" style={{ padding: "18px 22px" }}>
        {loadErr && <div className="admin-warn soft" style={{ marginBottom: 12 }}><Ic name="cloud_off" /><div>No se pudo cargar el panel: {loadErr}. <button className="tb-btn" onClick={() => { setLoadErr(null); loadStats(); loadUsers(); }}>Reintentar</button></div></div>}
        {!users && !loadErr && tab === "usuarios" && <div className="faint" style={{ padding: 10 }}>Cargando cuentas…</div>}
        {tab === "resumen" && stats && <>
          <h2 className="admin-h">Resumen del servidor</h2>
          <div className="admin-cards">
            {[["group", "Usuarios", stats.users, `${stats.seen24h} activos en 24 h`], ["devices", "Sesiones abiertas", stats.active, "personas con sesión"], ["cloud", "Almacenamiento", fmtSize(stats.storage), stats.disk ? `${fmtSize(stats.disk.free)} libres en disco` : ""],
              ["diversity_3", "Mundos", stats.worlds, `${stats.shares} enlaces compartidos`], ["inbox", "Envíos pendientes", stats.inboxPending, "en bandejas de entrada"], ["memory", "Servidor", fmtSize(stats.server.memory), `Node ${stats.server.node} · encendido hace ${dur(stats.server.uptime)}`]]
              .map(([icon, label, value, sub]) => <div key={label} className="admin-card"><Ic name={icon} /><span className="faint">{label}</span><b>{value}</b><span className="faint">{sub}</span></div>)}
          </div>
          {stats.disk && <div className="admin-disk"><span>Disco del servidor</span><div className="admin-bar"><i style={{ width: Math.max(2, 100 - stats.disk.free / stats.disk.total * 100) + "%" }} /></div><span className="faint">{fmtSize(stats.disk.total - stats.disk.free)} usados de {fmtSize(stats.disk.total)}</span></div>}
        </>}

        {tab === "usuarios" && <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <h2 className="admin-h" style={{ margin: 0, flex: 1 }}>Usuarios <span className="faint">{users?.length || 0}</span></h2>
            <div className="search-box" style={{ width: 220 }}><Ic name="search" size={16} /><input placeholder="Buscar" value={q} onChange={e => setQ(e.target.value)} /></div>
            <button className="tb-btn primary" onClick={() => setCreating(true)}><Ic name="person_add" /> Nuevo usuario</button>
          </div>
          <div className="admin-table">
            <div className="admin-row head"><span>Persona</span><span>Espacio</span><span>Última actividad</span><span>Rol</span><span /></div>
            {list.map(u => (
              <div key={u.id} className={"admin-row" + (u.disabled ? " off" : "")}>
                <span className="admin-who"><PersonAvatar name={u.name} avatar={u.avatar} size={30} /><span><b>{u.name}{u.id === user.id ? " (tú)" : ""}</b><span className="faint">{u.email}</span></span></span>
                <span><div className="admin-bar sm"><i style={{ width: Math.min(100, Math.max(1, u.used / u.quota * 100)) + "%" }} /></div><span className="faint">{fmtSize(u.used)} de {fmtSize(u.quota)}</span></span>
                <span className="faint">{u.disabled ? "Desactivada" : u.lastSeen ? fmtDate(u.lastSeen) : "nunca"}{u.sessions ? ` · ${u.sessions} sesión(es)` : ""}</span>
                <span><span className={"member-role" + (u.role === "admin" ? " owner" : "")}>{u.role === "admin" ? "Administrador" : "Usuario"}</span></span>
                <span><button className="tb-btn" onClick={() => setEdit(u)}><Ic name="tune" /> Gestionar</button></span>
              </div>))}
          </div>
        </>}

        {tab === "servidor" && stats && <ServerSettings stats={stats} onSaved={loadStats} />}
        {tab === "registro" && <AuditLog />}
      </div>

      {files && <UserFiles u={files} onClose={() => setFiles(null)} onChanged={() => { loadUsers(); loadStats(); }} />}
      {edit && <UserEditor u={edit} me={user} onFiles={() => setFiles(edit)} onClose={() => setEdit(null)} patch={(b, m) => patch(edit, b, m).then(() => setEdit(x => x && { ...x, ...b }))}
        onPassword={async (pw) => { try { await api("POST", `admin/users/${edit.id}/password`, { password: pw }); toast("Contraseña cambiada; sus sesiones se cerraron", { icon: "key" }); } catch (e) { toast(e.message, { error: true }); } }}
        onLogout={async () => { await api("POST", `admin/users/${edit.id}/logout`, {}); toast("Sesiones cerradas", { icon: "logout" }); loadUsers(); }}
        onDelete={() => setConfirm(edit)} />}
      {creating && <UserCreator onClose={() => setCreating(false)} onDone={() => { setCreating(false); loadUsers(); loadStats(); }} />}
      {confirm && <Modal title={`¿Eliminar la cuenta de ${confirm.name}?`} icon="person_remove" onClose={() => setConfirm(null)}
        actions={<><button className="tb-btn" onClick={() => setConfirm(null)}>Cancelar</button><button className="tb-btn danger" onClick={async () => { try { await api("DELETE", "admin/users/" + confirm.id); toast("Cuenta eliminada", { icon: "delete" }); setConfirm(null); setEdit(null); loadUsers(); loadStats(); } catch (e) { toast(e.message, { error: true }); } }}>Eliminar para siempre</button></>}>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>Se borran sus archivos, mundos propios, contactos y enlaces. <b>No se puede deshacer.</b></div></Modal>}
    </div>
  );
}

function UserEditor({ u, me, onClose, onFiles, patch, onPassword, onLogout, onDelete }) {
  const [quota, setQuota] = useState(Math.round(u.quota / 1048576)), [pw, setPw] = useState(""), [demote, setDemote] = useState(null);
  const hidden = new Set(u.hiddenApps || []);
  const self = u.id === me.id;
  return (
    <Modal title={u.name} icon="manage_accounts" onClose={onClose} width={560} actions={<button className="tb-btn" onClick={onClose}>Cerrar</button>}>
      <div className="admin-edit">
        <div className="faint" style={{ marginTop: -6 }}>{u.email} · creada {fmtDate(u.created)}</div>
        <div className="admin-line"><span>Cuota de espacio</span><input className="sc-input" type="number" min={10} value={quota} onChange={e => setQuota(e.target.value)} style={{ width: 110, margin: 0 }} /><span className="faint">MB</span>
          <button className="tb-btn" onClick={() => patch({ quotaMb: +quota }, "Cuota actualizada")}>Guardar</button></div>
        <div className="admin-line"><span>Rol</span>
          <button className={"chip" + (u.role === "user" ? " on" : "")} onClick={() => self && u.role === "admin" ? setDemote("") : patch({ role: "user" }, "Ahora es usuario")}>Usuario</button>
          <button className={"chip" + (u.role === "admin" ? " on" : "")} onClick={() => patch({ role: "admin" }, "Ahora es administrador")}>Administrador</button></div>
        {!self && <div className="admin-line"><span>Cuenta</span>
          <button className={"chip" + (!u.disabled ? " on" : "")} onClick={() => patch({ disabled: false }, "Cuenta activada")}>Activa</button>
          <button className={"chip" + (u.disabled ? " on" : "")} style={{ "--chip": "#d9452f" }} onClick={() => patch({ disabled: true }, "Cuenta desactivada y sesiones cerradas")}>Desactivada</button></div>}
        <div className="admin-line"><span>Archivos</span><button className="tb-btn" onClick={onFiles}><Ic name="folder_open" /> Ver sus archivos</button><span className="faint">{fmtSize(u.used)} usados</span></div>
        {demote !== null && <div className="admin-warn"><Ic name="warning" /><div><b>Vas a dejar de ser administrador.</b> Perderás este panel y no podrás devolverte el rol: solo otro administrador podría hacerlo.
          <div className="admin-line" style={{ marginTop: 8 }}><input className="sc-input" type="password" autoComplete="current-password" placeholder="Tu contraseña" value={demote} onChange={e => setDemote(e.target.value)} style={{ flex: 1, margin: 0 }} />
            <button className="tb-btn" onClick={() => setDemote(null)}>Cancelar</button>
            <button className="tb-btn danger" disabled={!demote} onClick={async () => { await patch({ role: "user", password: demote }, "Ya no eres administrador"); setDemote(null); }}>Confirmar</button></div></div></div>}
        <div className="admin-sub">Apps de su escritorio</div>
        <div className="faint" style={{ fontSize: 12, marginTop: -4 }}>Como en un lugar de trabajo: elige qué apps ve esta persona.</div>
        <div className="admin-apps">
          {MANAGEABLE().map(a => {
            const on = !hidden.has(a.id);
            return <button key={a.id} className={"admin-app" + (on ? " on" : "")} onClick={() => { const n = new Set(hidden); on ? n.add(a.id) : n.delete(a.id); patch({ hiddenApps: [...n] }); }}>
              <Tile icon={a.icon} color={a.color} size={28} app={a.id} /><span>{a.name}</span><Ic name={on ? "check_circle" : "block"} size={16} /></button>;
          })}
        </div>
        <div className="admin-sub">Seguridad</div>
        <div className="admin-line"><input className="sc-input" type="password" autoComplete="new-password" placeholder="Nueva contraseña (mín. 8)" value={pw} onChange={e => setPw(e.target.value)} style={{ flex: 1, margin: 0 }} />
          <button className="tb-btn" disabled={pw.length < 8} onClick={() => { onPassword(pw); setPw(""); }}><Ic name="key" /> Cambiar</button></div>
        <div className="admin-line"><button className="tb-btn" onClick={onLogout}><Ic name="logout" /> Cerrar todas sus sesiones</button>
          {!self && <button className="tb-btn danger" onClick={onDelete}><Ic name="delete" /> Eliminar cuenta</button>}</div>
      </div>
    </Modal>
  );
}

/* archivos de una persona: para revisar contenido que infrinja derechos de autor o las normas del servidor */
function UserFiles({ u, onClose, onChanged }) {
  const [items, setItems] = useState(null), [q, setQ] = useState(""), [del, setDel] = useState(null);
  const load = () => api("GET", `admin/users/${u.id}/files`).then(r => setItems(r.items)).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, []);
  const list = (items || []).filter(f => f.path.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={`Archivos de ${u.name}`} icon="folder_open" onClose={onClose} width={820} actions={<button className="tb-btn" onClick={onClose}>Cerrar</button>}>
      <div className="admin-warn soft"><Ic name="policy" /><div>Úsalo solo para revisar contenido que infrinja derechos de autor o las normas de este servidor. Cada vez que abres o eliminas un archivo queda en el <b>Registro</b>, y la persona recibe un aviso con el motivo cuando eliminas algo.</div></div>
      <div className="search-box" style={{ margin: "10px 0" }}><Ic name="search" size={16} /><input placeholder="Buscar por nombre o carpeta" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="admin-files">
        {!items && <div className="faint" style={{ padding: 12 }}>Cargando…</div>}
        {items && !list.length && <EmptyState icon="folder_off" text="No hay archivos" />}
        {list.slice(0, 500).map(f => <div key={f.id} className="admin-file">
          <span className="admin-file-name" title={f.path}><b>{f.name}</b><span className="faint">{f.path.replace(/\/[^/]*$/, "") || "/"}{f.trashed ? " · en la papelera" : ""}</span></span>
          <span className="faint">{fmtSize(f.size)}</span><span className="faint">{fmtDate(f.mtime)}</span>
          <a className="tb-btn icon" title="Abrir o descargar" href={`/api/admin/users/${u.id}/files/${f.id}`} target="_blank" rel="noopener"><Ic name="open_in_new" /></a>
          <button className="tb-btn icon danger" title="Eliminar" onClick={() => setDel({ f, reason: "Posible infracción de derechos de autor" })}><Ic name="delete" /></button>
        </div>)}
      </div>
      {del && <Modal title={`¿Eliminar «${del.f.name}»?`} icon="delete" onClose={() => setDel(null)} width={460}
        actions={<><button className="tb-btn" onClick={() => setDel(null)}>Cancelar</button><button className="tb-btn danger" disabled={!del.reason.trim()} onClick={async () => { try { await api("DELETE", `admin/users/${u.id}/files/${del.f.id}`, { reason: del.reason }); toast("Archivo eliminado; la persona recibió el aviso", { icon: "delete" }); setDel(null); load(); onChanged(); } catch (e) { toast(e.message, { error: true }); } }}>Eliminar para siempre</button></>}>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>Se borra de su cuenta sin pasar por la papelera. <b>No se puede deshacer.</b> Este motivo le llegará como notificación:</div>
        <textarea className="sc-input" rows={3} style={{ width: "100%", margin: 0 }} value={del.reason} onChange={e => setDel({ ...del, reason: e.target.value })} />
      </Modal>}
    </Modal>
  );
}

function AuditLog() {
  const [items, setItems] = useState(null);
  useEffect(() => { api("GET", "admin/log").then(r => setItems(r.items)).catch(e => toast(e.message, { error: true })); }, []);
  return <>
    <h2 className="admin-h">Registro de administración</h2>
    <div className="faint" style={{ fontSize: 13, marginBottom: 10 }}>Quién vio, abrió o eliminó archivos y quién cambió roles o cuotas. No se puede borrar desde aquí.</div>
    <div className="admin-files">{(items || []).map(r => <div key={r.id} className="admin-file log">
      <span className="faint">{fmtDate(r.created)}</span><span><b>{r.admin}</b> · {r.action}{r.detail ? ": " + r.detail : ""}</span><span className="faint">{r.user}</span></div>)}
      {items && !items.length && <EmptyState icon="history" text="Aún no hay acciones registradas" />}</div>
  </>;
}

function UserCreator({ onClose, onDone }) {
  const [f, setF] = useState({ name: "", email: "", password: "", quotaMb: "", role: "user" }), [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await api("POST", "admin/users", { ...f, quotaMb: f.quotaMb ? +f.quotaMb : undefined }); toast(`Cuenta de ${f.name} creada`, { icon: "person_add" }); onDone(); } catch (e) { toast(e.message, { error: true }); setBusy(false); } };
  return (
    <Modal title="Nuevo usuario" icon="person_add" onClose={onClose} width={420}
      actions={<><button className="tb-btn" onClick={onClose}>Cancelar</button><button className="tb-btn primary" disabled={busy || !f.name || !f.email || f.password.length < 8} onClick={save}>Crear cuenta</button></>}>
      <div style={{ display: "grid", gap: 10 }}>
        <label className="field">Nombre<input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">Correo<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label className="field">Contraseña inicial<input type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
        <label className="field">Cuota (MB, opcional)<input type="number" min={10} placeholder="La de por defecto" value={f.quotaMb} onChange={e => setF({ ...f, quotaMb: e.target.value })} /></label>
        <div className="admin-line"><span>Rol</span>{[["user", "Usuario"], ["admin", "Administrador"]].map(([v, l]) => <button key={v} className={"chip" + (f.role === v ? " on" : "")} onClick={() => setF({ ...f, role: v })}>{l}</button>)}</div>
      </div>
    </Modal>
  );
}

function ServerSettings({ stats, onSaved }) {
  const [quota, setQuota] = useState(stats.settings.defaultQuotaMb);
  const save = async (b, msg) => { try { await api("PUT", "admin/settings", b); toast(msg, { icon: "check" }); onSaved(); } catch (e) { toast(e.message, { error: true }); } };
  return <>
    <h2 className="admin-h">Ajustes del servidor</h2>
    <div className="admin-line"><span>Registro de cuentas nuevas</span>
      <button className={"chip" + (stats.settings.registration === "open" ? " on" : "")} onClick={() => save({ registration: "open" }, "Registro abierto")}>Abierto</button>
      <button className={"chip" + (stats.settings.registration === "closed" ? " on" : "")} onClick={() => save({ registration: "closed" }, "Registro cerrado: solo el administrador crea cuentas")}>Cerrado</button></div>
    <div className="admin-line"><span>Cuota para cuentas nuevas</span><input className="sc-input" type="number" min={10} value={quota} onChange={e => setQuota(e.target.value)} style={{ width: 110, margin: 0 }} /><span className="faint">MB</span>
      <button className="tb-btn" onClick={() => save({ defaultQuotaMb: +quota }, "Cuota por defecto actualizada")}>Guardar</button></div>
    <div className="admin-sub">Equipo</div>
    <div className="faint" style={{ fontSize: 13, lineHeight: 1.7 }}>{stats.server.platform} · {stats.server.cpus} núcleos · Node {stats.server.node}<br />Sotos usa {fmtSize(stats.server.memory)} de memoria · encendido hace {dur(stats.server.uptime)}</div>
  </>;
}
