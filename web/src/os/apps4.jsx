/* ============================================================
   Sotos OS — Settings & Store
   ============================================================ */
import React from "react";
import { APPS, WALLPAPERS, ACCENTS, STORE_APPS } from "./data.jsx";
import { SotosLogo } from "./logo.jsx";
import { Tile, Ic, SideItem, Avatar, Modal, toast } from "./ui.jsx";
import * as vfs from "./vfs.js";
import { useVfs, fmtSize } from "./vfs.js";
import { api } from "./api.js";
import { WALLS, wallUrl } from "./wallpapers.js";
const { useState: useS4, useRef: useR4 } = React;

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
    </button>
  );
}

function AccountPanel({ user, env, onLogout }) {
  const sync = useVfs(s => s.sync);
  const [cur, setCur] = useS4(""), [next, setNext] = useS4(""), [busy, setBusy] = useS4(false), [confirm, setConfirm] = useS4(false);
  if (!user) return <>
    <h2 style={{ fontSize: 19, fontWeight: 800 }}>Cuenta</h2>
    <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 520 }}>Estás usando Sotos como <b>invitado</b>: tus archivos viven solo en este navegador. {env?.server ? "Con una cuenta tus archivos te siguen a cualquier dispositivo y puedes compartirlos con enlaces." : "Este Sotos funciona sin servidor, así que las cuentas no están disponibles aquí."}</div>
    {env?.server && <div className="wl-btns" style={{ justifyContent: "flex-start" }}><button className="tb-btn primary" onClick={onLogout}><Ic name="login" /> Iniciar sesión o crear cuenta</button></div>}
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
    <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Cambiar contraseña</div>
      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field" style={{ maxWidth: 200 }}>Actual<input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></label>
        <label className="field" style={{ maxWidth: 200 }}>Nueva (mín. 8)<input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} /></label>
        <button className="tb-btn primary" disabled={busy || !cur || next.length < 8} onClick={changePw}>Cambiar</button>
      </div>
    </div>
  </>;
}

function SettingsApp({ settings, update, profile, setProfile, user, env, onLogout }) {
  const [tab, setTab] = useS4("perfil");
  const avatarInput = useR4(null);
  const tabs = [
    { id: "perfil", icon: "account_circle", label: "Perfil" },
    { id: "cuenta", icon: user ? "cloud_done" : "cloud_off", label: "Cuenta" },
    { id: "fondo", icon: "wallpaper", label: "Fondo" },
    { id: "apariencia", icon: "palette", label: "Apariencia" },
    { id: "escritorio", icon: "desktop_windows", label: "Escritorio" },
    { id: "acerca", icon: "info", label: "Acerca de" },
  ];
  const onAvatar = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setProfile({ avatar: rd.result }); rd.readAsDataURL(f); e.target.value = ""; };
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
                  {profile.avatar && <button className="tb-btn" onClick={() => setProfile({ avatar: null })}><Ic name="delete" /> Quitar</button>}
                </div>
                <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>PNG o JPG. Se guarda en tu sesión.</div>
              </div>
            </div>
            <Row label="Nombre" desc="Aparece en el login y la barra superior">
              <input className="sc-input" style={{ margin: 0, width: 220 }} value={profile.name} onChange={e => setProfile({ name: e.target.value })} />
            </Row>
          </>}
          {tab === "cuenta" && <AccountPanel user={user} env={env} onLogout={onLogout} />}
          {tab === "fondo" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Fondo de escritorio</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>Ilustraciones de Sotos inspiradas en paisajes de Colombia, dibujadas a la resolución de tu pantalla. También puedes usar una foto: clic derecho sobre una imagen → <b>Usar como fondo</b>.</div>
            <div className="wall-grid">
              {WALLS.map(w => <WallThumb key={w.id} w={w} on={settings.wallpaper === w.id} onPick={() => update("wallpaper", w.id)} />)}
            </div>
            {String(settings.wallpaper).startsWith("file:") && <div className="faint" style={{ fontSize: 12.5, marginTop: 12 }}><Ic name="image" size={15} /> Ahora usas una imagen propia como fondo.</div>}
          </>}
          {tab === "apariencia" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Apariencia</h2>
            <div className="skin-grid">
              {[{ v: "sotos", label: "Sotos", desc: "Papel, tinta y color plano", accent: "#c4532f" },
                { v: "grafito", label: "Grafito", desc: "Gris y carbón, dock lateral, fondo en blanco y negro", accent: "#60b25e" }].map(k => (
                <button key={k.v} className={"skin-card" + ((settings.skin || "sotos") === k.v ? " on" : "")}
                  onClick={() => { update("skin", k.v); if (["#c4532f", "#60b25e"].includes(settings.accent)) update("accent", k.accent); }}>
                  <span className={"skin-prev skin-prev-" + k.v + (settings.theme === "dark" ? " dark" : "")}><i /><b /><em /></span>
                  <span className="skin-name">{k.label}{(settings.skin || "sotos") === k.v && <Ic name="check_circle" size={16} />}</span>
                  <span className="skin-desc">{k.desc}</span>
                </button>))}
            </div>
            {settings.skin === "grafito" && <Row label="Fondo en blanco y negro" desc="Como las fotos en grises del escritorio Grafito">
              <Segmented value={settings.wallGray === false ? "n" : "y"} onChange={v => update("wallGray", v === "y")}
                options={[{ v: "y", label: "Sí" }, { v: "n", label: "Color" }]} />
            </Row>}
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
          {tab === "acerca" && <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 12 }}>
              <div className="about-logo"><SotosLogo size={96} animate /></div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>Sotos OS</div>
              <div className="muted" style={{ fontSize: 14 }}>Tu ordenador en la nube · Versión 2.0</div>
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
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Store -------------------- */
function StoreApp() {
  const [installed, setInstalled] = useS4({});
  const [cat, setCat] = useS4("Todo");
  const cats = ["Todo", ...new Set(STORE_APPS.map(a => a.cat))];
  const list = STORE_APPS.filter(a => cat === "Todo" || a.cat === cat);
  return (
    <div className="app">
      <div className="app-side" style={{ width: 170, flexBasis: 170 }}>
        <div className="side-label">Tienda</div>
        {cats.map(c => <SideItem key={c} icon={c === "Todo" ? "apps" : "category"} label={c} active={cat === c} onClick={() => setCat(c)} />)}
      </div>
      <div className="app-main">
        <div style={{ padding: "24px 28px 10px", borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg, color-mix(in srgb,var(--accent) 16%,transparent), transparent)" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Amplía tu Sotos</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Añade herramientas a tu escritorio. Se instalan al instante, sin descargas.</div>
        </div>
        <div className="scroll" style={{ flex: 1, padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
            {list.map(a => (
              <div key={a.name} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 16, background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Tile icon={a.icon} color={a.color} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{a.name}</div>
                    <div className="faint" style={{ fontSize: 12 }}>{a.cat}</div>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "12px 0 14px", minHeight: 36 }}>{a.desc}</div>
                <button onClick={() => setInstalled(s => ({ ...s, [a.name]: true }))}
                  className={"tb-btn" + (installed[a.name] ? "" : " primary")}
                  style={{ width: "100%", justifyContent: "center", opacity: installed[a.name] ? .7 : 1 }}>
                  {installed[a.name] ? <><Ic name="check" /> Instalada</> : <><Ic name="download" /> Obtener</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { SettingsApp, StoreApp };
