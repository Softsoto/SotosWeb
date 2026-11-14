/* Sotos OS — configuración de despliegue. © 2026 Sebastian Sotomontes */

// Origen del proxy del Navegador. Debe ser un origen DISTINTO al del escritorio
// para que las páginas proxificadas no puedan leer la sesión de Sotos.
// 1) el servidor lo inyecta en la página (window.__SOTOS__), así una sola compilación
//    sirve para "este equipo", hosting y Docker;
// 2) si no, VITE_PX_ORIGIN al compilar; 3) en desarrollo, el puerto 8787.
const injected = typeof window !== "undefined" && window.__SOTOS__ && window.__SOTOS__.pxOrigin;
export const PX_ORIGIN = (injected || import.meta.env.VITE_PX_ORIGIN
  || `${location.protocol}//${location.hostname}:8787`).replace(/\/$/, "");

export const pxUrl = (url) => PX_ORIGIN + "/px/" + url;
