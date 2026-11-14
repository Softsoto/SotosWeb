/* Sotos OS — configuración de despliegue. © 2026 Sebastian Sotomontes */

// Origen del proxy del Navegador. Debe ser un origen DISTINTO al del escritorio
// para que las páginas proxificadas no puedan leer la sesión de Sotos.
// Dev: mismo host, puerto 8787. Producción: VITE_PX_ORIGIN=https://px.tudominio
export const PX_ORIGIN = (import.meta.env.VITE_PX_ORIGIN
  || `${location.protocol}//${location.hostname}:8787`).replace(/\/$/, "");

export const pxUrl = (url) => PX_ORIGIN + "/px/" + url;
