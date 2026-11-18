/* ============================================================
   Sotos OS — Settings & Store
   ============================================================ */
import React from "react";
import { APPS, WALLPAPERS, ACCENTS, STORE_APPS } from "./data.jsx";
import { SotosLogo, SotosMark } from "./logo.jsx";
import { isInstalled, setInstalled, loadInstalled, subscribeInstalled, getRatings } from "./installed.js";
import { Tile, Ic, SideItem, Avatar, Modal, toast, EmptyState, DEFAULT_AVATARS, avatarUrl } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs, fmtSize, fmtDate } from "./vfs.js";
import { api } from "./api.js";
import { WALLS, PHOTO_WALLS, wallUrl } from "./wallpapers.js";
const { useState: useS4, useRef: useR4, useEffect: useE4 } = React;

function Row({ label, desc, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {desc && <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
      {options.map(o => (
        <button key={o.v} className={"seg-opt" + (value === o.v ? " on" : "")} onClick={() => onChange(o.v)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "none", fontSize: 13, fontWeight: 600,
            background: value === o.v ? "var(--surface)" : "transparent", color: value === o.v ? "var(--text)" : "var(--text-dim)",
            boxShadow: value === o.v ? "var(--shadow-card)" : "none" }}>
          {o.icon && <Ic name={o.icon} size={17} />}{o.label}
        </button>
      ))}
    </div>
  );
}

function LanInfo() {
  const [lan, setLan] = useS4([]);
  React.useEffect(() => { fetch("/api/info").then(r => r.ok ? r.json() : null).then(d => d && setLan(d.lan || [])).catch(() => {}); }, []);
  if (!lan.length) return null;
  return (
    <div className="lan-box">
      <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Ic name="devices" size={18} /> Entrar desde otros equipos de tu red</div>
      <div className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>Abre una de estas direcciones en el navegador del celular o de otro computador conectado al mismo Wi-Fi:</div>
      {lan.map(u => <div key={u} className="lan-url"><code>{u}</code><button className="tb-btn icon" title="Copiar" onClick={() => navigator.clipboard?.writeText(u).then(() => toast("Dirección copiada"))}><Ic name="content_copy" size={16} /></button></div>)}
    </div>
  );
}

function WallThumb({ w, on, onPick }) {
  const [src, setSrc] = useS4(null);
  React.useEffect(() => { let live = true; wallUrl(w.id, 480, 300).then(u => live && setSrc(u)); return () => { live = false; }; }, [w.id]);
  return (
    <button className={"wall-thumb" + (on ? " on" : "")} onClick={onPick} title={w.hint}>
      <span className="wall-img" style={{ backgroundImage: src ? `url("${src}")` : undefined }} />
      <span className="wall-name">{w.name}{on && <Ic name="check" size={15} />}</span>
      <span className="wall-hint">{w.hint}</span>
      {w.author && <a className="wall-credit" href={w.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Foto: {w.author} · CC0</a>}
    </button>
  );
}

/* Copia de seguridad de la cuenta: descargar todo / importar una copia */
function BackupRows() {
  const [busy, setBusy] = useS4(null), inp = useR4(null);
  const run = async (label, fn) => { setBusy(label + "…"); try { await fn((i, n) => setBusy(`${label} ${i} de ${n}…`)); } catch (e) { toast(e.message, { error: true }); } setBusy(null); };
  return <>
    <input ref={inp} type="file" accept=".zip" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) run("Importando", async (p) => { const { importBackup } = await import("./backup.js"); const r = await importBackup(f, p); toast(`Copia importada: ${r.files} archivo(s), ${r.contacts} contacto(s), ${r.events} evento(s), ${r.tasks} tarea(s)`, { icon: "restore" }); }); }} />
    <Row label="Copia de seguridad" desc={busy || "Todos tus archivos, contactos, calendario, tareas y ajustes en un .zip"}>
      <div className="wl-btns" style={{ margin: 0 }}>
        <button className="tb-btn" disabled={!!busy} onClick={() => run("Preparando", async (p) => { const { downloadBackup } = await import("./backup.js"); const size = await downloadBackup(p); toast(`Copia descargada (${fmtSize(size)})`, { icon: "download_done" }); })}><Ic name="cloud_download" /> Descargar copia</button>
        <button className="tb-btn" disabled={!!busy} onClick={() => inp.current.click()}><Ic name="restore" /> Importar copia</button>
      </div>
    </Row>
  </>;
}
function AccountPanel({ user, env, onLogout }) {
  const sync = useVfs(s => s.sync);
  const [cur, setCur] = useS4(""), [next, setNext] = useS4(""), [busy, setBusy] = useS4(false), [confirm, setConfirm] = useS4(false);
  if (!user) return <>
    <h2 style={{ fontSize: 19, fontWeight: 800 }}>Cuenta</h2>
    <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 520 }}>Estás usando Sotos como <b>invitado</b>: tus archivos viven solo en este navegador. {env?.server ? "Con una cuenta tus archivos te siguen a cualquier dispositivo y puedes compartirlos con enlaces." : "Este Sotos funciona sin servidor, así que las cuentas no están disponibles aquí."}</div>
    {env?.server && <div className="wl-btns" style={{ justifyContent: "flex-start" }}><button className="tb-btn primary" onClick={onLogout}><Ic name="login" /> Iniciar sesión o crear cuenta</button></div>}
    <BackupRows />
    <Row label="Restablecer Sotos" desc="Borra todos los archivos y ajustes de este navegador">
      <button className="tb-btn danger" onClick={() => setConfirm(true)}><Ic name="restart_alt" /> Restablecer</button>
    </Row>
    {confirm && <Modal title="¿Restablecer Sotos?" icon="restart_alt" onClose={() => setConfirm(false)}
      actions={<><button className="tb-btn" onClick={() => setConfirm(false)}>Cancelar</button><button className="tb-btn danger" onClick={async () => { await vfs.factoryReset(); Object.keys(localStorage).filter(k => k.startsWith("sotos")).forEach(k => localStorage.removeItem(k)); location.reload(); }}>Borrar todo</button></>}>
      <div className="muted" style={{ fontSize: 13.5 }}>Se borrarán todos los archivos de invitado de este navegador. No se puede deshacer.</div></Modal>}
  </>;
  const changePw = async () => {
    setBusy(true);
    try { await api("POST", "auth/password", { current: cur, next }); toast("Contraseña cambiada. Las demás sesiones se cerraron.", { icon: "lock" }); setCur(""); setNext(""); }
    catch (e) { toast(e.message, { error: true }); }
    setBusy(false);
  };
  const pct = sync.quota ? Math.min(100, (sync.used || vfs.usedBytes()) / sync.quota * 100) : 0;
  return <>
    <h2 style={{ fontSize: 19, fontWeight: 800 }}>Cuenta</h2>
    <Row label={user.name} desc={user.email}><button className="tb-btn" onClick={onLogout}><Ic name="logout" /> Cerrar sesión</button></Row>
    <Row label="Espacio en la nube" desc={sync.quota ? `${fmtSize(vfs.usedBytes())} de ${fmtSize(sync.quota)}` : "—"}>
      <div style={{ width: 180, height: 8, borderRadius: 5, background: "var(--surface-3)", overflow: "hidden" }}><div style={{ width: Math.max(1, pct) + "%", height: "100%", background: "var(--accent)" }} /></div>
    </Row>
    <Row label="Sincronización" desc={{ ok: "Todo está guardado en la nube", syncing: `Enviando ${sync.pending} cambio(s)…`, offline: `Sin conexión · ${sync.pending} cambio(s) esperando`, auth: "La sesión caducó", full: "Sin espacio" }[sync.status] || "—"}>
      <button className="tb-btn" onClick={() => vfs.flush()}><Ic name="sync" /> Sincronizar ahora</button>
    </Row>
    <Row label="Archivos de invitado" desc="Copia a tu cuenta lo que creaste sin iniciar sesión en este navegador">
      <button className="tb-btn" onClick={async () => { try { const n = await vfs.importGuest(); toast(n ? `${n} archivo(s) copiados a “Archivos de invitado”` : "No hay archivos de invitado en este navegador"); } catch { toast("No hay archivos de invitado en este navegador"); } }}><Ic name="drive_folder_upload" /> Importar</button>
    </Row>
    <BackupRows />
    <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Cambiar contraseña</div>
      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field" style={{ maxWidth: 200 }}>Actual<input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></label>
        <label className="field" style={{ maxWidth: 200 }}>Nueva (mín. 8)<input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} /></label>
        <button className="tb-btn primary" disabled={busy || !cur || next.length < 8} onClick={changePw}>Cambiar</button>
      </div>
    </div>
    <TwoFactorPanel />
    <PushPanel />
    <DavPanel user={user} />
  </>;
}

/** avisos de Sotos en este dispositivo aunque Sotos esté cerrado (Web Push) */
function PushPanel() {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [on, setOn] = useS4(null), [busy, setBusy] = useS4(false);
  const sub = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();
  React.useEffect(() => { if (supported) sub().then(s => setOn(!!s && Notification.permission === "granted")).catch(() => setOn(false)); }, []);
  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission(); if (perm !== "granted") throw new Error("El navegador no dio permiso para mostrar avisos. Puedes permitirlo en la configuración del sitio.");
      const { key } = await api("GET", "push/key"); const reg = await navigator.serviceWorker.ready;
      const raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const s = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      await api("POST", "push/subscribe", { subscription: s.toJSON() }); setOn(true); toast("Avisos activados en este dispositivo", { icon: "notifications_active" });
    } catch (e) { toast(e.message, { error: true }); }
    setBusy(false);
  };
  const disable = async () => { setBusy(true); try { const s = await sub(); if (s) { await api("POST", "push/unsubscribe", { endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe(); } setOn(false); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const test = async () => { try { const r = await api("POST", "push/test"); toast(r.sent ? "Aviso de prueba enviado" : "No se pudo enviar el aviso de prueba", { icon: "send", error: !r.sent }); } catch (e) { toast(e.message, { error: true }); } };
  return <Row label="Avisos en este dispositivo" desc={!supported ? "Este navegador no permite avisos con Sotos cerrado. En iPhone, primero instala Sotos en la pantalla de inicio." : on ? "Te llegan los avisos de mensajes, mundos y archivos aunque Sotos esté cerrado." : "Recibe los avisos de Sotos aunque no lo tengas abierto, como los de una app del celular."}>
    {supported && on !== null && (on ? <div style={{ display: "flex", gap: 6 }}><button className="tb-btn" onClick={test}><Ic name="send" /> Probar</button><button className="tb-btn" disabled={busy} onClick={disable}>Desactivar</button></div>
      : <button className="tb-btn primary" disabled={busy} onClick={enable}><Ic name="notifications_active" /> Activar</button>)}
  </Row>;
}

/** conectar Sotos como una unidad (WebDAV) con contraseñas de aplicación por dispositivo */
function DavPanel({ user }) {
  const [items, setItems] = useS4(null), [ask, setAsk] = useS4(false), [name, setName] = useS4(""), [pw, setPw] = useS4(""), [made, setMade] = useS4(null), [busy, setBusy] = useS4(false), [help, setHelp] = useS4(false);
  const load = () => api("GET", "dav-keys").then(r => setItems(r.items)).catch(() => {});
  React.useEffect(() => { load(); }, []);
  const addr = location.origin + "/dav/";
  const create = async () => { setBusy(true); try { const r = await api("POST", "dav-keys", { name: name || "Mi dispositivo", password: pw }); setMade(r.password); setAsk(false); setPw(""); setName(""); load(); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const copy = (t) => { navigator.clipboard?.writeText(t).then(() => toast("Copiado", { icon: "content_copy" })).catch(() => {}); };
  if (!items) return null;
  return <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}><Ic name="lan" size={17} /> Conectar como unidad</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Tus archivos de Sotos como una carpeta más en tu computador o celular, sin abrir el navegador. Cada dispositivo usa su propia clave, que puedes revocar cuando quieras.</div></div>
      <button className="tb-btn primary" onClick={() => setAsk(true)}><Ic name="add_link" /> Conectar un dispositivo</button>
    </div>
    <div className="dav-addr"><span className="faint">Dirección</span><code>{addr}</code><button className="tb-btn icon" title="Copiar" onClick={() => copy(addr)}><Ic name="content_copy" size={16} /></button>
      <span className="faint">Usuario</span><code>{user.email}</code><button className="tb-btn icon" title="Copiar" onClick={() => copy(user.email)}><Ic name="content_copy" size={16} /></button></div>
    <button className="login-alt" style={{ padding: 0, fontSize: 12.5 }} onClick={() => setHelp(h => !h)}>{help ? "Ocultar instrucciones" : "¿Cómo lo conecto?"}</button>
    {help && <div className="dav-help">
      <div><b>Windows</b>: en el Explorador, clic derecho en «Este equipo» → <i>Agregar una ubicación de red</i> y pega la dirección. Windows solo acepta claves por HTTPS: si tu Sotos usa <code>http://</code>, usa una app como RaiDrive, Cyberduck o WinSCP.</div>
      <div><b>Mac</b>: en Finder, <i>Ir → Conectarse al servidor</i> (⌘K) y pega la dirección.</div>
      <div><b>Linux</b>: en Archivos, <i>Otras ubicaciones → Conectar al servidor</i>, con <code>davs://</code> (o <code>dav://</code>) en vez de <code>https://</code>.</div>
      <div><b>Android</b>: Solid Explorer, CX File Explorer o Material Files («WebDAV»). <b>iPhone</b>: Documents de Readdle, FE File Explorer o Cyberduck.</div>
      <div className="faint">Lo que borres desde la unidad va a la Papelera de Sotos.</div>
    </div>}
    {!!items.length && <div className="dav-list">{items.map(k => <div key={k.id} className="dav-row"><Ic name="devices" size={18} /><div style={{ flex: 1 }}><b>{k.name}</b><div className="faint" style={{ fontSize: 11.5 }}>Creada {fmtDate(k.created)} · {k.last_used ? "último uso " + fmtDate(k.last_used) : "aún sin usar"}</div></div>
      <button className="tb-btn danger" onClick={async () => { await api("DELETE", "dav-keys/" + k.id).catch(e => toast(e.message, { error: true })); load(); toast("Ese dispositivo ya no tiene acceso", { icon: "link_off" }); }}>Revocar</button></div>)}</div>}
    {ask && <Modal title="Conectar un dispositivo" icon="add_link" onClose={() => setAsk(false)} width={420}
      actions={<><button className="tb-btn" onClick={() => setAsk(false)}>Cancelar</button><button className="tb-btn primary" disabled={!pw || busy} onClick={create}>Crear clave</button></>}>
      <label className="field" style={{ marginBottom: 10 }}>Nombre del dispositivo<input placeholder="Ej. Portátil del trabajo" value={name} onChange={e => setName(e.target.value)} autoFocus /></label>
      <label className="field">Tu contraseña de Sotos (para confirmar)<input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && pw && create()} /></label>
    </Modal>}
    {made && <Modal title="Clave para el dispositivo" icon="key" onClose={() => setMade(null)} width={440}
      actions={<button className="tb-btn primary" onClick={() => setMade(null)}>Listo</button>}>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>Escríbela en el dispositivo como contraseña, con tu correo como usuario. <b>Solo se muestra ahora.</b></div>
      <div className="dav-key"><code>{made}</code><button className="tb-btn" onClick={() => copy(made)}><Ic name="content_copy" /> Copiar</button></div>
      <div className="faint" style={{ fontSize: 12 }}>Dirección: {addr}</div>
    </Modal>}
  </div>;
}

/** verificación en dos pasos: código QR para la app de autenticación + códigos de recuperación */
function TwoFactorPanel() {
  const [st, setSt] = useS4(null), [step, setStep] = useS4(null), [pw, setPw] = useS4(""), [code, setCode] = useS4(""), [setup, setSetup] = useS4(null), [qr, setQr] = useS4(null), [codes, setCodes] = useS4(null), [busy, setBusy] = useS4(false);
  const load = () => api("GET", "auth/2fa").then(setSt).catch(() => {});
  React.useEffect(() => { load(); }, []);
  const close = () => { setStep(null); setPw(""); setCode(""); setSetup(null); setQr(null); };
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message, { error: true }); } setBusy(false); };
  const start = () => run(async () => { const r = await api("POST", "auth/2fa-setup", { password: pw }); setSetup(r); const QR = (await import("qrcode")).default; setQr(await QR.toDataURL(r.uri, { margin: 1, width: 220, color: { dark: "#1f1d1a", light: "#ffffff" } })); setStep("scan"); });
  const enable = () => run(async () => { const r = await api("POST", "auth/2fa-enable", { code }); setCodes(r.recoveryCodes); close(); load(); });
  const disable = () => run(async () => { await api("POST", "auth/2fa-disable", { password: pw, code }); toast("Verificación en dos pasos desactivada", { icon: "lock_open" }); close(); load(); });
  if (!st) return null;
  return <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}><Ic name="phonelink_lock" size={17} /> Verificación en dos pasos {st.enabled && <span className="tfa-on">Activa</span>}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{st.enabled ? `Al iniciar sesión se pide también un código de tu celular. Te quedan ${st.recoveryLeft} código(s) de recuperación.` : "Además de la contraseña, pide un código de una app como Google Authenticator, Microsoft Authenticator o Authy. Así nadie entra aunque adivine tu contraseña."}</div></div>
      {st.enabled ? <button className="tb-btn" onClick={() => setStep("off")}>Desactivar</button> : <button className="tb-btn primary" onClick={() => setStep("pw")}><Ic name="add_moderator" /> Activar</button>}
    </div>
    {step && <Modal title={step === "off" ? "Desactivar la verificación en dos pasos" : "Activar la verificación en dos pasos"} icon="phonelink_lock" onClose={close} width={440}
      actions={<><button className="tb-btn" onClick={close}>Cancelar</button>
        {step === "pw" && <button className="tb-btn primary" disabled={!pw || busy} onClick={start}>Continuar</button>}
        {step === "scan" && <button className="tb-btn primary" disabled={code.length !== 6 || busy} onClick={enable}>Activar</button>}
        {step === "off" && <button className="tb-btn danger" disabled={!pw || code.length < 6 || busy} onClick={disable}>Desactivar</button>}</>}>
      {step === "pw" && <><div style={{ fontSize: 13, marginBottom: 10 }}>Confirma tu contraseña para empezar.</div>
        <input type="password" className="sc-input" style={{ margin: 0, width: "100%", boxSizing: "border-box" }} autoFocus placeholder="Contraseña" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && pw && start()} /></>}
      {step === "scan" && <>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>1. Abre tu app de autenticación y escanea este código.</div>
        <div className="tfa-qr">{qr && <img src={qr} alt="Código QR para la app de autenticación" />}</div>
        <div className="faint" style={{ fontSize: 12, textAlign: "center" }}>¿No puedes escanear? Escribe esta clave: <code className="tfa-secret">{setup?.secret}</code></div>
        <div style={{ fontSize: 13, margin: "12px 0 6px" }}>2. Escribe el código de 6 dígitos que aparece en la app.</div>
        <input className="sc-input tfa-code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && code.length === 6 && enable()} autoFocus />
      </>}
      {step === "off" && <><div style={{ fontSize: 13, marginBottom: 10 }}>Escribe tu contraseña y un código de la app (o un código de recuperación).</div>
        <input type="password" className="sc-input" style={{ margin: "0 0 8px", width: "100%", boxSizing: "border-box" }} placeholder="Contraseña" value={pw} onChange={e => setPw(e.target.value)} />
        <input className="sc-input tfa-code" placeholder="Código" value={code} onChange={e => setCode(e.target.value.replace(/[^0-9a-z-]/gi, "").slice(0, 9))} /></>}
    </Modal>}
    {codes && <Modal title="Guarda tus códigos de recuperación" icon="key" onClose={() => setCodes(null)} width={440}
      actions={<><button className="tb-btn" onClick={() => { const b = new Blob(["Códigos de recuperación de Sotos (cada uno sirve una sola vez)\n\n" + codes.join("\n") + "\n"], { type: "text/plain" }); const u = URL.createObjectURL(b); const x = document.createElement("a"); x.href = u; x.download = "sotos-codigos-de-recuperacion.txt"; x.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); }}><Ic name="download" /> Descargar</button>
        <button className="tb-btn primary" onClick={() => setCodes(null)}>Ya los guardé</button></>}>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>La verificación en dos pasos quedó <b>activa</b>. Si pierdes el celular, entra con uno de estos códigos (cada uno sirve una vez). <b>Solo se muestran ahora.</b></div>
      <div className="tfa-codes">{codes.map(c => <code key={c}>{c}</code>)}</div>
    </Modal>}
  </div>;
}

/* Región: zona horaria, formato de fecha y extensiones de archivo */
const ZONES = (() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return ["America/Bogota", "America/Mexico_City", "America/New_York", "Europe/Madrid", "America/Argentina/Buenos_Aires", "UTC"]; } })();
function RegionPanel({ settings, update }) {
  const r = { timeZone: "auto", dateFormat: "auto", showExt: true, ...(settings.region || {}) };
  const set = (k, v) => update("region", { ...r, [k]: v });
  const sample = new Date(2026, 11, 24, 18, 30);
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <>
    <h2 style={{ fontSize: 19, fontWeight: 800 }}>Región</h2>
    <Row label="Zona horaria" desc={`Reloj, widgets y fechas de archivos. Este equipo usa ${here}.`}>
      <select className="sc-input" style={{ margin: 0, width: 240 }} value={r.timeZone} onChange={e => set("timeZone", e.target.value)}>
        <option value="auto">Automática (la del equipo)</option>
        {ZONES.map(z => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
      </select>
    </Row>
    <Row label="Formato de fecha" desc="Cómo se muestran las fechas en Archivos y en el resto del sistema">
      <Segmented value={r.dateFormat} onChange={v => set("dateFormat", v)} options={[{ v: "auto", label: "24 dic" }, { v: "dmy", label: "24/12/2026" }, { v: "mdy", label: "12/24/2026" }, { v: "ymd", label: "2026-12-24" }]} />
    </Row>
    <Row label="Extensiones de archivo" desc="Mostrar .docx, .pdf, .jpg… al final de los nombres">
      <Segmented value={r.showExt ? "y" : "n"} onChange={v => set("showExt", v === "y")} options={[{ v: "y", label: "Mostrar" }, { v: "n", label: "Ocultar" }]} />
    </Row>
    <Row label="Idioma" desc="La traducción completa de Sotos llegará en una próxima versión">
      <Segmented value="es" onChange={() => {}} options={[{ v: "es", label: "Español" }]} />
    </Row>
    <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Ejemplo: {sample.toLocaleString("es-ES", { timeZone: r.timeZone === "auto" ? undefined : r.timeZone, dateStyle: "medium", timeStyle: "short" })}</div>
  </>;
}

function SettingsApp({ settings, update, profile, setProfile, user, env, onLogout, tab: openTab }) {
  const [tab, setTab] = useS4(openTab || "perfil");
  useE4(() => { if (openTab) setTab(openTab); }, [openTab]);
  const avatarInput = useR4(null);
  const tabs = [
    { id: "perfil", icon: "account_circle", label: "Perfil" },
    { id: "cuenta", icon: user ? "cloud_done" : "cloud_off", label: "Cuenta" },
    { id: "fondo", icon: "wallpaper", label: "Fondo" },
    { id: "apariencia", icon: "palette", label: "Apariencia" },
    { id: "escritorio", icon: "desktop_windows", label: "Escritorio" },
    { id: "region", icon: "language", label: "Región" },
    { id: "acerca", icon: "info", label: "Acerca de" },
  ];
  // la foto se guarda en la cuenta (si hay) y en este navegador; las subidas se reducen a 256×256
  // cambiar la foto o el nombre de una cuenta pide su contraseña (el servidor la verifica)
  const [pwAsk, setPwAsk] = useS4(null), [pwVal, setPwVal] = useS4(""), [pwBusy, setPwBusy] = useS4(false);
  const [nameDraft, setNameDraft] = useS4(null);
  const withPassword = (title, run) => user ? (setPwVal(""), setPwAsk({ title, run })) : run(null);
  const saveAvatar = (av) => withPassword("Cambiar la foto de perfil", async (password) => {
    if (user) await api("PUT", "auth/avatar", { avatar: av, password }); setProfile({ avatar: av }); toast("Foto de perfil actualizada", { icon: "account_circle" }); });
  const saveName = () => { const nm = (nameDraft || "").trim(); if (!nm || nm === profile.name) return setNameDraft(null);
    withPassword("Cambiar tu nombre", async (password) => { if (user) await api("PUT", "auth/name", { name: nm, password }); setProfile({ name: nm }); setNameDraft(null); toast("Nombre actualizado", { icon: "badge" }); }); };
  const confirmPw = async () => { setPwBusy(true); try { await pwAsk.run(pwVal); setPwAsk(null); } catch (e) { toast(e.message, { error: true }); } setPwBusy(false); };
  const onAvatar = (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; const url = URL.createObjectURL(f); const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 256; const s = Math.min(im.naturalWidth, im.naturalHeight);
      c.getContext("2d").drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 256, 256); URL.revokeObjectURL(url); saveAvatar(c.toDataURL("image/jpeg", 0.86)); };
    im.onerror = () => toast("No se pudo leer esa imagen", { error: true }); im.src = url; };
  const fonts = [
    { v: "Onest", label: "Onest" },
    { v: "Hanken Grotesk", label: "Hanken" },
    { v: "Space Grotesk", label: "Space" },
    { v: "JetBrains Mono", label: "Mono" },
  ];

  return (
    <div className="app">
      <div className="app-side" style={{ width: 180, flexBasis: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 14px" }}>
          <Avatar profile={profile} size={40} />
          <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{profile.name}</div><div className="faint" style={{ fontSize: 11.5 }}>{user ? user.email : "Invitado"}</div></div>
        </div>
        {tabs.map(t => <SideItem key={t.id} icon={t.icon} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />)}
      </div>
      <div className="app-main">
        <div className="scroll" style={{ flex: 1, padding: "8px 28px 28px" }}>
          {tab === "perfil" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Mi perfil</h2>
            <input ref={avatarInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onAvatar} />
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ position: "relative" }}>
                <Avatar profile={profile} size={84} />
                <button onClick={() => avatarInput.current.click()} title="Cambiar foto"
                  style={{ position: "absolute", right: -4, bottom: -4, width: 30, height: 30, borderRadius: "50%", border: "2px solid var(--surface)", background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center" }}><Ic name="photo_camera" size={16} /></button>
              </div>
              <div>
                <div className="wl-btns" style={{ marginTop: 0 }}>
                  <button className="tb-btn primary" onClick={() => avatarInput.current.click()}><Ic name="upload" /> Cambiar foto</button>
                </div>
                <div className="avatar-picks">{DEFAULT_AVATARS.map(([k, label]) => <button key={k} title={label} className={"avatar-pick" + (profile.avatar === "def:" + k ? " on" : "")} onClick={() => saveAvatar("def:" + k)}><img src={avatarUrl("def:" + k)} alt={label} /></button>)}</div>
                <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Elige uno de los avatares o sube tu foto (PNG o JPG). {user ? "Se guarda en tu cuenta." : "Se guarda en este navegador."}</div>
              </div>
            </div>
            <Row label="Nombre" desc="Aparece en el login y la barra superior">
              <div style={{ display: "flex", gap: 6 }}><input className="sc-input" style={{ margin: 0, width: 220 }} value={nameDraft ?? profile.name} onChange={e => setNameDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && saveName()} />
                {nameDraft != null && nameDraft !== profile.name && <button className="tb-btn primary" onClick={saveName}>Guardar</button>}</div>
            </Row>
          </>}
          {pwAsk && <Modal title={pwAsk.title} icon="lock" onClose={() => setPwAsk(null)} width={400}
            actions={<><button className="tb-btn" onClick={() => setPwAsk(null)}>Cancelar</button><button className="tb-btn primary" disabled={!pwVal || pwBusy} onClick={confirmPw}>{pwBusy ? "…" : "Confirmar"}</button></>}>
            <div style={{ fontSize: 13, marginBottom: 10 }}>Para cambiar tu perfil, confirma que eres tú con la contraseña de tu cuenta.</div>
            <input type="password" className="sc-input" style={{ margin: 0, width: "100%", boxSizing: "border-box" }} autoFocus placeholder="Contraseña" value={pwVal} onChange={e => setPwVal(e.target.value)} onKeyDown={e => e.key === "Enter" && pwVal && confirmPw()} />
          </Modal>}
          {tab === "cuenta" && <AccountPanel user={user} env={env} onLogout={onLogout} />}
          {tab === "fondo" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Fondo de escritorio</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>Ilustraciones de Sotos inspiradas en paisajes de Colombia, dibujadas a la resolución de tu pantalla. También puedes usar una foto: clic derecho sobre una imagen → <b>Usar como fondo</b>.</div>
            <div className="wall-group">Ilustraciones</div>
            <div className="wall-grid">
              {WALLS.map(w => <WallThumb key={w.id} w={w} on={settings.wallpaper === w.id} onPick={() => update("wallpaper", w.id)} />)}
            </div>
            <div className="wall-group">Fotos <span className="faint">· de Colombia, libres de derechos (CC0). En el tema Grafito se ven en blanco y negro.</span></div>
            <div className="wall-grid">
              {PHOTO_WALLS.map(w => <WallThumb key={w.id} w={w} on={settings.wallpaper === w.id} onPick={() => update("wallpaper", w.id)} />)}
            </div>
            {String(settings.wallpaper).startsWith("file:") && <div className="faint" style={{ fontSize: 12.5, marginTop: 12 }}><Ic name="image" size={15} /> Ahora usas una imagen propia como fondo.</div>}
          </>}
          {tab === "apariencia" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Apariencia</h2>
            <div className="skin-grid">
              {[{ v: "sotos", label: "Sotos", desc: "Papel, tinta y color plano", accent: "#c4532f" },
                { v: "grafito", label: "Grafito", desc: "Gris y carbón, dock lateral, fondo en blanco y negro", accent: "#60b25e" }].map(k => (
                <button key={k.v} className={"skin-card" + ((settings.skin || "sotos") === k.v ? " on" : "")}
                  onClick={() => { update("skin", k.v); if (["#c4532f", "#60b25e"].includes(settings.accent)) update("accent", k.accent);
                    const isPhoto = String(settings.wallpaper).startsWith("foto-");
                    if (k.v === "grafito" && !isPhoto && !String(settings.wallpaper).startsWith("file:")) update("wallpaper", "foto-usaquen");
                    if (k.v === "sotos" && isPhoto) update("wallpaper", "paramo"); }}>
                  <span className={"skin-prev skin-prev-" + k.v + (settings.theme === "dark" ? " dark" : "")}><i /><b /><em /></span>
                  <span className="skin-name">{k.label}{(settings.skin || "sotos") === k.v && <Ic name="check_circle" size={16} />}</span>
                  <span className="skin-desc">{k.desc}</span>
                </button>))}
            </div>
            {settings.skin === "grafito" && <Row label="Fondo en blanco y negro" desc="Como las fotos en grises del escritorio Grafito">
              <Segmented value={settings.wallGray === false ? "n" : "y"} onChange={v => update("wallGray", v === "y")}
                options={[{ v: "y", label: "Sí" }, { v: "n", label: "Color" }]} />
            </Row>}
            <Row label="Logo del sistema" desc="Clásico: el husky y la gata, el logo original de Sotos. Se ve al arrancar, en la barra superior y en el dock lateral">
              <Segmented value={settings.logo === "clasico" ? "clasico" : "actual"} onChange={v => update("logo", v)}
                options={[{ v: "actual", label: "Actual" }, { v: "clasico", label: "Clásico" }]} />
            </Row>
            <Row label="Tema" desc="Claro u oscuro para todo el sistema">
              <Segmented value={settings.theme} onChange={v => update("theme", v)}
                options={[{ v: "light", label: "Claro", icon: "light_mode" }, { v: "dark", label: "Oscuro", icon: "dark_mode" }]} />
            </Row>
            <Row label="Color de acento" desc="Botones, selección y resaltados">
              <div style={{ display: "flex", gap: 8 }}>
                {ACCENTS.map(c => (
                  <button key={c} onClick={() => update("accent", c)}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: "2px solid var(--surface)",
                      boxShadow: settings.accent === c ? `0 0 0 2px ${c}` : "0 0 0 1px var(--border)", display: "grid", placeItems: "center" }}>
                    {settings.accent === c && <Ic name="check" size={16} style={{ color: "#fff" }} />}
                  </button>
                ))}
              </div>
            </Row>
            {settings.skin !== "grafito" && <><Row label="Tipografía" desc="Fuente de la interfaz">
              <Segmented value={settings.font} onChange={v => update("font", v)} options={fonts} />
            </Row>
            <Row label="Estilo de ventana" desc="Esquinas y sombras">
              <Segmented value={settings.winStyle} onChange={v => update("winStyle", v)}
                options={[{ v: "soft", label: "Suave" }, { v: "sharp", label: "Recto" }, { v: "flat", label: "Plano" }]} />
            </Row></>}
          </>}
          {tab === "escritorio" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Escritorio y Dock</h2>
            {settings.skin !== "grafito" && <Row label="Posición del dock" desc="Dónde aparece la barra de apps">
              <Segmented value={settings.dock} onChange={v => update("dock", v)}
                options={[{ v: "bottom", label: "Abajo", icon: "dock_to_bottom" }, { v: "left", label: "Izquierda", icon: "dock_to_right" }]} />
            </Row>}
            <Row label="Reloj 24h" desc="Formato de hora en la barra superior">
              <Segmented value={settings.clock24 ? "y" : "n"} onChange={v => update("clock24", v === "y")}
                options={[{ v: "y", label: "24h" }, { v: "n", label: "12h" }]} />
            </Row>
          </>}
          {tab === "region" && <RegionPanel settings={settings} update={update} />}
          {tab === "acerca" && <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 12 }}>
              <div className="about-logo"><SotosMark size={96} variant="tile" spin /></div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>Sotos OS</div>
              <div className="muted" style={{ fontSize: 14 }}>Tu ordenador en la nube · Versión 2.2</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, width: 320, marginTop: 8, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {[["Usuario", profile.name], ["Modo", user ? "Cuenta en la nube" : "Invitado (este navegador)"], ["Almacenamiento", fmtSize(vfs.usedBytes()) + " usados"], ["Apps", (APPS.length - 1) + " instaladas"]].map(([k, v], i) => (
                  <React.Fragment key={i}>
                    <div className="faint" style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>{k}</div>
                    <div style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{v}</div>
                  </React.Fragment>
                ))}
              </div>
              <LanInfo />
              <div className="about-credit">
                <div style={{ fontWeight: 700 }}>Diseñado por Sebastián Sotomontes</div>
                <div className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>Dedicado a mis 3 gatas <b>Luna</b>, <b>Lumia</b> y <b>Lyra</b><br />y a mi husky <b>Hashy</b> 🐾</div>
                <div className="about-mascots"><SotosLogo size={96} animate /></div>
                <div className="about-thanks"><span className="faint">Agradecimientos</span><b>Basted</b> y <b>Lyanna</b></div>
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Tienda -------------------- */
// apps de la Tienda: proyectos HTML que corren aislados en su ventana
function WebApp({ appId }) {
  const app = APPS.find(a => a.id === appId);
  if (!app) return <EmptyState icon="error" text="App no encontrada" />;
  return <iframe title={app.name} src={import.meta.env.BASE_URL + app.url} allow="fullscreen; clipboard-read; clipboard-write; camera; microphone; gamepad; autoplay"
    style={{ flex: 1, width: "100%", height: "100%", border: 0, background: "#fff" }} />;
}
const Stars = ({ value = 0, size = 15, onPick }) => <span className="stars">{[1, 2, 3, 4, 5].map(i => onPick
  ? <button key={i} type="button" className={"star-btn" + (i <= Math.round(value) ? " on" : "")} title={`${i} estrella${i > 1 ? "s" : ""}`} onClick={() => onPick(i)}><Ic name="star" size={size} style={{ fontVariationSettings: "'FILL' 1" }} /></button>
  : <Ic key={i} name="star" size={size} className={i <= Math.round(value) ? "on" : ""} style={{ fontVariationSettings: "'FILL' 1" }} />)}</span>;
function StoreApp({ openApp }) {
  const mode = useVfs(s => s.mode), cloud = mode === "cloud";
  const [, tick] = useS4(0);
  const [cat, setCat] = useS4("Todo"), [detail, setDetail] = useS4(null), [busy, setBusy] = useS4(null);
  React.useEffect(() => { loadInstalled(); return subscribeInstalled(() => tick(x => x + 1)); }, [mode]);
  const items = APPS.filter(a => a.store);
  const cats = ["Todo", ...new Set(items.map(a => a.cat))];
  const list = items.filter(a => cat === "Todo" || a.cat === cat);
  const ratings = getRatings();
  const toggle = async (a) => { setBusy(a.id); try { const on = !isInstalled(a.id); await setInstalled(a.id, on); toast(on ? `${a.name} instalada · está en Aplicaciones` : `${a.name} desinstalada`, { icon: on ? "download_done" : "delete" }); } catch (e) { toast(e.message, { error: true }); } setBusy(null); };
  return (
    <div className="app">
      <div className="app-side" style={{ width: 180, flexBasis: 180 }}>
        <div className="side-label">Tienda</div>
        {cats.map(c => <SideItem key={c} icon={c === "Todo" ? "apps" : "category"} label={c} active={cat === c} onClick={() => setCat(c)} />)}
        <div className="side-label">Instaladas</div>
        {items.filter(a => isInstalled(a.id)).map(a => <SideItem key={a.id} icon={a.icon} label={a.name} color={a.color} onClick={() => openApp(a.id)} />)}
      </div>
      <div className="app-main">
        <div className="store-hero">
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Amplía tu Sotos</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Herramientas hechas por Sebastian Sotomontes. Se instalan al instante, sin descargas, y funcionan dentro de Sotos.</div>
        </div>
        <div className="scroll" style={{ flex: 1, padding: 20 }}>
          <div className="store-grid">
            {list.map(a => { const r = ratings[a.id], on = isInstalled(a.id); return (
              <div key={a.id} className="store-card">
                <div style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }} onClick={() => setDetail(a)}>
                  <Tile icon={a.icon} color={a.color} size={52} app={a.id} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{a.name}</div><div className="faint" style={{ fontSize: 12 }}>{a.cat}</div>
                    <div className="store-rating">{r ? <><Stars value={r.avg} size={13} /> <span className="faint">{r.avg} ({r.count})</span></> : <span className="faint">Sin reseñas</span>}</div></div>
                </div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "10px 0 12px", minHeight: 38 }}>{a.desc}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {on && <button className="tb-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => openApp(a.id)}><Ic name="open_in_new" /> Abrir</button>}
                  <button className={"tb-btn" + (on ? "" : " primary")} style={{ flex: on ? "0 0 auto" : 1, justifyContent: "center" }} disabled={busy === a.id} onClick={() => toggle(a)}>
                    {on ? <Ic name="delete" /> : <><Ic name="download" /> Instalar</>}</button>
                </div>
              </div>); })}
          </div>
        </div>
      </div>
      {detail && <StoreDetail a={detail} cloud={cloud} onClose={() => setDetail(null)} onToggle={() => toggle(detail)} onOpen={() => { setDetail(null); openApp(detail.id); }} />}
    </div>
  );
}
function StoreDetail({ a, cloud, onClose, onToggle, onOpen }) {
  const [reviews, setReviews] = useS4(null), [stars, setStars] = useS4(0), [text, setText] = useS4("");
  const load = () => cloud ? api("GET", `store/${a.id}/reviews`).then(r => { setReviews(r.items); const m = r.items.find(x => x.mine); if (m) { setStars(m.stars); setText(m.text || ""); } }).catch(() => setReviews([])) : setReviews([]);
  React.useEffect(() => { load(); }, [a.id]);
  const on = isInstalled(a.id);
  return (
    <Modal title={a.name} icon={a.icon} onClose={onClose} width={520}
      actions={<><button className="tb-btn" onClick={onClose}>Cerrar</button>{on && <button className="tb-btn" onClick={onOpen}><Ic name="open_in_new" /> Abrir</button>}<button className={"tb-btn" + (on ? " danger" : " primary")} onClick={onToggle}>{on ? "Desinstalar" : "Instalar"}</button></>}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}><Tile icon={a.icon} color={a.color} size={64} app={a.id} />
        <div><div className="faint" style={{ fontSize: 12 }}>{a.cat} · por Sebastian Sotomontes</div><div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 4 }}>{a.desc}</div></div></div>
      <div className="side-label" style={{ marginTop: 16 }}>Reseñas</div>
      {cloud ? <div className="store-review-form"><Stars value={stars} size={22} onPick={setStars} />
        <input placeholder="¿Qué te pareció? (opcional)" maxLength={1000} value={text} onChange={e => setText(e.target.value)} />
        <button className="tb-btn primary" disabled={!stars} onClick={async () => { try { await api("POST", `store/${a.id}/reviews`, { stars, text }); toast("Gracias por tu reseña", { icon: "star" }); load(); loadInstalled(); } catch (e) { toast(e.message, { error: true }); } }}>Publicar</button></div>
        : <div className="faint" style={{ fontSize: 12.5 }}>Inicia sesión para dejar una reseña.</div>}
      <div className="store-reviews">{reviews?.map((r, i) => <div key={i} className="store-review"><Stars value={r.stars} size={13} /><b>{r.author}{r.mine ? " (tú)" : ""}</b><span className="faint">{new Date(r.created).toLocaleDateString("es-CO")}</span>{r.text && <div>{r.text}</div>}</div>)}
        {reviews && !reviews.length && <div className="faint" style={{ fontSize: 12.5, padding: "6px 0" }}>Todavía nadie ha opinado.</div>}</div>
    </Modal>
  );
}
export { SettingsApp, StoreApp, WebApp };
