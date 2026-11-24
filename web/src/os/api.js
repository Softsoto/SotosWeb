/* Sotos OS — cliente de la API. © 2026 Sebastian Sotomontes */
export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export async function api(method, path, body, opts = {}) {
  const isBin = body instanceof Blob || body instanceof ArrayBuffer;
  let r;
  try {
    r = await fetch("/api/" + path, {
      method, credentials: "same-origin",
      headers: { "x-sotos": "1", ...(body != null && !isBin ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) },
      body: body == null ? undefined : isBin ? body : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) { throw new ApiError(0, "Sin conexión con el servidor"); }
  if (opts.raw) { if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => ({}))).error || r.statusText); return r; }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error || r.statusText);
  return data;
}

/** suscripción a eventos en vivo del servidor (notif, world, world-msg, world-fs…) */
export function onServer(types, fn) {
  const list = [].concat(types);
  const h = (e) => { if (list.includes(e.detail.type)) fn(e.detail.data, e.detail.type); };
  window.addEventListener("sotos-server", h);
  return () => window.removeEventListener("sotos-server", h);
}

/** ¿hay servidor de Sotos detrás? (en una web estática sin backend, no) */
let serverP = null;
export const hasServer = () => serverP || (serverP = fetch("/api/health", { cache: "no-store" }).then(r => r.ok && r.headers.get("content-type")?.includes("json")).catch(() => false));
/** versión de Sotos que corre el servidor (null sin servidor) */
let versionP = null;
export const sotosVersion = () => versionP || (versionP = fetch("/api/health", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => d?.version || null).catch(() => null));
