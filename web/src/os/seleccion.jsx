/* ============================================================
   Sotos — seleccionar varios elementos arrastrando un recuadro con el mouse
   (Archivos y Bóveda). Con Ctrl/⌘ el recuadro se suma a lo que ya estaba
   seleccionado. Cerca del borde de arriba o de abajo, la lista se desplaza sola.
   Uso:
     const mq = useMarquee({ box: scrollRef, items: ".file-cell", idOf: el => el.dataset.id, sel, setSel });
     <div ref={scrollRef} onMouseDown={e => { if (vacío) mq.start(e); }}> … {mq.box} </div>
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React, { useRef, useState } from "react";

export function useMarquee({ box, items, idOf, sel, setSel }) {
  const [rect, setRect] = useState(null); // en coordenadas del contenido desplazable
  const live = useRef(null);
  const selRef = useRef(sel); selRef.current = sel;

  const start = (e) => {
    if (e.button !== 0 || !box.current) return;
    const el = box.current, r0 = el.getBoundingClientRect();
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? [...selRef.current] : [];
    if (!additive) setSel([]);
    const at = (cx, cy) => ({ x: cx - r0.left + el.scrollLeft, y: cy - r0.top + el.scrollTop });
    const s = at(e.clientX, e.clientY);
    live.current = { s, moved: false, last: { cx: e.clientX, cy: e.clientY } };
    const update = (cx, cy) => {
      const p = at(cx, cy), L = live.current; if (!L) return;
      if (!L.moved && Math.abs(p.x - s.x) + Math.abs(p.y - s.y) < 5) return;
      L.moved = true;
      const x = Math.min(s.x, p.x), y = Math.min(s.y, p.y), w = Math.abs(p.x - s.x), h = Math.abs(p.y - s.y);
      setRect({ x, y, w, h });
      // en coordenadas de la pantalla, para compararlo con cada elemento
      const R = el.getBoundingClientRect(), left = x - el.scrollLeft + R.left, top = y - el.scrollTop + R.top;
      const hits = [];
      el.querySelectorAll(items).forEach(it => { const b = it.getBoundingClientRect(); if (b.right > left && b.left < left + w && b.bottom > top && b.top < top + h) { const id = idOf(it); if (id) hits.push(id); } });
      setSel([...new Set([...base, ...hits])]);
    };
    const move = (ev) => { live.current.last = { cx: ev.clientX, cy: ev.clientY }; ev.preventDefault(); update(ev.clientX, ev.clientY); };
    // desplazamiento automático cerca de los bordes
    const tick = setInterval(() => {
      const L = live.current; if (!L?.moved) return; const R = el.getBoundingClientRect(); const { cx, cy } = L.last;
      const d = cy < R.top + 24 ? -14 : cy > R.bottom - 24 ? 14 : 0; if (!d) return;
      const before = el.scrollTop; el.scrollTop += d; if (el.scrollTop !== before) update(cx, cy);
    }, 30);
    const up = () => { clearInterval(tick); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); live.current = null; setRect(null); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const boxEl = rect ? <div className="marquee" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} /> : null;
  return { start, box: boxEl, active: !!rect };
}
