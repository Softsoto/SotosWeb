/* Sotos OS — © 2026 Sebastian Sotomontes */
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/onest/700.css";
import "@fontsource/onest/800.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/800.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./os/fonts/simbolos.css"; // íconos: solo los que usa Sotos (node scripts/iconos.mjs)
import "./os/styles.css";
import "./os/epocas.css"; // temas de época (Prado, Cristal, Vidrio, Mosaico, Aluminio)
import React from "react";
import { createRoot } from "react-dom/client";
import { AppGuard } from "./os/ui.jsx";
import { OS } from "./os/shell.jsx";
import { SharePage } from "./os/share-page.jsx";
import { DonatePage } from "./os/donar.jsx";
import { startI18n } from "./os/i18n.js";

// /#/s/<token> → página pública de un elemento compartido; si no, el escritorio
const share = /^#\/s\/([a-f0-9]{32})/.exec(location.hash);
if (share || /^#\/donar\b/.test(location.hash)) document.body.classList.add("is-share");
// el idioma (y su diccionario, si es inglés) se prepara antes de pintar la interfaz
// un Sotos recién descargado (sin instalar) abre el asistente de instalación
fetch("/api/install/status", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(s => { if (s && s.installed === false) location.replace("/instalar"); }).catch(() => {});
startI18n().catch(() => {}).finally(() => createRoot(document.getElementById("root")).render(<AppGuard name="Sotos">{share ? <SharePage token={share[1]} /> : /^#\/donar\b/.test(location.hash) ? <DonatePage /> : <OS />}</AppGuard>));
window.addEventListener("hashchange", () => { if (/^#\/s\//.test(location.hash) !== !!share || /^#\/donar\b/.test(location.hash)) location.reload(); });

// service worker: avisos con Sotos cerrado y app instalable (en el celular o el computador)
if ("serviceWorker" in navigator && !share && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"))
  navigator.serviceWorker.register("./sw.js").catch(() => {});
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "sotos-open-link") window.dispatchEvent(new CustomEvent("sotos-open-link", { detail: e.data.link })); });
