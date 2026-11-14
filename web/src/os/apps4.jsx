/* ============================================================
   Sotos OS — Settings & Store
   ============================================================ */
import React from "react";
import { APPS, WALLPAPERS, ACCENTS, STORE_APPS } from "./data.jsx";
import { SotosLogo } from "./logo.jsx";
import { Tile, Ic, SideItem, Avatar } from "./ui.jsx";
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
        <button key={o.v} onClick={() => onChange(o.v)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "none", fontSize: 13, fontWeight: 600,
            background: value === o.v ? "var(--surface)" : "transparent", color: value === o.v ? "var(--text)" : "var(--text-dim)",
            boxShadow: value === o.v ? "var(--shadow-card)" : "none" }}>
          {o.icon && <Ic name={o.icon} size={17} />}{o.label}
        </button>
      ))}
    </div>
  );
}

function SettingsApp({ settings, update, profile, setProfile }) {
  const [tab, setTab] = useS4("perfil");
  const avatarInput = useR4(null);
  const tabs = [
    { id: "perfil", icon: "account_circle", label: "Perfil" },
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
          <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{profile.name}</div><div className="faint" style={{ fontSize: 11.5 }}>Plan Pro</div></div>
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
          {tab === "fondo" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Fondo de escritorio</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginTop: 8 }}>
              {WALLPAPERS.map(w => (
                <div key={w.id} onClick={() => update("wallpaper", w.id)}
                  style={{ aspectRatio: "16/10", borderRadius: 12, background: w.css, cursor: "pointer", position: "relative",
                    boxShadow: "var(--shadow-card)", outline: settings.wallpaper === w.id ? "3px solid var(--accent)" : "none", outlineOffset: 2 }}>
                  {settings.wallpaper === w.id && <div style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%",
                    background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center" }}><Ic name="check" size={15} /></div>}
                  <div style={{ position: "absolute", bottom: 8, left: 10, color: "#fff", fontSize: 12.5, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{w.name}</div>
                </div>
              ))}
            </div>
          </>}
          {tab === "apariencia" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Apariencia</h2>
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
            <Row label="Tipografía" desc="Fuente de la interfaz">
              <Segmented value={settings.font} onChange={v => update("font", v)} options={fonts} />
            </Row>
            <Row label="Estilo de ventana" desc="Esquinas y sombras">
              <Segmented value={settings.winStyle} onChange={v => update("winStyle", v)}
                options={[{ v: "soft", label: "Suave" }, { v: "sharp", label: "Recto" }, { v: "flat", label: "Plano" }]} />
            </Row>
          </>}
          {tab === "escritorio" && <>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Escritorio y Dock</h2>
            <Row label="Posición del dock" desc="Dónde aparece la barra de apps">
              <Segmented value={settings.dock} onChange={v => update("dock", v)}
                options={[{ v: "bottom", label: "Abajo", icon: "dock_to_bottom" }, { v: "left", label: "Izquierda", icon: "dock_to_right" }]} />
            </Row>
            <Row label="Reloj 24h" desc="Formato de hora en la barra superior">
              <Segmented value={settings.clock24 ? "y" : "n"} onChange={v => update("clock24", v === "y")}
                options={[{ v: "y", label: "24h" }, { v: "n", label: "12h" }]} />
            </Row>
          </>}
          {tab === "acerca" && <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 12 }}>
              <div className="about-logo"><SotosLogo size={96} animate /></div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>Sotos OS</div>
              <div className="muted" style={{ fontSize: 14 }}>Tu ordenador en la nube · Versión 3.0</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, width: 320, marginTop: 8, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {[["Usuario", profile.name], ["Plan", "Pro"], ["Almacenamiento", "42 / 100 GB"], ["Apps", (APPS.length - 1) + " instaladas"]].map(([k, v], i) => (
                  <React.Fragment key={i}>
                    <div className="faint" style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>{k}</div>
                    <div style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{v}</div>
                  </React.Fragment>
                ))}
              </div>
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
