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
import { loadInstalled } from "./installed.js";
import { PersonAvatar } from "./contacts.jsx";
const { useState, useEffect } = React;

const dur = (s) => s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} días`;
const MANAGEABLE = () => APPS.filter(a => !a.hidden && !["launchpad", "web", "settings", "control", "files", "admin", "trash"].includes(a.id));

export function AdminApp({ tab: openTab, nonce }) {
  const user = useVfs(s => s.user);
  const [tab, setTab] = useState(openTab || "resumen");
  useEffect(() => { if (openTab) setTab(openTab); }, [openTab, nonce]); // abierto desde el Panel de control
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
        {[["resumen", "monitoring", "Resumen"], ["usuarios", "group", "Usuarios"], ["registro", "history", "Registro"], ["copias", "backup", "Copias"], ["apps", "extension", "Apps"], ["servicios", "widgets", "Servicios"], ["servidor", "dns", "Servidor"]].map(([id, icon, label]) =>
          <div key={id} className={"side-item" + (tab === id ? " active" : "")} onClick={() => setTab(id)}><Ic name={icon} /><span>{label}</span></div>)}
      </div>
      <div className="app-main scroll" style={{ padding: "18px 22px", display: "block" }}>
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
        {tab === "copias" && <Backups />}
        {tab === "apps" && <ServerApps />}
        {tab === "servicios" && <ServerServices />}
      </div>

      {files && <UserFiles u={files} onClose={() => setFiles(null)} onChanged={() => { loadUsers(); loadStats(); }} />}
      {edit && <UserEditor u={edit} me={user} onFiles={() => { setFiles(edit); setEdit(null); }} onClose={() => setEdit(null)} patch={(b, m) => patch(edit, b, m).then(() => setEdit(x => x && { ...x, ...b }))}
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
        <div className="admin-line"><span>Dos pasos</span>{u.twoFactor ? <><span className="tfa-on" style={{ marginLeft: 0 }}>Activa</span>
          {!self && <button className="tb-btn" title="Si perdió el celular y sus códigos de recuperación" onClick={async () => { try { await api("DELETE", `admin/users/${u.id}/2fa`); toast("Verificación en dos pasos quitada", { icon: "lock_open" }); onClose(); } catch (e) { toast(e.message, { error: true }); } }}>Quitar (perdió el celular)</button>}</>
          : <span className="faint">No la usa</span>}</div>
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
        <form className="admin-line" onSubmit={e => { e.preventDefault(); const v = e.currentTarget.elements.correo.value.trim(); if (v && v !== u.email) patch({ email: v }, "Correo actualizado"); }}>
          <input className="sc-input" name="correo" type="email" defaultValue={u.email} key={u.email} aria-label="Correo de la cuenta" style={{ flex: 1, margin: 0 }} />
          <button className="tb-btn"><Ic name="alternate_email" /> Cambiar correo</button></form>
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
  const [items, setItems] = useState(null), [vault, setVault] = useState(null), [q, setQ] = useState(""), [del, setDel] = useState(null), [dir, setDir] = useState("");
  const load = () => api("GET", `admin/users/${u.id}/files`).then(r => { setItems(r.items); setVault(r.vault || null); }).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, []);
  // navegación por carpetas (con búsqueda: lista plana de todo lo que coincide)
  const folderOf = (f) => f.path.replace(/\/[^/]*$/, "");
  const inDir = (items || []).filter(f => folderOf(f) === dir);
  const subdirs = [...new Set((items || []).map(folderOf).filter(p => p.startsWith(dir + "/") && p !== dir).map(p => dir + "/" + p.slice(dir.length + 1).split("/")[0]))].sort();
  const sizeOf = (p) => (items || []).filter(f => f.path.startsWith(p + "/")).reduce((s, f) => s + f.size, 0);
  const countOf = (p) => (items || []).filter(f => f.path.startsWith(p + "/")).length;
  const list = q ? (items || []).filter(f => f.path.toLowerCase().includes(q.toLowerCase())) : inDir;
  const crumbs = dir.split("/").filter(Boolean);
  return (
    <Modal title={`Archivos de ${u.name}`} icon="folder_open" onClose={onClose} width={820} actions={<button className="tb-btn" onClick={onClose}>Cerrar</button>}>
      <div className="admin-warn soft"><Ic name="policy" /><div>Úsalo solo para revisar contenido que infrinja derechos de autor o las normas de este servidor. Cada vez que abres o eliminas un archivo queda en el <b>Registro</b>, y la persona recibe un aviso con el motivo cuando eliminas algo.</div></div>
      <div className="search-box" style={{ margin: "10px 0" }}><Ic name="search" size={16} /><input placeholder="Buscar en todas sus carpetas" value={q} onChange={e => setQ(e.target.value)} /></div>
      {!q && <div className="admin-crumbs"><button onClick={() => setDir("")}><Ic name="home" size={16} /> Inicio</button>
        {crumbs.map((c, i) => <React.Fragment key={i}><Ic name="chevron_right" size={14} /><button onClick={() => setDir("/" + crumbs.slice(0, i + 1).join("/"))}>{c}</button></React.Fragment>)}</div>}
      {vault && vault.files > 0 && !vault.items && <div className="faint" style={{ fontSize: 12, margin: "0 0 8px" }}><Ic name="lock" size={14} /> Además tiene {vault.files} archivo(s) en su bóveda privada ({fmtSize(vault.size)}). {vault.policy ? "Su llave se agregará la próxima vez que abra la bóveda." : "Están cifrados con su clave: en este servidor nadie más puede verlos."}</div>}
      {vault?.items?.length > 0 && !q && !dir && <details className="admin-vault"><summary><Ic name="lock_open" size={15} /> Bóveda secreta · {vault.items.length} archivo(s) · {fmtSize(vault.size)} <span className="faint">(este servidor permite que el administrador la revise)</span></summary>
        {vault.items.map(it => <div key={it.id} className="admin-file"><span className="admin-file-name"><b>{it.name}</b><span className="faint">Bóveda</span></span><span className="faint">{fmtSize(it.size)}</span>
          <a className="tb-btn icon" title="Abrir" target="_blank" rel="noreferrer" href={`/api/admin/users/${u.id}/vault/${it.id}`}><Ic name="open_in_new" size={16} /></a>
          <a className="tb-btn icon" title="Descargar" href={`/api/admin/users/${u.id}/vault/${it.id}?dl=1`}><Ic name="download" size={16} /></a><span /></div>)}
      </details>}
      <div className="admin-files">
        {!q && dir && <div className="admin-file folder" onClick={() => setDir(dir.replace(/\/[^/]*$/, ""))}><span className="admin-file-name"><b><Ic name="arrow_upward" size={16} /> ..</b></span></div>}
        {!q && subdirs.map(p => <div key={p} className="admin-file folder" onClick={() => setDir(p)}>
          <span className="admin-file-name"><b><Ic name="folder" size={16} style={{ color: "#c9902a" }} /> {p.split("/").pop()}</b><span className="faint">{countOf(p)} archivo(s)</span></span>
          <span className="faint">{fmtSize(sizeOf(p))}</span><span /><span /><span /></div>)}
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

/** donaciones: medios para recibir apoyo (app Contribuir y página pública /#/donar) */
function DonationSettings() {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { api("GET", "admin/donaciones").then(setD).catch(() => {}); }, []);
  if (!d) return null;
  const upd = (i, k, v) => setD(s => ({ ...s, methods: s.methods.map((m, j) => j === i ? { ...m, [k]: v } : m) }));
  const add = () => setD(s => ({ ...s, methods: [...s.methods, { kind: "paypal", label: "", value: "", note: "" }] }));
  const del = (i) => setD(s => ({ ...s, methods: s.methods.filter((_, j) => j !== i) }));
  const save = async (enabled = d.enabled) => { setBusy(true); try { const r = await api("PUT", "admin/donaciones", { ...d, enabled }); setD(s => ({ ...s, ...r })); toast(r.enabled ? "Donaciones publicadas" : "Donaciones guardadas (sin publicar)", { icon: "volunteer_activism" }); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const link = location.origin + "/#/donar";
  return <>
    <div className="admin-sub">Donaciones</div>
    <div className="faint" style={{ fontSize: 12.5, marginBottom: 8 }}>Cómo quieres recibir apoyo. Se muestra en la app Contribuir y en una página pública que puedes compartir. Sotos no cobra ni guarda pagos: cada medio lo procesa su servicio.</div>
    <div className="admin-line"><span>Título</span><input className="sc-input" value={d.title} maxLength={80} onChange={e => setD({ ...d, title: e.target.value })} style={{ width: 300, margin: 0 }} /></div>
    <div className="admin-line" style={{ alignItems: "flex-start" }}><span>Mensaje</span><textarea className="sc-input" rows={3} value={d.message} maxLength={600} onChange={e => setD({ ...d, message: e.target.value })} placeholder="Por qué apoyar este Sotos y en qué se usa el dinero" style={{ width: 420, margin: 0, height: "auto", padding: 8 }} /></div>
    {d.methods.map((m, i) => <div key={i} className="admin-line don-edit">
      <select className="sc-input" value={m.kind} onChange={e => upd(i, "kind", e.target.value)} style={{ width: 150, margin: 0 }}>{Object.entries(d.kinds).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <input className="sc-input" value={m.value} onChange={e => upd(i, "value", e.target.value)} placeholder={d.kinds[m.kind]?.url ? "https://…" : "Número o cuenta"} style={{ width: 230, margin: 0 }} aria-label="Enlace o número" />
      <input className="sc-input" value={m.note} onChange={e => upd(i, "note", e.target.value)} placeholder="Nota (opcional): a nombre de…" style={{ width: 200, margin: 0 }} aria-label="Nota" />
      <button className="tb-btn icon" title="Quitar" aria-label="Quitar" onClick={() => del(i)}><Ic name="close" size={16} /></button></div>)}
    <div className="admin-line"><span />
      <button className="tb-btn" onClick={add} disabled={d.methods.length >= 12}><Ic name="add" /> Agregar medio</button>
      <button className="tb-btn primary" disabled={busy || !d.methods.length} onClick={() => save(true)}>{d.enabled ? "Guardar" : "Publicar"}</button>
      {d.enabled && <button className="tb-btn" disabled={busy} onClick={() => save(false)}>Dejar de publicar</button>}
      {d.enabled && <a className="tb-btn" href={link} target="_blank" rel="noopener noreferrer"><Ic name="open_in_new" /> Ver página pública</a>}</div>
  </>;
}

/** correo de envío del servidor: recuperar contraseñas por correo */
const SMTP_PRESETS = { gmail: ["smtp.gmail.com", 465, "ssl"], outlook: ["smtp-mail.outlook.com", 587, "starttls"], icloud: ["smtp.mail.me.com", 587, "starttls"], yahoo: ["smtp.mail.yahoo.com", 465, "ssl"] };
function SysMailSettings() {
  const [d, setD] = useState(null), [f, setF] = useState(null), [busy, setBusy] = useState(false);
  const load = () => api("GET", "admin/sysmail").then(r => { setD(r); setF({ publicUrl: r.publicUrl || location.origin, host: r.smtp?.host || "", port: r.smtp?.port || 587, tls: r.smtp?.tls || "starttls", username: r.smtp?.username || "", from: r.smtp?.from || "", name: r.smtp?.name || "Sotos", password: "" }); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!f) return null;
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const preset = (p) => { const [host, port, tls] = SMTP_PRESETS[p]; setF(s => ({ ...s, host, port, tls })); };
  const save = async () => { setBusy(true); try { await api("PUT", "admin/sysmail", { publicUrl: f.publicUrl, smtp: { ...f, port: +f.port } }); toast("Correo del servidor guardado", { icon: "check" }); load(); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const test = async () => { setBusy(true); try { const r = await api("POST", "admin/sysmail/test"); toast(`Correo de prueba enviado a ${r.to}`, { icon: "mark_email_read" }); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const off = async () => { try { await api("PUT", "admin/sysmail", { smtp: null }); toast("Recuperación por correo desactivada"); load(); } catch (e) { toast(e.message, { error: true }); } };
  const on = !!d?.smtp;
  return <>
    <div className="admin-sub">Correo del servidor</div>
    <div className="faint" style={{ fontSize: 12.5, marginBottom: 8 }}>{on ? "Las personas pueden recuperar su contraseña con un enlace que llega a su correo." : "Configura una cuenta de envío para que las personas puedan recuperar su contraseña por correo. Sin ella, solo el administrador puede cambiarla."}</div>
    <div className="admin-line"><span>Dirección pública de Sotos</span><input className="sc-input" value={f.publicUrl} onChange={set("publicUrl")} placeholder="https://nube.midominio.com" style={{ width: 300, margin: 0 }} /></div>
    <div className="admin-line"><span>Proveedor</span>{Object.keys(SMTP_PRESETS).map(p => <button key={p} className={"chip" + (f.host === SMTP_PRESETS[p][0] ? " on" : "")} onClick={() => preset(p)}>{{ gmail: "Gmail", outlook: "Outlook", icloud: "iCloud", yahoo: "Yahoo" }[p]}</button>)}</div>
    <div className="admin-line"><span>Servidor SMTP</span><input className="sc-input" value={f.host} onChange={set("host")} placeholder="smtp.midominio.com" style={{ width: 220, margin: 0 }} />
      <input className="sc-input" type="number" value={f.port} onChange={set("port")} style={{ width: 80, margin: 0 }} />
      <button className={"chip" + (f.tls === "ssl" ? " on" : "")} onClick={() => setF(s => ({ ...s, tls: "ssl" }))}>SSL</button><button className={"chip" + (f.tls === "starttls" ? " on" : "")} onClick={() => setF(s => ({ ...s, tls: "starttls" }))}>STARTTLS</button></div>
    <div className="admin-line"><span>Remitente</span><input className="sc-input" value={f.name} onChange={set("name")} placeholder="Nombre" style={{ width: 140, margin: 0 }} /><input className="sc-input" type="email" value={f.from} onChange={set("from")} placeholder="no-responder@midominio.com" style={{ width: 240, margin: 0 }} /></div>
    <div className="admin-line"><span>Usuario y contraseña</span><input className="sc-input" value={f.username} onChange={set("username")} placeholder="igual que el remitente" style={{ width: 200, margin: 0 }} autoComplete="off" />
      <input className="sc-input" type="password" value={f.password} onChange={set("password")} placeholder={d?.smtp?.hasPassword ? "•••••••• (guardada)" : "contraseña de aplicación"} style={{ width: 200, margin: 0 }} autoComplete="new-password" /></div>
    <div className="admin-line"><span /><button className="tb-btn primary" disabled={busy || !f.host || !f.from} onClick={save}>Guardar</button>
      {on && <button className="tb-btn" disabled={busy} onClick={test}><Ic name="send" /> Enviarme una prueba</button>}
      {on && <button className="tb-btn" disabled={busy} onClick={off}>Desactivar</button>}</div>
  </>;
}

/** actualizaciones de Sotos (versiones publicadas en GitHub) */
function UpdatesCard() {
  const [u, setU] = useState(null), [busy, setBusy] = useState(false), [log, setLog] = useState([]), [showNotes, setShowNotes] = useState(false);
  const load = (force) => api("GET", "admin/update" + (force ? "?force=1" : "")).then(setU).catch(e => setU({ error: e.message }));
  useEffect(() => { load(); }, []);
  const update = async () => {
    setBusy(true); setLog([]);
    try {
      const r = await fetch("/api/admin/update", { method: "POST", headers: { "x-sotos": "1" } }); const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", done = false;
      while (true) { const { value, done: d } = await rd.read(); if (d) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.log) setLog(l => [...l, m.log]); if (m.error) throw new Error(m.error); if (m.done) done = true; } }
      if (done) { setLog(l => [...l, "Esperando a que Sotos vuelva…"]); for (let k = 0; k < 60; k++) { await new Promise(r => setTimeout(r, 2000)); try { const h = await fetch("/api/health"); if (h.ok) { location.reload(); return; } } catch {} } }
    } catch (e) { toast(e.message, { error: true }); }
    setBusy(false);
  };
  if (!u) return null;
  return <div className="admin-update">
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Ic name={u.newer ? "release_alert" : "verified"} size={26} style={{ color: u.newer ? "var(--accent)" : "#4f7a3a" }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <b>{u.error ? "Actualizaciones" : u.newer ? `Sotos ${u.latest} está disponible` : "Sotos está al día"}</b>
        <div className="faint" style={{ fontSize: 12.5 }}>{u.error || `Versión instalada: ${u.current}${u.latest && !u.newer ? "" : ` · nueva: ${u.latest}`}`}{u.newer && !u.ok ? " · " + u.reason : ""}</div>
      </div>
      <button className="tb-btn" disabled={busy} onClick={() => load(true)}><Ic name="refresh" /> Buscar</button>
      {u.newer && u.ok && <button className="tb-btn primary" disabled={busy} onClick={update}><Ic name="system_update_alt" /> {busy ? "Actualizando…" : "Actualizar ahora"}</button>}
    </div>
    {u.newer && u.notes && <><button className="login-alt" style={{ padding: 0, fontSize: 12.5, marginTop: 6 }} onClick={() => setShowNotes(s => !s)}>{showNotes ? "Ocultar novedades" : "Ver qué trae"}</button>
      {showNotes && <pre className="admin-update-notes">{u.notes}</pre>}</>}
    {!!log.length && <pre className="admin-update-log">{log.join("\n")}</pre>}
    {u.newer && u.ok && !busy && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Antes de actualizar se hace una copia de seguridad. Tus archivos, cuentas y configuración no se tocan.</div>}
  </div>;
}

/** copias de seguridad automáticas del servidor */
function Backups() {
  const [st, setSt] = useState(null), [busy, setBusy] = useState(false);
  const load = () => api("GET", "admin/backups").then(setSt).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, []);
  const now = async () => { setBusy(true); try { const r = await api("POST", "admin/backups"); setSt(r); toast("Copia de seguridad lista", { icon: "backup" }); } catch (e) { toast("No se pudo hacer la copia: " + e.message, { error: true }); } setBusy(false); };
  if (!st) return <div className="faint">Cargando…</div>;
  return <>
    <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 0 }}>Copias de seguridad</h2>
    <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
      {st.hour === null ? "Las copias automáticas están desactivadas." : `Cada día a las ${String(st.hour).padStart(2, "0")}:00 se guarda una copia completa (cuentas, archivos, bóvedas, correo, mundos). Se conservan las últimas ${st.keep}.`}
      {" "}Los archivos que no cambiaron no ocupan espacio de nuevo.
    </div>
    <div className="faint" style={{ fontSize: 12, marginBottom: 12 }}><Ic name="folder" size={14} /> {st.dir}{/[\\/]data[\\/]copias$/.test(st.dir) && " · Están en el mismo disco que los datos: para protegerte de una falla del disco, apunta SOTOS_BACKUP_DIR a otro disco."}</div>
    {st.lastError && <div className="admin-warn"><Ic name="error" /> La última copia falló: {st.lastError}</div>}
    <button className="tb-btn primary" disabled={busy || st.running} onClick={now}><Ic name="backup" /> {busy || st.running ? "Haciendo la copia…" : "Hacer una copia ahora"}</button>
    <div className="admin-files" style={{ marginTop: 14 }}>
      {!st.items.length && <div className="faint" style={{ padding: 10 }}>Todavía no hay copias.</div>}
      {st.items.map(b => <div key={b.name} className="admin-file"><span className="admin-file-name"><b><Ic name={b.complete ? "check_circle" : "warning"} size={16} style={{ color: b.complete ? "#4f7a3a" : "#c4532f" }} /> {new Date(b.started || 0).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}</b><span className="faint">{b.reason || ""} · {b.files || 0} archivos</span></span>
        <span className="faint">{fmtSize(b.bytes || 0)}</span><span className="faint">{b.finished ? ((b.finished - b.started) / 1000).toFixed(1) + " s" : ""}</span><span /><span /></div>)}
    </div>
    <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>Para restaurar una copia: detén Sotos, reemplaza la carpeta de datos por el contenido de la copia y vuelve a iniciarlo.</div>
    <Offsite />
  </>;
}

/** apps del SDK instaladas en el servidor: subir un .zip, ver permisos y quitar */
/* servicios opcionales en Docker, después de instalar Sotos (antes solo desde el asistente o scripts/) */
const SERVICE_INFO = [
  ["office", "description", "Office completo", "Word, Excel y PowerPoint con coedición (Euro-Office u ONLYOFFICE). Unos 3 GB."],
  ["drawio", "account_tree", "Diagramas", "draw.io propio en el servidor. Unos 600 MB."],
  ["neko", "language", "Navegador virtual", "Firefox en el servidor para sitios que no se dejan abrir en una ventana, y WhatsApp. Usa 2 GB de memoria compartida."],
  ["jellyfin", "live_tv", "Cine", "Jellyfin con tus películas y series de Sotos. Unos 800 MB."],
  ["immich", "photo_library", "Fotos", "Immich con reconocimiento de caras y lugares. La primera vez descarga varios GB y usa bastante memoria."],
];
function ServerServices() {
  const [d, setD] = useState(null), [pick, setPick] = useState([]), [engine, setEngine] = useState("eurooffice"), [lines, setLines] = useState([]), [busy, setBusy] = useState(false), [state, setState] = useState({});
  const load = () => api("GET", "services").then(setD).catch(e => setD({ error: e.message }));
  useEffect(() => { load(); }, []);
  const install = async () => {
    setBusy(true); setLines([]); setState({});
    try {
      const r = await fetch("/api/services", { method: "POST", headers: { "x-sotos": "1", "content-type": "application/json" }, body: JSON.stringify({ services: pick, officeEngine: engine }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "No se pudo empezar"); }
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", restart = false;
      for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line);
          if (m.service && (m.done || m.error)) setState(s => ({ ...s, [m.service]: m.done ? "ok" : m.error }));
          if (m.log || m.msg) setLines(l => [...l.slice(-200), m.log || m.msg]);
          if (m.restart) restart = true; } }
      if (restart) { toast("Sotos se está reiniciando con los servicios nuevos. Recarga en unos segundos.", { icon: "restart_alt" }); setTimeout(() => location.reload(), 8000); }
      else load();
    } catch (e) { toast(e.message, { error: true }); }
    setBusy(false); setPick([]);
  };
  if (!d) return <div className="faint">Cargando…</div>;
  if (d.error) return <div className="admin-warn soft"><Ic name="error" /><div>{d.error}</div></div>;
  return <>
    <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 0 }}>Servicios opcionales</h2>
    <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Sotos funciona sin ellos. Cada uno corre en su propio contenedor de Docker en este servidor.</div>
    {d.docker
      ? <div className="admin-warn soft" style={{ marginBottom: 12 }}><Ic name="check_circle" /><div>Docker {d.docker} disponible{d.container ? `. Sotos corre en un contenedor${d.network ? ` y los servicios irán en la red ${d.network}` : ""}.` : "."}</div></div>
      : <div className="admin-warn" style={{ marginBottom: 12 }}><Ic name="error" /><div>Sotos no puede usar Docker en este servidor{d.dockerError ? ` (${d.dockerError})` : ""}. {d.container ? "En un NAS, monta /var/run/docker.sock en el contenedor de Sotos y arráncalo con SOTOS_UID=0 (ver docker-compose.nas.yml)." : "Instala Docker y vuelve a abrir esta pestaña."}</div></div>}
    <div className="admin-files">
      {SERVICE_INFO.map(([id, icon, name, desc]) => { const on = d.services[id], st = state[id];
        return <label key={id} className="admin-file" style={{ gridTemplateColumns: "auto 1fr auto", alignItems: "center", cursor: on || !d.docker ? "default" : "pointer" }}>
          <input type="checkbox" disabled={on || !d.docker || busy} checked={on || pick.includes(id)} onChange={e => setPick(p => e.target.checked ? [...p, id] : p.filter(x => x !== id))} aria-label={name} />
          <span className="admin-file-name" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Ic name={icon} size={24} />
            <span style={{ display: "flex", flexDirection: "column" }}><b>{name}{id === "office" && d.engine ? <span className="faint" style={{ fontWeight: 400 }}> ({d.engine === "onlyoffice" ? "ONLYOFFICE" : "Euro-Office"})</span> : null}</b><span className="faint">{desc}</span></span></span>
          <span className="faint">{st === "ok" ? "Instalado" : st ? <span style={{ color: "var(--danger, #b3412b)" }}>Falló: {st}</span> : on ? "Activo" : ""}</span>
        </label>; })}
    </div>
    {pick.includes("office") && <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, fontSize: 13 }}><span className="faint">Motor de Office:</span>
      <label><input type="radio" name="oo-engine" checked={engine === "eurooffice"} onChange={() => setEngine("eurooffice")} /> Euro-Office</label>
      <label><input type="radio" name="oo-engine" checked={engine === "onlyoffice"} onChange={() => setEngine("onlyoffice")} /> ONLYOFFICE</label></div>}
    <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
      <button className="tb-btn primary" disabled={!pick.length || busy || !d.docker} onClick={install}><Ic name={busy ? "progress_activity" : "download"} className={busy ? "spin" : ""} /> {busy ? "Instalando…" : `Instalar ${pick.length ? pick.length : ""} servicio${pick.length === 1 ? "" : "s"}`}</button>
      {d.installing && !busy && <span className="faint">Otra instalación está en curso.</span>}
    </div>
    {lines.length > 0 && <pre className="admin-log" style={{ marginTop: 12, maxHeight: 220, overflow: "auto", fontSize: 12, padding: 10, background: "var(--surface-2)", borderRadius: 8, whiteSpace: "pre-wrap" }}>{lines.join("\n")}</pre>}
  </>;
}

function ServerApps() {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false), [del, setDel] = useState(null); const inp = React.useRef(null);
  const load = () => api("GET", "apps").then(setD).catch(e => toast(e.message, { error: true }));
  useEffect(() => { load(); }, []);
  const upload = async (file) => {
    if (!file) return; setBusy(true);
    try { const r = await fetch("/api/apps", { method: "POST", headers: { "x-sotos": "1", "content-type": "application/zip" }, body: file }); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo instalar"); toast(j.updatedFrom ? `${j.app.name} actualizada de ${j.updatedFrom} a ${j.app.version}` : `${j.app.name} ${j.app.version} instalada en el servidor · ya está en la Tienda`, { icon: "extension" }); load(); loadInstalled(); }
    catch (e) { toast(e.message, { error: true }); } setBusy(false);
  };
  const remove = async (a) => { try { await api("DELETE", "apps/" + a.id); toast(`${a.name} se quitó del servidor`, { icon: "delete" }); setDel(null); load(); loadInstalled(); } catch (e) { toast(e.message, { error: true }); } };
  if (!d) return <div className="faint">Cargando…</div>;
  return <>
    <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 0 }}>Apps del servidor</h2>
    <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Apps hechas con el SDK de Sotos. Al instalarlas aquí aparecen en la Tienda y cada persona decide si las agrega a su cuenta. Corren aisladas y solo pueden hacer lo que dicen sus permisos.</div>
    <input ref={inp} type="file" accept=".zip,application/zip" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; e.target.value = ""; upload(f); }} />
    <button className="tb-btn primary" disabled={busy} onClick={() => inp.current.click()}><Ic name="upload" /> {busy ? "Instalando…" : "Instalar una app (.zip)"}</button>
    <div className="admin-files" style={{ marginTop: 14 }}>
      {!d.items.length && <div className="faint" style={{ padding: 10 }}>Todavía no hay apps del SDK. Crea una con <code>node sdk/crear-app.mjs</code> y empaquétala con <code>node sdk/empaquetar-app.mjs</code>.</div>}
      {d.items.map(a => <div key={a.id} className="admin-file" style={{ gridTemplateColumns: "1fr auto" }}>
        <span className="admin-file-name" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Tile icon={a.icon} color={a.color} size={34} app={a.id} />
          <span style={{ display: "flex", flexDirection: "column" }}><b>{a.name} <span className="faint" style={{ fontWeight: 400 }}>{a.version} · {a.id}</span></b>
            <span className="faint">{a.author || "autor desconocido"} · {a.permissions.length ? a.permissions.map(p => d.permissions[p] || p).join(" · ") : "sin permisos"}</span></span></span>
        <span><button className="tb-btn danger" onClick={() => setDel(a)}><Ic name="delete" /> Quitar</button></span></div>)}
    </div>
    <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>Para actualizar una app, instala el .zip de la versión nueva: reemplaza a la anterior y conserva los datos de cada persona. Documentación: <code>sdk/README.md</code>.</div>
    {del && <Modal title={`Quitar ${del.name}`} icon="delete" onClose={() => setDel(null)} width={420}
      actions={<><button className="tb-btn" onClick={() => setDel(null)}>Cancelar</button><button className="tb-btn danger" onClick={() => remove(del)}>Quitar del servidor</button></>}>
      <div style={{ fontSize: 13.5 }}>Se quita de la Tienda y de todas las cuentas, junto con los datos que la app guardó. Los archivos que la gente guardó con ella en su Drive no se tocan.</div></Modal>}
  </>;
}

/** copia fuera del servidor: otro disco/NAS o almacenamiento S3 compatible */
const S3_PRESETS = {
  b2: { label: "Backblaze B2", endpoint: "https://s3.us-west-004.backblazeb2.com", region: "us-west-004", help: "En B2: crea un bucket privado y una «Application Key» con acceso a él. La dirección y la región aparecen en el bucket (Endpoint)." },
  r2: { label: "Cloudflare R2", endpoint: "https://<id-de-cuenta>.r2.cloudflarestorage.com", region: "auto", help: "En R2: crea un bucket y un token de API de R2 (lectura y escritura). La dirección lleva el id de tu cuenta." },
  wasabi: { label: "Wasabi", endpoint: "https://s3.us-east-1.wasabisys.com", region: "us-east-1", help: "Crea un bucket y una clave de acceso en Wasabi; usa la dirección de la región del bucket." },
  aws: { label: "Amazon S3", endpoint: "https://s3.us-east-1.amazonaws.com", region: "us-east-1", help: "Crea un bucket y un usuario IAM con permiso sobre él (PutObject, GetObject, DeleteObject, ListBucket)." },
  minio: { label: "MinIO / otro", endpoint: "http://192.168.1.50:9000", region: "us-east-1", help: "Cualquier servicio compatible con S3, también uno propio en tu NAS." },
};
function Offsite() {
  const [d, setD] = useState(null), [f, setF] = useState(null), [busy, setBusy] = useState(""), [preset, setPreset] = useState(null);
  const load = () => api("GET", "admin/offsite").then(r => { setD(r); const c = r.config; setF({ kind: c?.kind || "folder", keep: c?.keep || 7, folder: c?.folder || "", endpoint: c?.s3?.endpoint || "", region: c?.s3?.region || "", bucket: c?.s3?.bucket || "", prefix: c?.s3?.prefix || "sotos", accessKey: c?.s3?.accessKey || "", secret: "" }); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!f) return null;
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const body = () => ({ config: { kind: f.kind, keep: +f.keep, folder: f.folder, s3: { endpoint: f.endpoint, region: f.region, bucket: f.bucket, prefix: f.prefix, accessKey: f.accessKey, secret: f.secret } } });
  const act = async (what, fn) => { setBusy(what); try { await fn(); } catch (e) { toast(e.message, { error: true }); } setBusy(""); };
  const save = () => act("save", async () => { const r = await api("PUT", "admin/offsite", body()); setD(r); setF(s => ({ ...s, secret: "" })); toast("Destino guardado", { icon: "check" }); });
  const test = () => act("test", async () => { await api("PUT", "admin/offsite", body()); await api("POST", "admin/offsite/test"); toast("Conexión correcta: se pudo escribir, leer y borrar", { icon: "check_circle" }); load(); });
  const run = () => act("run", async () => { const r = await api("POST", "admin/offsite/run"); setD(r); toast(`Copia enviada: ${r.result.sent} archivo(s) nuevos, ${r.result.reused} ya estaban`, { icon: "cloud_done" }); });
  const off = () => act("off", async () => { const r = await api("PUT", "admin/offsite", { config: null }); setD(r); toast("Copia fuera del servidor desactivada"); });
  const st = d?.status; const p = preset && S3_PRESETS[preset];
  return <div className="admin-update" style={{ marginTop: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}><Ic name="cloud_sync" size={24} style={{ color: "var(--accent)" }} />
      <div style={{ flex: 1 }}><b>Copia fuera del servidor</b><div className="faint" style={{ fontSize: 12.5 }}>Después de cada copia, se envía también a otro disco, un NAS o un almacenamiento en la nube. Solo viaja lo nuevo.</div></div></div>
    {st && <div className={st.ok ? "faint" : "admin-warn"} style={{ fontSize: 12.5, margin: "6px 0" }}><Ic name={st.ok ? "cloud_done" : "error"} size={15} /> {st.ok ? `Última copia enviada ${new Date(st.at).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}: ${st.sent} archivo(s) nuevos (${fmtSize(st.bytes || 0)}), ${st.reused} ya estaban · ${st.secs} s` : `Falló ${new Date(st.at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}: ${st.error}`}</div>}
    <div className="admin-line"><span>Destino</span>
      <button className={"chip" + (f.kind === "folder" ? " on" : "")} onClick={() => setF(s => ({ ...s, kind: "folder" }))}>Otro disco o carpeta de red</button>
      <button className={"chip" + (f.kind === "s3" ? " on" : "")} onClick={() => setF(s => ({ ...s, kind: "s3" }))}>Almacenamiento S3</button></div>
    {f.kind === "folder" ? <>
      <div className="admin-line"><span>Carpeta</span><input className="sc-input" value={f.folder} onChange={set("folder")} placeholder={navigator.platform.startsWith("Win") ? "E:\\Copias de Sotos  o  \\\\NAS\\copias" : "/mnt/usb/copias-sotos"} style={{ width: 340, margin: 0 }} /></div>
      <div className="faint" style={{ fontSize: 12, margin: "0 0 6px" }}>Un disco USB, otro disco interno o una carpeta compartida del NAS montada en el servidor. Lo que no cambió entre copias no ocupa espacio de nuevo.</div>
    </> : <>
      <div className="admin-line"><span>Servicio</span>{Object.entries(S3_PRESETS).map(([k, v]) => <button key={k} className={"chip" + (preset === k ? " on" : "")} onClick={() => { setPreset(k); setF(s => ({ ...s, endpoint: v.endpoint, region: v.region })); }}>{v.label}</button>)}</div>
      {p && <div className="faint" style={{ fontSize: 12, margin: "0 0 6px" }}>{p.help}</div>}
      <div className="admin-line"><span>Dirección y región</span><input className="sc-input" value={f.endpoint} onChange={set("endpoint")} placeholder="https://s3.…" style={{ width: 300, margin: 0 }} /><input className="sc-input" value={f.region} onChange={set("region")} placeholder="región" style={{ width: 120, margin: 0 }} /></div>
      <div className="admin-line"><span>Bucket y carpeta</span><input className="sc-input" value={f.bucket} onChange={set("bucket")} placeholder="mi-bucket" style={{ width: 200, margin: 0 }} /><input className="sc-input" value={f.prefix} onChange={set("prefix")} placeholder="sotos" style={{ width: 120, margin: 0 }} /></div>
      <div className="admin-line"><span>Clave de acceso</span><input className="sc-input" value={f.accessKey} onChange={set("accessKey")} placeholder="Access key ID" style={{ width: 200, margin: 0 }} autoComplete="off" />
        <input className="sc-input" type="password" value={f.secret} onChange={set("secret")} placeholder={d?.config?.s3?.hasSecret ? "•••••••• (guardada)" : "Clave secreta"} style={{ width: 200, margin: 0 }} autoComplete="new-password" /></div>
    </>}
    <div className="admin-line"><span>Conservar</span><input className="sc-input" type="number" min={1} max={90} value={f.keep} onChange={set("keep")} style={{ width: 80, margin: 0 }} /><span className="faint">copias</span></div>
    <div className="admin-line"><span />
      <button className="tb-btn primary" disabled={!!busy} onClick={save}>Guardar</button>
      <button className="tb-btn" disabled={!!busy} onClick={test}><Ic name="network_check" /> {busy === "test" ? "Probando…" : "Probar"}</button>
      {d?.config && <button className="tb-btn" disabled={!!busy || d.running} onClick={run}><Ic name="cloud_upload" /> {busy === "run" || d.running ? "Enviando…" : "Enviar la última copia ahora"}</button>}
      {d?.config && <button className="tb-btn" disabled={!!busy} onClick={off}>Desactivar</button>}</div>
  </div>;
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
    <UpdatesCard />
    <h2 className="admin-h">Ajustes del servidor</h2>
    <div className="admin-line"><span>Registro de cuentas nuevas</span>
      <button className={"chip" + (stats.settings.registration === "open" ? " on" : "")} onClick={() => save({ registration: "open" }, "Registro abierto")}>Abierto</button>
      <button className={"chip" + (stats.settings.registration === "closed" ? " on" : "")} onClick={() => save({ registration: "closed" }, "Registro cerrado: solo el administrador crea cuentas")}>Cerrado</button></div>
    <div className="admin-line"><span>Datos de las cuentas</span>
      <button className={"chip" + (stats.settings.accountEdit !== "admin" ? " on" : "")} onClick={() => save({ accountEdit: "self" }, "Cada persona puede cambiar su correo, contraseña, nombre y foto")}>Cada persona</button>
      <button className={"chip" + (stats.settings.accountEdit === "admin" ? " on" : "")} onClick={() => save({ accountEdit: "admin" }, "Solo el administrador cambia los datos de las cuentas")}>Solo el administrador</button></div>
    <div className="admin-line"><span>Cuota para cuentas nuevas</span><input className="sc-input" type="number" min={10} value={quota} onChange={e => setQuota(e.target.value)} style={{ width: 110, margin: 0 }} /><span className="faint">MB</span>
      <button className="tb-btn" onClick={() => save({ defaultQuotaMb: +quota }, "Cuota por defecto actualizada")}>Guardar</button></div>
    <SysMailSettings />
    <DonationSettings />
    <div className="admin-sub">Equipo</div>
    <div className="faint" style={{ fontSize: 13, lineHeight: 1.7 }}>{stats.server.platform} · {stats.server.cpus} núcleos · Node {stats.server.node}<br />Sotos usa {fmtSize(stats.server.memory)} de memoria · encendido hace {dur(stats.server.uptime)}</div>
  </>;
}
