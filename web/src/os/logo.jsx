/* ============================================================
   Sotos OS — logo (husky + gato)
   ============================================================ */
import React from "react";
function SotosLogo({ size = 96, animate = false, badge = true }) {
  const s = size;
  return (
    <div className={"sotos-logo" + (animate ? " anim" : "")} style={{ width: s, height: s }}>
      <svg viewBox="0 0 120 120" width={s} height={s} role="img" aria-label="Sotos">
        {badge && <defs>
          <linearGradient id="slbg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="color-mix(in srgb, var(--accent) 55%, #000)" />
          </linearGradient>
        </defs>}
        {badge && <rect x="2" y="2" width="116" height="116" rx="30" fill="url(#slbg)" />}

        {/* ---- Husky (left) ---- */}
        <g className="sl-husky">
          {/* ears */}
          <path d="M30 64 L24 38 L43 52 Z" fill="#d7dee6" />
          <path d="M30 64 L24 41 L40 53 Z" fill="#9aa7b5" />
          <path d="M58 60 L60 36 L44 52 Z" fill="#d7dee6" />
          <path d="M57 59 L59 39 L46 52 Z" fill="#9aa7b5" />
          {/* head */}
          <path d="M27 62 q-2 22 17 26 q12 2 18 -6 q5 -8 3 -22 q-2 -14 -19 -16 q-16 1 -19 18 Z" fill="#eef2f6" />
          {/* gray mask top */}
          <path d="M27 62 q3 -17 19 -18 q17 2 19 16 q-9 -7 -19 -6 q-12 0 -19 8 Z" fill="#b9c4d0" />
          {/* eyes */}
          <ellipse cx="37" cy="68" rx="3.4" ry="4.2" fill="#2b6fe0" />
          <ellipse cx="52" cy="68" rx="3.4" ry="4.2" fill="#2b6fe0" />
          <circle cx="37.8" cy="66.6" r="1.1" fill="#fff" />
          <circle cx="52.8" cy="66.6" r="1.1" fill="#fff" />
          {/* snout */}
          <path d="M40 78 q4 6 9 0 q-1 7 -4.5 7 q-3.5 0 -4.5 -7 Z" fill="#fff" />
          <ellipse cx="44.5" cy="79" rx="2.6" ry="1.8" fill="#34323a" />
        </g>

        {/* ---- Cat (right) ---- */}
        <g className="sl-cat">
          {/* ears */}
          <path d="M74 60 L72 40 L88 52 Z" fill="#f0a45e" />
          <path d="M75 58 L74 44 L85 52 Z" fill="#f6c89a" />
          <path d="M99 62 L102 42 L88 52 Z" fill="#f0a45e" />
          <path d="M98 60 L100 46 L89 53 Z" fill="#f6c89a" />
          {/* head */}
          <path d="M72 64 q-1 20 15 23 q13 2 17 -8 q3 -9 1 -18 q-3 -12 -17 -13 q-15 1 -16 14 Z" fill="#f0a45e" />
          {/* stripes */}
          <path d="M86 53 l0 9 M81 55 l-2 7 M91 55 l2 7" stroke="#d97b3a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          {/* eyes */}
          <ellipse cx="82" cy="70" rx="3" ry="4" fill="#2f9e57" />
          <ellipse cx="95" cy="70" rx="3" ry="4" fill="#2f9e57" />
          <ellipse cx="82" cy="70" rx="1" ry="3" fill="#1b3a26" />
          <ellipse cx="95" cy="70" rx="1" ry="3" fill="#1b3a26" />
          {/* nose + whiskers */}
          <path d="M86.5 78 l2.5 0 l-1.25 2 Z" fill="#a3502a" />
          <path d="M88 81 q0 3 -3 3 M88 81 q0 3 3 3" stroke="#a3502a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M83 78 l-9 -2 M83 80 l-9 1 M93 78 l9 -2 M93 80 l9 1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
        </g>
      </svg>
    </div>
  );
}
export { SotosLogo };