/* ============================================================
   Sotos — íconos-objeto de las épocas Prado, Cristal y Vidrio
   En esas épocas los íconos no son placas: son objetos ilustrados en tres cuartos
   (una carpeta, un globo, un calendario de escritorio). Aquí cada app tiene su objeto,
   dibujado con piezas de «tono»; cada época pinta los tonos a su manera:
     Prado     degradado de arriba a abajo, contorno oscuro y brillos blancos
     Cristal   vidrio: tonos translúcidos, borde de luz, reflejo y sombra en el piso
     Vidrio    igual que Cristal, más claro
   Arte propio de Sotos (ningún ícono de otro sistema). Cuadrícula de 64.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";

// tono → color (tokens en epocas.css; "main" es el color de la app)
const TONE = { main: "var(--c)", paper: "var(--obj-paper)", paper2: "var(--obj-paper-2)", metal: "var(--obj-metal)", ink: "var(--obj-ink)", gold: "var(--obj-gold)",
  red: "var(--obj-red)", green: "var(--obj-green)", blue: "var(--obj-blue)", sky: "var(--obj-sky)", orange: "var(--obj-orange)", wood: "var(--obj-wood)", glass: "var(--obj-glass)" };
const GLASSY = new Set(["main", "glass", "sky", "blue", "green"]); // en Cristal/Vidrio estos tonos se ven translúcidos

// piezas: [tono, path, opciones]; "hl" = brillo blanco sin contorno
const O = {
  folder: [["gold", "M6 14a3 3 0 0 1 3-3h15l5 5h26a3 3 0 0 1 3 3v29H6Z"], ["paper", "M11 18h40v22H11Z"], ["gold", "M4 26a3 3 0 0 1 3-3h50a3 3 0 0 1 3 3l-3 25a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3Z"], ["hl", "M9 27h46", { line: 1 }]],
  launchpad: [["red", "M10 10h19v19H10Z"], ["green", "M35 10h19v19H35Z"], ["blue", "M10 35h19v19H10Z"], ["gold", "M35 35h19v19H35Z"], ["hl", "M12 12h15v5H12ZM37 12h15v5H37ZM12 37h15v5H12ZM37 37h15v5H37Z", { o: 0.45 }]],
  worlds: [["blue", "M32 6a22 22 0 1 1 0 44 22 22 0 0 1 0-44Z"], ["green", "M20 14c6 1 9 6 7 11s-8 4-10 9c-2-4-3-14 3-20ZM37 10c6 2 11 8 12 14-5 0-6-4-10-3s-6-6-2-11ZM34 34c5-2 11 0 12 4-3 5-9 8-14 8 0-5-2-9 2-12Z", { nostroke: 1 }], ["hl", "M20 14a18 18 0 0 1 20-4c-7 0-15 4-20 10Z", { o: 0.6 }],
    ["orange", "M12 58c0-7 5-11 10-11s10 4 10 11Z"], ["orange", "M22 34a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"], ["main", "M34 58c0-7 5-11 10-11s10 4 10 11Z"], ["main", "M44 34a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"]],
  calendar: [["paper2", "M8 54 14 14h40l2 40Z"], ["paper", "M10 52 15 18h38l1 34Z"], ["red", "M14 14h40l1 9H13Z"], ["metal", "M22 9v9M32 9v9M42 9v9", { line: 1, sw: 3 }],
    ["main", "M20 29h7v6h-7ZM30 29h7v6h-7ZM40 29h7v6h-7ZM19 39h7v6h-7ZM29 39h7v6h-7ZM39 39h8v6h-8Z", { o: 0.85 }]],
  tasks: [["wood", "M12 10h40v48H12Z"], ["paper", "M16 15h32v39H16Z"], ["metal", "M24 6h16v9H24Z"], ["green", "M20 32l7 7 15-16", { line: 1, sw: 5 }], ["main", "M20 47h24", { line: 1, sw: 2 }]],
  docs: [["paper", "M14 6h27l11 11v41H14Z"], ["paper2", "M41 6v11h11Z"], ["main", "M14 17h-4v20h4Z"], ["main", "M20 24h24M20 30h24M20 36h24M20 42h16M20 48h20", { line: 1, sw: 2.2 }]],
  sheets: [["paper", "M14 6h27l11 11v41H14Z"], ["paper2", "M41 6v11h11Z"], ["main", "M19 22h28v28H19Z", { o: 0.9 }], ["paper", "M19 29h28M19 36h28M19 43h28M28 22v28M37 22v28", { line: 1, sw: 1.4 }]],
  slides: [["metal", "M30 50h4v8h-4ZM22 58h20", { sw: 1.4 }], ["paper", "M6 10h52v38H6Z"], ["ink", "M6 10h52v5H6Z"], ["main", "M14 40V30h6v10ZM24 40V22h6v18ZM34 40V27h6v13Z"], ["orange", "M44 40V18h6v22Z"]],
  editor: [["gold", "M12 10h40v48H12Z"], ["paper", "M12 18h40v40H12Z"], ["metal", "M18 6v8M26 6v8M34 6v8M42 6v8", { line: 1, sw: 2.6 }], ["blue", "M18 28h28M18 36h28M18 44h20", { line: 1, sw: 1.4, o: 0.7 }]],
  gallery: [["wood", "M6 10h52v44H6Z"], ["sky", "M12 16h40v32H12Z"], ["green", "M12 48c6-10 14-14 20-11s10 2 20-4v15Z"], ["gold", "M42 21a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"]],
  fotos: [["ink", "M6 20h52v32H6Z"], ["metal", "M20 14h14l4 6H16Z"], ["main", "M32 24a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z"], ["sky", "M32 29a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z"], ["hl", "M29 32a3 3 0 1 1 0 4", { o: 0.8 }], ["red", "M48 24h5v4h-5Z"]],
  music: [["metal", "M30 6a24 24 0 1 1 0 48 24 24 0 0 1 0-48Z"], ["sky", "M30 12a18 18 0 1 1 0 36 18 18 0 0 1 0-36Z", { o: 0.55 }], ["paper", "M30 24a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"], ["main", "M44 28v24a6 5 0 1 1-4-5V24l16-4v6Z"]],
  video: [["ink", "M6 12h52v40H6Z"], ["paper", "M9 15h4v4H9ZM9 23h4v4H9ZM9 31h4v4H9ZM9 39h4v4H9ZM9 47h4v3H9ZM51 15h4v4h-4ZM51 23h4v4h-4ZM51 31h4v4h-4ZM51 39h4v4h-4ZM51 47h4v3h-4Z", { nostroke: 1 }], ["main", "M17 16h30v14H17ZM17 34h30v14H17Z"], ["hl", "M17 16h30v5H17ZM17 34h30v5H17Z", { o: 0.4 }]],
  cine: [["ink", "M8 26h48v28H8Z"], ["paper", "M8 18 54 10l2 8-46 8Z"], ["ink", "M14 17l6 7M24 15l6 7M34 13l6 7M44 11l6 7", { line: 1, sw: 3 }], ["main", "M14 32h36v16H14Z", { o: 0.9 }], ["paper", "M27 35v10l8-5Z"]],
  pdf: [["paper", "M14 6h27l11 11v41H14Z"], ["paper2", "M41 6v11h11Z"], ["red", "M10 30h36v14H10Z"], ["paper", "M15 34h4v6M15 34h3a2 2 0 0 1 0 4h-3M23 34h3a3 3 0 0 1 0 6h-3ZM33 34h5M33 37h4M33 34v6", { line: 1, sw: 1.4 }]],
  mail: [["paper", "M6 16h52v36H6Z"], ["paper2", "M6 16l26 20 26-20", { sw: 1.6 }], ["main", "M44 20h10v12H44Z"], ["hl", "M8 18h48", { line: 1 }]],
  contacts: [["main", "M10 6h40v52H10Z"], ["paper", "M50 10h6v10h-6ZM50 22h6v10h-6ZM50 34h6v10h-6Z"], ["paper", "M16 12h28v40H16Z"], ["orange", "M30 22a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"], ["blue", "M20 46c0-6 4-10 10-10s10 4 10 10Z"]],
  chat: [["main", "M6 10h34a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H18l-8 7v-7H11a5 5 0 0 1-5-5V15a5 5 0 0 1 5-5Z"], ["paper", "M24 26h29a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5h-3v7l-8-7H24a5 5 0 0 1-5-5V31a5 5 0 0 1 5-5Z"], ["hl", "M10 13h30", { line: 1 }]],
  whatsapp: [["green", "M32 6c14 0 25 10 25 23S46 52 32 52c-4 0-7-1-10-2l-12 5 4-11c-3-4-5-9-5-15C9 16 18 6 32 6Z"], ["paper", "M22 22c1-3 4-3 5 0l2 5-3 3c2 4 5 7 9 9l3-3 5 2c3 1 3 4 0 5-6 3-15-1-20-8s-4-11-1-13Z"]],
  browser: [["blue", "M32 8a22 22 0 1 1 0 44 22 22 0 0 1 0-44Z"], ["green", "M19 18c6 1 9 7 6 12s-9 4-10 9c-3-5-2-15 4-21ZM38 12c7 3 11 10 11 16-5-1-6-5-10-4s-5-7-1-12Z", { nostroke: 1 }], ["gold", "M6 36c8 10 46 4 52-12l-3-2c-6 13-38 18-46 10Z"], ["hl", "M20 15a18 18 0 0 1 20-4c-7 0-15 4-20 10Z", { o: 0.6 }]],
  web: [["sky", "M32 8a22 22 0 1 1 0 44 22 22 0 0 1 0-44Z"], ["main", "M32 8c-8 8-8 36 0 44M32 8c8 8 8 36 0 44M10 30h44M14 18h36M14 42h36", { line: 1, sw: 1.6 }], ["hl", "M20 15a18 18 0 0 1 20-4c-7 0-15 4-20 10Z", { o: 0.6 }]],
  paint: [["wood", "M32 8C16 8 6 18 6 30c0 10 8 14 14 12 5-1 7 4 10 8 6 6 28 1 28-20C58 18 46 8 32 8Z"], ["red", "M18 22a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"], ["gold", "M28 14a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"], ["green", "M40 15a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"], ["blue", "M47 26a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"], ["main", "M38 46 56 12l3 2-16 35Z"]],
  diagrams: [["paper", "M6 8h52v48H6Z"], ["main", "M24 14h16v10H24ZM12 38h16v10H12ZM36 38h16v10H36Z"], ["ink", "M32 24v7M20 38v-7h24v7", { line: 1, sw: 1.6 }]],
  whiteboard: [["metal", "M14 50l-6 10M50 50l6 10M32 50v10", { line: 1, sw: 3 }], ["paper", "M6 8h52v42H6Z"], ["metal", "M6 8h52v42H6Z", { fillnone: 1, sw: 2.4 }], ["main", "M14 22c6-6 12 6 18 0s10-6 16 0M14 34h20", { line: 1, sw: 2.4 }], ["red", "M40 42h14v4H40Z"]],
  code: [["metal", "M24 50h16l2 8H22Z"], ["ink", "M6 8h52v40H6Z"], ["main", "M10 12h44v32H10Z"], ["paper", "M24 22l-7 6 7 6M40 22l7 6-7 6M35 20l-6 16", { line: 1, sw: 2.6 }]],
  terminal: [["metal", "M6 8h52v48H6Z"], ["ink", "M9 15h46v38H9Z"], ["green", "M14 22l7 6-7 6M25 36h12", { line: 1, sw: 2.6 }], ["red", "M10 10h3v3h-3Z", { nostroke: 1 }]],
  store: [["main", "M10 22h44l-4 34H14Z"], ["hl", "M12 24h40l-1 6H13Z", { o: 0.4 }], ["gold", "M22 26V18a10 10 0 0 1 20 0v8", { line: 1, sw: 3 }]],
  settings: [["metal", "M24 8h8l1 5 4 2 4-3 6 6-3 4 2 4 5 1v8l-5 1-2 4 3 4-6 6-4-3-4 2-1 5h-8l-1-5-4-2-4 3-6-6 3-4-2-4-5-1v-8l5-1 2-4-3-4 6-6 4 3 4-2Z"], ["paper2", "M28 20a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z"], ["main", "M46 38h6l1 3 3 1 2-2 4 4-2 2 1 3 3 1v6h-3l-1 3 2 2-4 4-2-2-3 1-1 3h-6l-1-3-3-1-2 2-4-4 2-2-1-3-3-1v-6l3-1 1-3-2-2 4-4 2 2 3-1Z", { o: 0.95 }]],
  games: [["ink", "M14 22h36c7 0 10 8 10 16s-3 16-9 16c-5 0-7-7-12-7H25c-5 0-7 7-12 7-6 0-9-8-9-16s3-16 10-16Z"], ["metal", "M15 34h10M20 29v10", { line: 1, sw: 3 }], ["red", "M44 29a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"], ["green", "M50 35a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"], ["blue", "M38 35a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"], ["hl", "M14 25h36", { line: 1, o: 0.4 }]],
  admin: [["main", "M32 6l22 8v14c0 14-9 25-22 30C19 53 10 42 10 28V14Z"], ["hl", "M32 10l18 7v6H14v-6Z", { o: 0.35 }], ["paper", "M22 31l7 7 14-15", { line: 1, sw: 4.5 }]],
  trash: [["metal", "M12 18h40l-4 38H16Z"], ["ink", "M22 24v26M32 24v26M42 24v26", { line: 1, sw: 1.6, o: 0.5 }], ["metal", "M8 12h48v6H8Z"], ["main", "M26 7h12v5H26Z"]],
  vault: [["metal", "M8 10h48v42H8Z"], ["ink", "M12 52v6M52 52v6", { line: 1, sw: 4 }], ["paper2", "M14 16h36v30H14Z"], ["main", "M32 20a11 11 0 1 1 0 22 11 11 0 0 1 0-22Z"], ["metal", "M32 25a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"], ["ink", "M32 26v4", { line: 1, sw: 2 }]],
};
O.donar = [["red", "M32 54C14 42 6 32 6 22a12 12 0 0 1 22-7l4 5 4-5a12 12 0 0 1 22 7c0 10-8 20-26 32Z"], ["hl", "M14 18a7 7 0 0 1 10-3", { line: 1, sw: 2.4, o: 0.7 }], ["gold", "M44 40a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z"], ["wood", "M41 48h6M44 44v8", { line: 1, sw: 1.8 }]];
O.descargas = [["sky", "M16 40a12 12 0 0 1 2-24 16 16 0 0 1 30 2 11 11 0 0 1 0 22Z"], ["hl", "M20 20a12 12 0 0 1 16-6", { line: 1, sw: 2, o: 0.6 }], ["green", "M27 26h10v12h7L32 52 20 38h7Z"]];
O.files = O.folder;
const ALIAS = { pdfmeta: "pdf", informes: "docs", panel: "launchpad", pinball: "games", audioext: "music", diagnostico: "settings" };
export const hasObject = (app) => !!O[ALIAS[app] || app];

export function EraObject({ app, era }) {
  const parts = O[ALIAS[app] || app]; const uid = React.useId().replace(/:/g, "");
  if (!parts) return null;
  const glass = era === "cristal" || era === "vidrio";
  const tones = [...new Set(parts.map(p => p[0]).filter(t => t !== "hl"))];
  const mac = era === "aluminio";
  const top = glass ? (era === "vidrio" ? 30 : 42) : mac ? 60 : 52, bottom = glass ? 80 : mac ? 82 : 72;
  return (
    <svg className={"era-object era-object-" + era} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        {tones.map(t => <linearGradient key={t} id={uid + t} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`color-mix(in srgb, ${TONE[t]} ${top}%, var(--era-white))`} />
          <stop offset=".55" stopColor={TONE[t]} />
          <stop offset="1" stopColor={`color-mix(in srgb, ${TONE[t]} ${bottom}%, var(--era-black))`} />
        </linearGradient>)}
        {glass && <linearGradient id={uid + "sheen"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--era-white)" stopOpacity=".6" /><stop offset=".45" stopColor="var(--era-white)" stopOpacity=".05" /><stop offset=".46" stopColor="var(--era-white)" stopOpacity="0" /></linearGradient>}
        {glass && <clipPath id={uid + "clip"}>{parts.filter(p => p[0] !== "hl" && !p[2]?.line).map((p, i) => <path key={i} d={p[1]} />)}</clipPath>}
      </defs>
      {glass && <ellipse cx="32" cy="60" rx="22" ry="3" fill="var(--era-black)" opacity=".16" />}
      {parts.map(([tone, d, o = {}], i) => {
        if (tone === "hl") return <path key={i} d={d} fill={o.line ? "none" : "var(--era-white)"} stroke={o.line ? "var(--era-white)" : "none"} strokeWidth={o.sw || 1.4} strokeLinecap="round" opacity={o.o ?? 0.55} />;
        const edge = glass ? `color-mix(in srgb, ${TONE[tone]} 55%, var(--era-black))` : mac ? `color-mix(in srgb, ${TONE[tone]} 70%, var(--era-black))` : `color-mix(in srgb, ${TONE[tone]} 45%, var(--era-black))`;
        if (o.line) return <path key={i} d={d} fill="none" stroke={TONE[tone]} strokeWidth={o.sw || 2} strokeLinecap="round" strokeLinejoin="round" opacity={o.o ?? 1} />;
        return <path key={i} d={d} fill={o.fillnone ? "none" : `url(#${uid + tone})`} fillOpacity={glass && GLASSY.has(tone) ? 0.82 : 1}
          stroke={o.nostroke ? "none" : edge} strokeWidth={o.sw || (glass ? 0.9 : mac ? 0.6 : 1.3)} strokeLinejoin="round" opacity={o.o ?? 1} />;
      })}
      {glass && <rect x="0" y="0" width="64" height="64" fill={`url(#${uid}sheen)`} clipPath={`url(#${uid}clip)`} />}
    </svg>
  );
}
