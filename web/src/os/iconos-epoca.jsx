/* ============================================================
   Sotos — íconos de los temas de época
   El pictograma de cada app es el mismo (glyphs.jsx o su símbolo); lo que cambia es el material:
     Prado     placa con relieve, borde oscuro y brillo en la mitad de arriba
     Cristal   vidrio profundo con reflejo en diagonal y borde de luz
     Vidrio    vidrio claro con arco de brillo
     Mosaico   plano: color lleno y pictograma blanco
     Aluminio  cuadrado de esquinas continuas con luz arriba y sombra de base
   Los colores salen de --c (el color de la app) mezclado con los tokens de la época (epocas.css).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { ERAS } from "./epocas.js";

/* tema actual, reactivo (data-skin en <html>) */
const subs = new Set(); let obs = null;
const read = () => document.documentElement.dataset.skin || "sotos";
function subscribe(cb) {
  subs.add(cb);
  if (!obs) { obs = new MutationObserver(() => subs.forEach(f => f())); obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-skin"] }); }
  return () => subs.delete(cb);
}
export const useEra = () => { const s = React.useSyncExternalStore(subscribe, read); return ERAS[s] ? s : null; };

const mix = (pct, other) => `color-mix(in srgb, var(--c) ${pct}%, var(${other}))`;
const SQUIRCLE = "M50 2C86 2 98 14 98 50S86 98 50 98 2 86 2 50 14 2 50 2Z";

/** fondo del ícono de app según la época (va detrás del pictograma) */
export function EraPlate({ era }) {
  const id = React.useId().replace(/:/g, "");
  const g = (n) => `url(#${id}${n})`;
  if (era === "mosaico") return <svg className="era-plate" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="var(--c)" /></svg>;
  if (era === "prado") return (
    <svg className="era-plate" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id + "a"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={mix(55, "--era-white")} /><stop offset=".48" stopColor="var(--c)" /><stop offset="1" stopColor={mix(70, "--era-black")} /></linearGradient>
        <linearGradient id={id + "b"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--era-white)" stopOpacity=".75" /><stop offset="1" stopColor="var(--era-white)" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="5" y="5" width="90" height="90" rx="17" fill={g("a")} stroke={mix(48, "--era-black")} strokeWidth="3.5" />
      <path d="M12 12h76a6 6 0 0 1 6 6v20c-14 7-30 10-44 10S20 45 6 38V18a6 6 0 0 1 6-6Z" fill={g("b")} />
    </svg>);
  if (era === "cristal") return (
    <svg className="era-plate" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={id + "a"} cx=".5" cy=".15" r=".95"><stop offset="0" stopColor={mix(45, "--era-white")} /><stop offset=".55" stopColor="var(--c)" /><stop offset="1" stopColor={mix(45, "--era-black")} /></radialGradient>
        <linearGradient id={id + "b"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--era-white)" stopOpacity=".55" /><stop offset=".5" stopColor="var(--era-white)" stopOpacity=".08" /><stop offset=".51" stopColor="var(--era-white)" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="20" fill={g("a")} stroke={mix(40, "--era-black")} strokeWidth="2" />
      <rect x="7" y="7" width="86" height="86" rx="17" fill="none" stroke="var(--era-white)" strokeOpacity=".32" strokeWidth="2" />
      <path d="M7 24a17 17 0 0 1 17-17h52L7 76Z" fill={g("b")} />
    </svg>);
  if (era === "vidrio") return (
    <svg className="era-plate" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id + "a"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={mix(40, "--era-white")} /><stop offset=".6" stopColor={mix(92, "--era-white")} /><stop offset="1" stopColor={mix(80, "--era-black")} /></linearGradient>
        <linearGradient id={id + "b"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--era-white)" stopOpacity=".7" /><stop offset="1" stopColor="var(--era-white)" stopOpacity=".1" /></linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill={g("a")} stroke={mix(55, "--era-black")} strokeOpacity=".7" strokeWidth="2" />
      <path d="M8 26a18 18 0 0 1 18-18h48a18 18 0 0 1 18 18v4C78 46 22 46 8 34Z" fill={g("b")} />
      <rect x="6.5" y="6.5" width="87" height="87" rx="20" fill="none" stroke="var(--era-white)" strokeOpacity=".45" strokeWidth="1.5" />
    </svg>);
  if (era === "aluminio") return ( // placa de color (apps sin objeto ilustrado)
    <svg className="era-plate" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id + "a"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={mix(62, "--era-white")} /><stop offset="1" stopColor={mix(82, "--era-black")} /></linearGradient>
        <linearGradient id={id + "e"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--era-white)" stopOpacity=".55" /><stop offset=".5" stopColor="var(--era-white)" stopOpacity="0" /></linearGradient>
      </defs>
      <path d={SQUIRCLE} fill={g("a")} />
      <path d={SQUIRCLE} fill="none" stroke={g("e")} strokeWidth="2.5" />
    </svg>);
  if (era === "aluminio-claro") return ( // placa clara: lleva un objeto ilustrado encima
    <svg className="era-plate" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id + "a"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--mac-plate-top)" /><stop offset="1" stopColor="var(--mac-plate-bottom)" /></linearGradient>
      </defs>
      <path d={SQUIRCLE} fill={g("a")} stroke="var(--mac-plate-edge)" strokeWidth="1.2" />
    </svg>);
  return null;
}

/** carpeta de la época (escritorio, Archivos, dock) */
export function EraFolder({ era, size = 46 }) {
  const id = React.useId().replace(/:/g, "");
  const g = (n) => `url(#${id}${n})`;
  const w = size * 1.08, h = w * 0.82;
  const svg = (children) => <svg className={"era-folder era-folder-" + era} width={w} height={h} viewBox="0 0 100 82" aria-hidden="true">{children}</svg>;
  if (era === "mosaico") return svg(<>
    <path d="M4 10h32l8 8h52v58H4Z" fill="var(--fold-back)" />
    <path d="M4 26h92v50H4Z" fill="var(--fold-front)" />
  </>);
  const back = <path d="M6 8a4 4 0 0 1 4-4h24l8 8h46a4 4 0 0 1 4 4v58H6Z" fill={g("b")} stroke="var(--fold-edge)" strokeWidth="2" strokeLinejoin="round" />;
  const papers = <><rect x="14" y="14" width="66" height="42" rx="2" fill="var(--fold-paper)" stroke="var(--fold-paper-edge)" strokeWidth="1" /><rect x="18" y="10" width="62" height="40" rx="2" fill="var(--fold-paper)" stroke="var(--fold-paper-edge)" strokeWidth="1" /></>;
  const defs = (front) => <defs>
    <linearGradient id={id + "b"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--fold-back-hi)" /><stop offset="1" stopColor="var(--fold-back)" /></linearGradient>
    <linearGradient id={id + "f"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--fold-front-hi)" stopOpacity={front} /><stop offset="1" stopColor="var(--fold-front)" stopOpacity={front} /></linearGradient>
  </defs>;
  if (era === "prado") return svg(<>{defs(1)}{back}{papers}
    <path d="M3 28a4 4 0 0 1 4-4h86a4 4 0 0 1 4 4l-4 46a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4Z" fill={g("f")} stroke="var(--fold-edge)" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M10 30h80" stroke="var(--era-white)" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
  </>);
  if (era === "cristal" || era === "vidrio") return svg(<>{defs(0.86)}{back}{papers}
    <path d="M2 34a4 4 0 0 1 4-5l88-5a4 4 0 0 1 4 4l-5 46a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4Z" fill={g("f")} stroke="var(--fold-edge)" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M8 34l84-5" stroke="var(--era-white)" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round" />
  </>);
  if (era === "aluminio") return svg(<>{defs(1)}
    <path d="M6 10a5 5 0 0 1 5-5h22l7 7h49a5 5 0 0 1 5 5v55a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5Z" fill={g("b")} />
    <path d="M6 24a5 5 0 0 1 5-5h78a5 5 0 0 1 5 5v48a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5Z" fill={g("f")} />
    <path d="M10 21h80" stroke="var(--era-white)" strokeOpacity=".55" strokeWidth="1.4" strokeLinecap="round" />
  </>);
  return null;
}
