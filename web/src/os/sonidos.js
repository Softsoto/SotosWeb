/* ============================================================
   Sotos — sonidos de los temas de época
   Sintetizados en el momento con Web Audio (acordes y campanas propias, ningún archivo de
   audio de otros sistemas). Eventos: "entrar", "salir", "aviso", "abrir".
   Se apagan en Ajustes → Apariencia → Sonidos del tema.
   © 2026 Sebastian Sotomontes
   ============================================================ */
let ctx = null;
const ac = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); return ctx; } catch { return null; } };
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12); // nota MIDI → Hz

/** una voz: oscilador (o dos ligeramente desafinados) con envolvente suave */
function voice(a, { note, at = 0, dur = 0.6, type = "sine", gain = 0.12, detune = 0, attack = 0.02, glide = 0 }) {
  const t = a.currentTime + at, out = a.createGain();
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(gain, t + attack); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(a.destination);
  for (const d of detune ? [-detune, detune] : [0]) {
    const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(hz(note), t); o.detune.value = d;
    if (glide) o.frequency.exponentialRampToValueAtTime(hz(note + glide), t + dur * 0.8);
    o.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
}
/** campana: fundamental + parciales inarmónicos que se apagan antes */
const bell = (a, note, at, gain = 0.09, dur = 1.4) => { voice(a, { note, at, dur, gain }); voice(a, { note: note + 19.02, at, dur: dur * 0.5, gain: gain * 0.35 }); voice(a, { note: note + 28, at, dur: dur * 0.3, gain: gain * 0.15 }); };

const SETS = {
  // 2001: acorde mayor cálido y ascendente, con un brillo de campana al final
  prado: {
    entrar: (a) => { [60, 64, 67, 72].forEach((n, i) => voice(a, { note: n, at: i * 0.16, dur: 1.6 - i * 0.2, type: "triangle", gain: 0.09, detune: 6 })); bell(a, 84, 0.62, 0.05); },
    salir: (a) => { [72, 67, 64, 60].forEach((n, i) => voice(a, { note: n, at: i * 0.15, dur: 1.1, type: "triangle", gain: 0.08, detune: 6 })); },
    aviso: (a) => { bell(a, 79, 0, 0.08, 0.7); bell(a, 84, 0.12, 0.06, 0.9); },
    abrir: (a) => voice(a, { note: 76, dur: 0.12, type: "triangle", gain: 0.05 }),
  },
  // 2007: pad amplio que se abre, quinta y novena
  cristal: {
    entrar: (a) => { [57, 64, 69, 71, 76].forEach((n, i) => voice(a, { note: n, at: i * 0.22, dur: 2.6, type: "sine", gain: 0.06, attack: 0.5, detune: 9 })); bell(a, 88, 1.1, 0.035, 2); },
    salir: (a) => { [76, 71, 64, 57].forEach((n, i) => voice(a, { note: n, at: i * 0.2, dur: 1.8, gain: 0.06, attack: 0.3, detune: 9 })); },
    aviso: (a) => { voice(a, { note: 81, dur: 0.5, gain: 0.07, attack: 0.01 }); voice(a, { note: 88, at: 0.09, dur: 0.6, gain: 0.05 }); },
    abrir: (a) => voice(a, { note: 81, dur: 0.15, gain: 0.04, attack: 0.005 }),
  },
  // 2009: cuatro notas limpias, más corto
  vidrio: {
    entrar: (a) => { [64, 71, 76, 79].forEach((n, i) => { voice(a, { note: n, at: i * 0.18, dur: 1.5, gain: 0.07, attack: 0.03, detune: 5 }); }); bell(a, 83, 0.6, 0.04); },
    salir: (a) => { [79, 76, 71, 64].forEach((n, i) => voice(a, { note: n, at: i * 0.16, dur: 1.2, gain: 0.06, detune: 5 })); },
    aviso: (a) => { bell(a, 83, 0, 0.07, 0.6); },
    abrir: (a) => voice(a, { note: 83, dur: 0.1, gain: 0.035, attack: 0.004 }),
  },
  // 2012: minimal, dos notas secas
  mosaico: {
    entrar: (a) => { voice(a, { note: 72, dur: 0.35, type: "sine", gain: 0.09, attack: 0.005 }); voice(a, { note: 79, at: 0.14, dur: 0.6, gain: 0.08, attack: 0.005 }); },
    salir: (a) => { voice(a, { note: 79, dur: 0.3, gain: 0.08, attack: 0.005 }); voice(a, { note: 72, at: 0.13, dur: 0.5, gain: 0.07, attack: 0.005 }); },
    aviso: (a) => { voice(a, { note: 84, dur: 0.25, gain: 0.08, attack: 0.004 }); },
    abrir: (a) => voice(a, { note: 88, dur: 0.06, gain: 0.03, attack: 0.002 }),
  },
  // Mac: un acorde grande y lleno, sostenido
  aluminio: {
    entrar: (a) => { [48, 55, 60, 64, 67, 72].forEach(n => voice(a, { note: n, dur: 2.8, type: "sawtooth", gain: 0.018, attack: 0.03, detune: 7 })); [60, 64, 67, 72].forEach(n => voice(a, { note: n, dur: 2.8, gain: 0.05, attack: 0.03 })); },
    salir: (a) => { [72, 67, 60].forEach((n, i) => voice(a, { note: n, at: i * 0.12, dur: 0.9, gain: 0.05 })); },
    aviso: (a) => { voice(a, { note: 86, dur: 0.18, type: "triangle", gain: 0.07, attack: 0.003 }); voice(a, { note: 91, at: 0.1, dur: 0.35, type: "triangle", gain: 0.05, attack: 0.003 }); },
    abrir: (a) => voice(a, { note: 79, dur: 0.08, gain: 0.03, attack: 0.002 }),
  },
};
/* eventos comunes a todas las épocas, con el timbre de cada una */
const noise = (a, { at = 0, dur = 0.12, gain = 0.05, hp = 1200 }) => { // soplo corto (papelera, cerrar)
  const t = a.currentTime + at, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); src.buffer = buf; f.type = "highpass"; f.frequency.value = hp; g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
};
const TIMBRE = { prado: "triangle", cristal: "sine", vidrio: "sine", mosaico: "sine", aluminio: "triangle" };
const BASE = { prado: 72, cristal: 69, vidrio: 71, mosaico: 76, aluminio: 74 };
for (const [set, ev] of Object.entries(SETS)) {
  const ty = TIMBRE[set], b = BASE[set];
  ev.cerrar ||= (a) => { voice(a, { note: b, dur: 0.12, type: ty, gain: 0.04, attack: 0.003, glide: -5 }); };
  ev.minimizar ||= (a) => { voice(a, { note: b + 7, dur: 0.18, type: ty, gain: 0.035, attack: 0.003, glide: -12 }); };
  ev.maximizar ||= (a) => { voice(a, { note: b - 5, dur: 0.18, type: ty, gain: 0.035, attack: 0.003, glide: 12 }); };
  ev.inicio ||= (a) => { voice(a, { note: b + 12, dur: 0.09, type: ty, gain: 0.035, attack: 0.002 }); voice(a, { note: b + 19, at: 0.05, dur: 0.12, type: ty, gain: 0.03, attack: 0.002 }); };
  ev.error ||= (a) => { voice(a, { note: b - 10, dur: 0.22, type: "square", gain: 0.03, attack: 0.002 }); voice(a, { note: b - 13, at: 0.12, dur: 0.3, type: "square", gain: 0.025, attack: 0.002 }); };
  ev.vaciar ||= (a) => { noise(a, { dur: 0.35, gain: 0.06, hp: 600 }); voice(a, { note: b - 24, at: 0.05, dur: 0.25, type: "triangle", gain: 0.05, glide: -7 }); };
}

/** sonido de la interfaz según el tema actual (data-skin en <html>); solo suena en los temas de época */
const ERA_SOUND = { prado: "prado", cristal: "cristal", vidrio: "vidrio", mosaico: "mosaico", aluminio: "aluminio" };
let last = 0;
export function playUi(event) {
  const set = ERA_SOUND[document.documentElement.dataset.skin]; if (!set) return;
  const now = performance.now(); if (event !== "error" && event !== "aviso" && now - last < 60) return; last = now; // sin metralla al abrir muchas ventanas
  playEra(set, event);
}

/** reproduce el sonido de un evento para un tema (si el tema tiene y están activados) */
export function playEra(set, event) {
  const f = SETS[set]?.[event]; if (!f) return;
  try { if (localStorage.getItem("sotos_era_sounds") === "0") return; } catch {}
  const a = ac(); if (a) try { f(a); } catch {}
}
export const setEraSounds = (on) => { try { localStorage.setItem("sotos_era_sounds", on ? "1" : "0"); } catch {} };
export const eraSoundsOn = () => { try { return localStorage.getItem("sotos_era_sounds") !== "0"; } catch { return true; } };
