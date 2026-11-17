/* ============================================================
   Sotos — región: zona horaria, formato de fecha y extensiones
   (como setTimeZone / setDateFormat / setDisplayExtensions de inevio)
   © 2026 Sebastian Sotomontes
   ============================================================ */
export const region = { timeZone: "auto", dateFormat: "auto", showExt: true };
export function setRegion(r) { Object.assign(region, r || {}); }
export const tz = () => (region.timeZone && region.timeZone !== "auto" ? region.timeZone : undefined);
const parts = (d) => { const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d); const g = (t) => f.find(p => p.type === t).value; return { y: g("year"), m: g("month"), d: g("day") }; };
/** fecha corta según el formato elegido */
export function fmtDay(d, withYear = true) {
  if (region.dateFormat === "auto") return d.toLocaleDateString("es-ES", { timeZone: tz(), day: "numeric", month: "short", year: withYear ? "numeric" : undefined });
  const p = parts(d);
  return region.dateFormat === "mdy" ? `${p.m}/${p.d}/${p.y}` : region.dateFormat === "ymd" ? `${p.y}-${p.m}-${p.d}` : `${p.d}/${p.m}/${p.y}`;
}
export const fmtTime = (d, h12 = false) => d.toLocaleTimeString("es-ES", { timeZone: tz(), hour: "2-digit", minute: "2-digit", hour12: h12 });
export const sameDay = (a, b) => { const x = parts(a), y = parts(b); return x.y === y.y && x.m === y.m && x.d === y.d; };
/** nombre visible de un archivo (sin extensión si así se eligió) */
export const shownName = (n) => !n || region.showExt || n.type === "folder" || n.children ? n?.name : n.name.replace(/\.[^.\/]{1,8}$/, "");