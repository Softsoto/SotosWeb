/* ============================================================
   Sotos — Contribuir: apoyar este Sotos y contribuir al proyecto
   App «Contribuir» (escritorio) y página pública /#/donar (sin cuenta).
   Los medios de donación los publica el administrador; Sotos no cobra ni guarda pagos.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, toast, EmptyState, copyText } from "./ui.jsx";
import { SotosMark } from "./logo.jsx";
const { useState, useEffect } = React;

const REPO = "https://github.com/Softsoto/SotosWeb";
const ICON = { paypal: "account_balance_wallet", kofi: "local_cafe", github: "favorite", bmac: "coffee", nequi: "mobile_2", daviplata: "mobile_2", bancolombia: "account_balance", transferencia: "account_balance", enlace: "link" };
const load = () => fetch("/api/donar", { headers: { "x-sotos": "1" } }).then(r => r.json());

export function DonationMethods({ data }) {
  const copy = (t) => copyText(t).then(() => toast("Copiado", { icon: "content_copy" })).catch(() => toast("No se pudo copiar", { error: true }));
  return <div className="don-methods">
    {data.methods.map((m, i) => { const isUrl = data.kinds?.[m.kind]?.url;
      return <div key={i} className="don-method">
        <span className="don-ic"><Ic name={ICON[m.kind] || "volunteer_activism"} size={22} /></span>
        <div className="don-body"><b>{m.label}</b>{!isUrl && <span className="don-value">{m.value}</span>}{m.note && <span className="don-note">{m.note}</span>}</div>
        {isUrl ? <a className="tb-btn primary" href={m.value} target="_blank" rel="noopener noreferrer"><Ic name="open_in_new" size={16} /> Donar</a>
          : <button className="tb-btn" onClick={() => copy(m.value)}><Ic name="content_copy" size={16} /> Copiar</button>}
      </div>; })}
  </div>;
}

/** ventana «Contribuir» */
export function ContributeApp({ openApp, user }) {
  const [d, setD] = useState(null);
  useEffect(() => { load().then(setD).catch(() => setD({ enabled: false })); }, []);
  const share = location.origin + "/#/donar";
  return <div className="app"><div className="app-main scroll don-app" style={{ display: "block" }}>
    <section className="don-sec">
      <h2><Ic name="volunteer_activism" size={22} /> {d?.enabled ? d.title : "Apoya este Sotos"}</h2>
      {!d ? <div className="faint">Cargando…</div> : d.enabled ? <>
        {d.message && <p className="don-msg">{d.message}</p>}
        <DonationMethods data={d} />
        <div className="don-share"><span>Enlace para compartir:</span><code>{share}</code>
          <button className="tb-btn" onClick={() => copyText(share).then(() => toast("Enlace copiado", { icon: "link" }))}><Ic name="content_copy" size={16} /> Copiar</button></div>
      </> : <p className="faint">{user?.role === "admin" ? "Todavía no publicaste cómo recibir apoyo. Agrega tus medios (PayPal, Ko-fi, Nequi, transferencia…) en Administración → Servidor → Donaciones." : "Quien administra este Sotos todavía no publicó cómo apoyarlo."}
        {user?.role === "admin" && <><br /><button className="tb-btn primary" style={{ marginTop: 10 }} onClick={() => openApp?.("admin")}><Ic name="admin_panel_settings" size={16} /> Configurar donaciones</button></>}</p>}
    </section>
    <section className="don-sec">
      <h2><Ic name="handshake" size={22} /> Contribuye al proyecto Sotos</h2>
      <p className="don-msg">Sotos es software libre (licencia MIT). Puedes ayudar sin poner dinero:</p>
      <div className="don-ways">
        <a href={REPO + "/issues/new"} target="_blank" rel="noopener noreferrer"><Ic name="bug_report" size={20} /><span><b>Reportar un error</b>Cuéntanos qué pasó y cómo repetirlo</span></a>
        <a href={REPO + "/issues/new?labels=idea"} target="_blank" rel="noopener noreferrer"><Ic name="lightbulb" size={20} /><span><b>Proponer una idea</b>Lo que te gustaría que Sotos hiciera</span></a>
        <a href={REPO} target="_blank" rel="noopener noreferrer"><Ic name="code" size={20} /><span><b>Aportar código o una app</b>Con el SDK puedes publicar apps para la Tienda</span></a>
        <a href={REPO + "/blob/main/web/src/os/i18n/en.json"} target="_blank" rel="noopener noreferrer"><Ic name="translate" size={20} /><span><b>Traducir</b>Mejora o agrega un idioma</span></a>
      </div>
      <p className="faint" style={{ fontSize: 12.5 }}>Sotos · © 2026 Sebastian Sotomontes</p>
    </section>
  </div></div>;
}

/** página pública /#/donar */
export function DonatePage() {
  const [d, setD] = useState(null);
  useEffect(() => { document.documentElement.setAttribute("data-theme", "light"); load().then(setD).catch(() => setD({ enabled: false })); }, []);
  return <div className="share-page">
    <div className="sp-top"><a href="/" className="sp-brand"><SotosMark size={24} color="var(--accent)" /> {d?.site || "Sotos"}</a><div className="tb-spacer" /><a className="tb-btn" href="/">Abrir Sotos</a></div>
    <div className="sp-card don-public">
      {!d ? <EmptyState icon="hourglass_empty" text="Cargando…" /> : !d.enabled ? <EmptyState icon="volunteer_activism" text="Este Sotos no tiene donaciones activas." /> : <>
        <h1><Ic name="volunteer_activism" size={28} /> {d.title}</h1>
        {d.message && <p className="don-msg">{d.message}</p>}
        <DonationMethods data={d} />
        <p className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>Los pagos los procesa cada servicio; Sotos no cobra ni guarda tus datos de pago.</p>
      </>}
    </div>
    <div className="sp-foot">Sotos · tu ordenador en la nube · © 2026 Sebastian Sotomontes</div>
  </div>;
}
