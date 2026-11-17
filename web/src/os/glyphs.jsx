/* ============================================================
   Sotos — símbolos de apps dibujados a mano (tema Grafito)
   Rejilla de 24 px; trazo y relleno en currentColor; los detalles
   internos usan --g2 (el tono oscuro de la ficha de cada app).
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";

const ink = "var(--g2, #39424a)";
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

// engranaje: 8 dientes calculados
const gear = (() => {
  const pts = []; const R = 9.6, r = 7.4, n = 8;
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2 - Math.PI / 2 + Math.PI / (n * 4);
    const rad = (i % 4 === 0 || i % 4 === 1) ? R : r;
    pts.push(`${(12 + rad * Math.cos(a)).toFixed(2)} ${(12 + rad * Math.sin(a)).toFixed(2)}`);
  }
  return "M" + pts.join("L") + "Z";
})();

export const GLYPHS = {
  files: <>
    <path d="M2.8 6.2A1.4 1.4 0 0 1 4.2 4.8h4.6l2 2h8.9a1.4 1.4 0 0 1 1.4 1.4v1.3H2.8Z" fill="currentColor" opacity=".72" />
    <path d="M2.8 9.2h18.4v8.6a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4Z" fill="currentColor" opacity=".94" />
  </>,
  worlds: <>
    <circle cx="12" cy="12" r="5.2" fill="currentColor" />
    <ellipse cx="12" cy="12" rx="10.2" ry="3.6" transform="rotate(-24 12 12)" {...line} strokeWidth="1.6" />
    <path d="M7.4 13.6c2.6 .4 6.6 -.9 9.2 -2.9" stroke={ink} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity=".55" />
    <circle cx="19.6" cy="6.4" r="1.4" fill="currentColor" />
  </>,
  chat: <>
    <path d="M15.6 9.3c.2-2.9-2.6-5.2-6.1-5.2C5.8 4.1 3 6.4 3 9.3c0 1.6.8 3 2.1 3.9l-.6 2.3 2.7-1.3c.7.2 1.5.3 2.3.3" {...line} />
    <path d="M9.6 14.2c0 2.6 2.6 4.6 5.6 4.6.7 0 1.3-.1 1.9-.3l2.4 1.1-.5-2c1.1-.8 1.8-2 1.8-3.4 0-2.6-2.5-4.6-5.6-4.6s-5.6 2-5.6 4.6Z" {...line} />
  </>,
  contacts: <>
    <circle cx="8.6" cy="8.2" r="3.4" fill="currentColor" />
    <path d="M2.6 19.4c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2Z" fill="currentColor" />
    <circle cx="16.4" cy="8.8" r="2.9" fill="currentColor" opacity=".82" />
    <path d="M15.4 13.6c3.4-.6 6.2 2 6.2 5.8h-5.4c0-2.3-.3-4.1-.8-5.8Z" fill="currentColor" opacity=".82" />
  </>,
  docs: <>
    <path d="M6 2.8h8.2L19 7.6v12.2a1.4 1.4 0 0 1-1.4 1.4H6a1.4 1.4 0 0 1-1.4-1.4V4.2A1.4 1.4 0 0 1 6 2.8Z" fill="currentColor" />
    <path d="M14.2 2.8v3.4a1.4 1.4 0 0 0 1.4 1.4H19" fill="currentColor" opacity=".6" />
    <path d="M7.8 11h7.4M7.8 13.8h7.4M7.8 16.6h4.6" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
  </>,
  sheets: <>
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="1.6" fill="currentColor" />
    <path d="M3.6 9.2h16.8M3.6 14.8h16.8M9.4 3.6v16.8M14.6 9.2v11.2" stroke={ink} strokeWidth="1.3" />
    <rect x="3.6" y="3.6" width="16.8" height="5.6" rx="1.6" fill={ink} opacity=".28" />
  </>,
  slides: <>
    <rect x="2.6" y="4.2" width="18.8" height="12.6" rx="1.4" fill="currentColor" />
    <path d="M12 16.8v3.2M8.4 20.6h7.2" {...line} />
    <path d="M7 13.4v-3M10.4 13.4V8.2M13.8 13.4v-2M17.2 13.4V7" stroke={ink} strokeWidth="2" strokeLinecap="round" />
  </>,
  editor: <>
    <rect x="4" y="3.2" width="13.6" height="17.6" rx="1.6" fill="currentColor" />
    <path d="M6.8 8h8M6.8 11h8M6.8 14h5" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
    <path d="M14.6 18.8l.6-3.2 5.6-5.6a1.3 1.3 0 0 1 1.8 0l.8.8a1.3 1.3 0 0 1 0 1.8l-5.6 5.6Z" fill="currentColor" stroke={ink} strokeWidth="1" strokeLinejoin="round" />
  </>,
  gallery: <>
    <rect x="2.8" y="4.4" width="18.4" height="15.2" rx="1.6" fill="currentColor" />
    <circle cx="15.8" cy="9" r="1.8" fill={ink} />
    <path d="M4.6 17.6l4.6-5.6 3.2 3.6 2.2-2.4 4.8 4.4Z" fill={ink} />
  </>,
  music: <>
    <path d="M9 17.2V6.6l11-2.4v10.6" {...line} strokeWidth="2" />
    <path d="M9 9.2l11-2.4" stroke="currentColor" strokeWidth="2.4" />
    <ellipse cx="6.6" cy="17.4" rx="2.9" ry="2.3" transform="rotate(-18 6.6 17.4)" fill="currentColor" />
    <ellipse cx="17.6" cy="15" rx="2.9" ry="2.3" transform="rotate(-18 17.6 15)" fill="currentColor" />
  </>,
  video: <>
    <path d="M3 9.4h18v9.2a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 18.6Z" fill="currentColor" />
    <path d="M3.2 8.2l-.4-2.4a1.2 1.2 0 0 1 1-1.4l14.6-2.4a1.2 1.2 0 0 1 1.4 1l.4 2.4Z" fill="currentColor" opacity=".8" />
    <path d="M7.2 3.6l2.4 3.2M11.6 2.9l2.4 3.2" stroke={ink} strokeWidth="1.3" />
    <path d="M10.4 12v5.6l4.6-2.8Z" fill={ink} />
  </>,
  pdf: <>
    <path d="M6 2.8h8.2L19 7.6v12.2a1.4 1.4 0 0 1-1.4 1.4H6a1.4 1.4 0 0 1-1.4-1.4V4.2A1.4 1.4 0 0 1 6 2.8Z" fill="currentColor" />
    <path d="M14.2 2.8v3.4a1.4 1.4 0 0 0 1.4 1.4H19" fill="#fff" opacity=".45" />
    <path d="M8.4 16.8c1.8-2.2 3-5 3.2-8 .1-1-1.2-1.2-1.4-.2-.4 2 2.4 6 5.6 6.8 1 .2 1.2-1 .2-1.3-2.6-.7-6.2.6-7.6 2.7Z" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
  </>,
  mail: <>
    <rect x="2.8" y="5.4" width="18.4" height="13.2" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.4 6.4l8.6 6.6 8.6-6.6" {...line} strokeWidth="1.8" />
  </>,
  browser: <>
    <circle cx="12" cy="12" r="9" {...line} />
    <ellipse cx="12" cy="12" rx="4.2" ry="9" {...line} strokeWidth="1.5" />
    <path d="M3.4 9h17.2M3.4 15h17.2" {...line} strokeWidth="1.5" />
  </>,
  web: <>
    <circle cx="12" cy="12" r="9" {...line} />
    <ellipse cx="12" cy="12" rx="4.2" ry="9" {...line} strokeWidth="1.5" />
    <path d="M3.4 12h17.2" {...line} strokeWidth="1.5" />
  </>,
  games: <>
    <path d="M7.2 7.4h9.6c2.6 0 4.2 2.4 4.6 5.6.4 3.2-.4 5-1.8 5-1.2 0-2-1.4-3.2-2.8H7.6C6.4 16.6 5.6 18 4.4 18c-1.4 0-2.2-1.8-1.8-5 .4-3.2 2-5.6 4.6-5.6Z" fill="currentColor" />
    <path d="M7.4 10.2v3.6M5.6 12h3.6" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="15.8" cy="11" r="1" fill={ink} /><circle cx="17.8" cy="13" r="1" fill={ink} />
  </>,
  terminal: <>
    <rect x="2.8" y="4.2" width="18.4" height="15.6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M6.6 9.4l3.2 2.6-3.2 2.6M11.8 15.4h5.2" {...line} strokeWidth="1.9" />
  </>,
  store: <>
    <path d="M5 8h14l-1 11.4a1.6 1.6 0 0 1-1.6 1.4H7.6A1.6 1.6 0 0 1 6 19.4Z" fill="currentColor" />
    <path d="M8.6 10V7.2a3.4 3.4 0 0 1 6.8 0V10" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
  </>,
  settings: <>
    <path d={gear} fill="currentColor" />
    <circle cx="12" cy="12" r="3" fill={ink} />
  </>,
  trash: <>
    <path d="M4.6 6.6h14.8" {...line} strokeWidth="1.9" />
    <path d="M9.4 6.4V4.6h5.2v1.8" {...line} strokeWidth="1.6" />
    <path d="M6.2 8.6h11.6l-.8 10.8a1.6 1.6 0 0 1-1.6 1.4H8.6A1.6 1.6 0 0 1 7 19.4Z" fill="currentColor" />
    <path d="M10 11.4v6.2M14 11.4v6.2" stroke={ink} strokeWidth="1.3" strokeLinecap="round" />
  </>,
  calendar: <>
    <rect x="3.2" y="4.6" width="17.6" height="16" rx="1.8" fill="currentColor" />
    <rect x="3.2" y="4.6" width="17.6" height="4.6" rx="1.8" fill={ink} opacity=".35" />
    <path d="M7.6 2.8v3.6M16.4 2.8v3.6" {...line} strokeWidth="2" />
    <text x="12" y="18.2" textAnchor="middle" fontSize="8.4" fontWeight="800" fill={ink} fontFamily="Lato, sans-serif">{new Date().getDate()}</text>
  </>,
  tasks: <>
    <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.4" fill="currentColor" />
    <path d="M7.4 12.2l3 3 6.2-6.4" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  launchpad: <>
    {[6, 12, 18].map(y => [6, 12, 18].map(x => <rect key={x + "-" + y} x={x - 2.2} y={y - 2.2} width="4.4" height="4.4" rx="1.1" fill="currentColor" />))}
  </>,
};

export function TileGlyph({ app }) {
  const g = GLYPHS[app]; if (!g) return null;
  return <svg className="tile-glyph" viewBox="0 0 24 24" aria-hidden="true">{g}</svg>;
}
