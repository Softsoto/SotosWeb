/* ============================================================
   Sotos — donaciones y apoyo
   El administrador elige cómo recibe apoyo (PayPal, Ko-fi, GitHub Sponsors, Buy Me a Coffee,
   Nequi, Daviplata, Bancolombia, transferencia o un enlace propio) y un mensaje. Se muestran
   en la app «Contribuir» y en la página pública /#/donar, que se puede compartir.
   Sotos no cobra ni guarda pagos: solo muestra los medios que el administrador publica.
   GET  /api/donar                 público: lo que está publicado
   GET/PUT /api/admin/donaciones   administrador
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { getSetting, setSetting } from "./db.mjs";
import { fail, json } from "./http.mjs";

export const KINDS = {
  paypal: { label: "PayPal", url: true, host: /(^|\.)paypal\.(me|com)$/ },
  kofi: { label: "Ko-fi", url: true, host: /(^|\.)ko-fi\.com$/ },
  github: { label: "GitHub Sponsors", url: true, host: /(^|\.)github\.com$/ },
  bmac: { label: "Buy Me a Coffee", url: true, host: /(^|\.)buymeacoffee\.com$/ },
  nequi: { label: "Nequi", url: false },
  daviplata: { label: "Daviplata", url: false },
  bancolombia: { label: "Bancolombia", url: false },
  transferencia: { label: "Transferencia", url: false },
  enlace: { label: "Enlace", url: true, host: null },
};
const clean = (s, n) => String(s ?? "").replace(/[\x00-\x1f<>]/g, " ").trim().slice(0, n);
export function validDonations(b) {
  const methods = (Array.isArray(b?.methods) ? b.methods : []).slice(0, 12).map((m) => {
    const k = KINDS[m?.kind]; if (!k) fail(400, "Medio de donación no válido");
    const value = clean(m.value, 300); if (!value) fail(400, `Falta el dato de ${k.label}`);
    if (k.url) { let u; try { u = new URL(value); } catch { fail(400, `${k.label}: escribe un enlace completo (https://…)`); }
      if (u.protocol !== "https:") fail(400, `${k.label}: el enlace debe empezar por https://`);
      if (k.host && !k.host.test(u.hostname)) fail(400, `${k.label}: el enlace no es de ${k.label}`); }
    return { kind: m.kind, label: clean(m.label, 60) || k.label, value, note: clean(m.note, 160) };
  });
  return { enabled: !!b?.enabled && methods.length > 0, title: clean(b?.title, 80) || "Apoya este Sotos", message: clean(b?.message, 600), methods };
}
export const donations = () => getSetting("donations", { enabled: false, title: "Apoya este Sotos", message: "", methods: [] });
export function saveDonations(b) { const d = validDonations(b); setSetting("donations", d); return d; }
/** público: solo si está activado */
export function handlePublicDonations(req, res) {
  const d = donations(); if (!d.enabled) return json(res, 200, { enabled: false, site: getSetting("siteName", "Sotos") });
  return json(res, 200, { ...d, site: getSetting("siteName", "Sotos"), kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { label: v.label, url: v.url }])) });
}
