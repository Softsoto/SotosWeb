/* ============================================================
   Sotos OS — Juegos (Flappy, Snake, 2048, Buscaminas)
   ============================================================ */
import React from "react";
import { Ic, Toolbar } from "./ui.jsx";
const { useState: useG, useRef: useGR, useEffect: useGE, useCallback: useGC } = React;

/* -------------------- Flappy -------------------- */
function Flappy() {
  const W = 360, H = 460, GAP = 130, PIPE_W = 56, R = 13;
  const cvs = useGR(null);
  const st = useGR(null);
  const [state, setState] = useG("ready"); // ready|run|over
  const [score, setScore] = useG(0);
  const [best, setBest] = useG(() => +localStorage.getItem("sotos_flappy") || 0);

  const reset = () => { st.current = { y: H / 2, vy: 0, pipes: [{ x: W + 40, gap: 150 }], t: 0, score: 0 }; setScore(0); };
  const flap = () => {
    if (state === "ready") { reset(); setState("run"); st.current.vy = -5.4; return; }
    if (state === "over") { reset(); setState("run"); st.current.vy = -5.4; return; }
    st.current.vy = -5.4;
  };

  useGE(() => {
    let raf;
    const ctx = cvs.current.getContext("2d");
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2f6fed";
    const loop = () => {
      const s = st.current;
      if (state === "run" && s) {
        s.t++; s.vy += 0.32; s.y += s.vy;
        s.pipes.forEach(p => p.x -= 2.3);
        if (s.pipes[s.pipes.length - 1].x < W - 180) s.pipes.push({ x: W + PIPE_W, gap: 70 + Math.random() * (H - GAP - 140) });
        s.pipes = s.pipes.filter(p => p.x > -PIPE_W);
        for (const p of s.pipes) {
          if (!p.passed && p.x + PIPE_W < 80) { p.passed = true; s.score++; setScore(s.score); }
          const inX = 80 + R > p.x && 80 - R < p.x + PIPE_W;
          if (inX && (s.y - R < p.gap || s.y + R > p.gap + GAP)) gameOver();
        }
        if (s.y + R > H || s.y - R < 0) gameOver();
      }
      draw(ctx, accent);
      raf = requestAnimationFrame(loop);
    };
    const gameOver = () => {
      setState("over");
      setBest(b => { const nb = Math.max(b, st.current.score); localStorage.setItem("sotos_flappy", nb); return nb; });
    };
    const draw = (ctx, accent) => {
      const s = st.current;
      ctx.fillStyle = "#bfe8ff"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#cdeeff";
      for (let i = 0; i < 3; i++) { const cx = ((i * 150 + (s ? s.t * 0.3 : 0)) % (W + 80)) - 40; ctx.beginPath(); ctx.arc(cx, 70 + i * 30, 26, 0, 7); ctx.arc(cx + 26, 70 + i * 30, 20, 0, 7); ctx.fill(); }
      if (s) {
        s.pipes.forEach(p => {
          ctx.fillStyle = "#5cc06b"; ctx.strokeStyle = "#3f9e52"; ctx.lineWidth = 2;
          ctx.fillRect(p.x, 0, PIPE_W, p.gap); ctx.strokeRect(p.x, 0, PIPE_W, p.gap);
          ctx.fillRect(p.x, p.gap + GAP, PIPE_W, H - p.gap - GAP); ctx.strokeRect(p.x, p.gap + GAP, PIPE_W, H - p.gap - GAP);
        });
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(80, s.y, R, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(85, s.y - 4, 4, 0, 7); ctx.fill();
        ctx.fillStyle = "#1b1f24"; ctx.beginPath(); ctx.arc(86, s.y - 4, 2, 0, 7); ctx.fill();
        ctx.fillStyle = "#ffb02e"; ctx.beginPath(); ctx.moveTo(80 + R, s.y); ctx.lineTo(80 + R + 7, s.y - 3); ctx.lineTo(80 + R + 7, s.y + 3); ctx.fill();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div className="game-wrap" tabIndex={0}
      onKeyDown={e => { if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); } }}
      onMouseDown={flap}>
      <div className="game-hud"><span>Puntos: <b>{score}</b></span><span>Récord: <b>{best}</b></span></div>
      <div style={{ position: "relative" }}>
        <canvas ref={cvs} width={W} height={H} style={{ borderRadius: 12, display: "block", boxShadow: "var(--shadow-card)" }} />
        {state !== "run" && (
          <div className="game-overlay">
            <Ic name={state === "over" ? "sentiment_dissatisfied" : "sports_esports"} size={44} />
            <div style={{ fontSize: 18, fontWeight: 800 }}>{state === "over" ? "¡Game Over!" : "Flappy Sotos"}</div>
            <div className="faint" style={{ fontSize: 13 }}>{state === "over" ? `Puntuación: ${score}` : "Toca o pulsa Espacio para volar"}</div>
            <button className="tb-btn primary" onClick={e => { e.stopPropagation(); flap(); }}><Ic name="play_arrow" /> {state === "over" ? "Reintentar" : "Jugar"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Snake -------------------- */
function Snake() {
  const N = 17, CELL = 22, W = N * CELL;
  const cvs = useGR(null);
  const g = useGR(null);
  const [state, setState] = useG("ready");
  const [score, setScore] = useG(0);
  const [best, setBest] = useG(() => +localStorage.getItem("sotos_snake") || 0);

  const reset = () => { g.current = { snake: [{ x: 8, y: 8 }], dir: { x: 1, y: 0 }, nd: { x: 1, y: 0 }, food: { x: 12, y: 8 }, t: 0 }; setScore(0); };
  const start = () => { reset(); setState("run"); };

  useGE(() => {
    const onKey = (e) => {
      const g0 = g.current; if (!g0) return;
      const map = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } };
      const nd = map[e.key]; if (nd && (nd.x !== -g0.dir.x || nd.y !== -g0.dir.y)) { g0.nd = nd; e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  useGE(() => {
    let raf, acc = 0, last = performance.now();
    const ctx = cvs.current.getContext("2d");
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2f6fed";
    const loop = (now) => {
      acc += now - last; last = now;
      const g0 = g.current;
      if (state === "run" && g0 && acc > 110) {
        acc = 0; g0.dir = g0.nd;
        const head = { x: (g0.snake[0].x + g0.dir.x + N) % N, y: (g0.snake[0].y + g0.dir.y + N) % N };
        if (g0.snake.some(s => s.x === head.x && s.y === head.y)) {
          setState("over"); setBest(b => { const nb = Math.max(b, g0.snake.length - 1); localStorage.setItem("sotos_snake", nb); return nb; });
        } else {
          g0.snake.unshift(head);
          if (head.x === g0.food.x && head.y === g0.food.y) {
            setScore(g0.snake.length - 1);
            do { g0.food = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 }; } while (g0.snake.some(s => s.x === g0.food.x && s.y === g0.food.y));
          } else g0.snake.pop();
        }
      }
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface-2") || "#f4f5f7"; ctx.fillRect(0, 0, W, W);
      const g1 = g.current;
      if (g1) {
        ctx.fillStyle = "#ff5f57"; const f = g1.food; ctx.beginPath(); ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, CELL / 2 - 3, 0, 7); ctx.fill();
        g1.snake.forEach((s, i) => { ctx.fillStyle = i === 0 ? accent : accent + "bb"; const pad = i === 0 ? 1 : 2; rr(ctx, s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5); });
      }
      raf = requestAnimationFrame(loop);
    };
    const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.fill(); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div className="game-wrap" tabIndex={0}>
      <div className="game-hud"><span>Longitud: <b>{score}</b></span><span>Récord: <b>{best}</b></span></div>
      <div style={{ position: "relative" }}>
        <canvas ref={cvs} width={W} height={W} style={{ borderRadius: 12, display: "block", boxShadow: "var(--shadow-card)" }} />
        {state !== "run" && (
          <div className="game-overlay">
            <Ic name={state === "over" ? "sentiment_dissatisfied" : "sports_esports"} size={44} />
            <div style={{ fontSize: 18, fontWeight: 800 }}>{state === "over" ? "¡Game Over!" : "Snake"}</div>
            <div className="faint" style={{ fontSize: 13 }}>{state === "over" ? `Longitud: ${score}` : "Usa las flechas o WASD"}</div>
            <button className="tb-btn primary" onClick={start}><Ic name="play_arrow" /> {state === "over" ? "Reintentar" : "Jugar"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- 2048 -------------------- */
function G2048() {
  const empty = () => Array(16).fill(0);
  const [grid, setGrid] = useG(() => { const g = empty(); addRandom(g); addRandom(g); return g; });
  const [score, setScore] = useG(0);
  const [best, setBest] = useG(() => +localStorage.getItem("sotos_2048") || 0);
  const [over, setOver] = useG(false);

  function addRandom(g) { const e = g.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0); if (!e.length) return; g[e[(Math.random() * e.length) | 0]] = Math.random() < 0.9 ? 2 : 4; }
  const COLORS = { 2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563", 32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72", 256: "#edcc61", 512: "#edc850", 1024: "#edc53f", 2048: "#edc22e" };

  const move = useGC((dir) => {
    setGrid(prev => {
      const g = [...prev]; let moved = false, gained = 0;
      const line = (idx) => idx.map(i => g[i]);
      const set = (idx, vals) => idx.forEach((i, k) => { if (g[i] !== vals[k]) moved = true; g[i] = vals[k]; });
      const collapse = (arr) => {
        let a = arr.filter(v => v); for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a.splice(i + 1, 1); }
        while (a.length < 4) a.push(0); return a;
      };
      for (let r = 0; r < 4; r++) {
        let idx = [0, 1, 2, 3].map(c => dir === "L" || dir === "R" ? r * 4 + c : c * 4 + r);
        if (dir === "R" || dir === "D") idx = idx.reverse();
        set(idx, collapse(line(idx)));
      }
      if (moved) { addRandom(g); setScore(s => { const ns = s + gained; setBest(b => { const nb = Math.max(b, ns); localStorage.setItem("sotos_2048", nb); return nb; }); return ns; }); }
      const full = g.every(v => v); const noMerge = ![...Array(16)].some((_, i) => { const r = (i / 4) | 0, c = i % 4; return (c < 3 && g[i] === g[i + 1]) || (r < 3 && g[i] === g[i + 4]); });
      if (full && noMerge) setOver(true);
      return g;
    });
  }, []);

  useGE(() => {
    const onKey = (e) => { const m = { ArrowLeft: "L", ArrowRight: "R", ArrowUp: "U", ArrowDown: "D", a: "L", d: "R", w: "U", s: "D" }[e.key]; if (m) { e.preventDefault(); move(m); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const restart = () => { const g = empty(); addRandom(g); addRandom(g); setGrid(g); setScore(0); setOver(false); };

  return (
    <div className="game-wrap" tabIndex={0}>
      <div className="game-hud"><span>Puntos: <b>{score}</b></span><span>Récord: <b>{best}</b></span>
        <button className="tb-btn" style={{ height: 26, padding: "0 10px" }} onClick={restart}><Ic name="refresh" size={16} /> Nuevo</button></div>
      <div style={{ position: "relative" }}>
        <div className="g2048-board">
          {grid.map((v, i) => (
            <div key={i} className="g2048-cell" style={{ background: v ? COLORS[v] || "#3c3a32" : "var(--surface-3)", color: v <= 4 ? "#776e65" : "#fff", fontSize: v >= 1024 ? 22 : 28 }}>{v || ""}</div>
          ))}
        </div>
        {over && (
          <div className="game-overlay">
            <Ic name="trophy" size={44} style={{ color: "#edc22e" }} />
            <div style={{ fontSize: 18, fontWeight: 800 }}>¡Fin!</div>
            <div className="faint" style={{ fontSize: 13 }}>Puntuación: {score}</div>
            <button className="tb-btn primary" onClick={restart}><Ic name="refresh" /> Jugar de nuevo</button>
          </div>
        )}
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>Une los números con las flechas hasta llegar a 2048</div>
    </div>
  );
}

/* -------------------- Buscaminas -------------------- */
function Mines() {
  const N = 10, MINES = 14;
  const build = () => {
    const cells = [...Array(N * N)].map(() => ({ mine: false, open: false, flag: false, n: 0 }));
    let placed = 0; while (placed < MINES) { const i = (Math.random() * N * N) | 0; if (!cells[i].mine) { cells[i].mine = true; placed++; } }
    cells.forEach((c, i) => { if (c.mine) return; const r = (i / N) | 0, col = i % N; let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = col + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && cells[nr * N + nc].mine) n++; } c.n = n; });
    return cells;
  };
  const [cells, setCells] = useG(build);
  const [state, setState] = useG("run");
  const NCOL = ["", "#2f6fed", "#1aa260", "#e2483d", "#7d2ae8", "#c43e1c", "#0aa5b5", "#1b1f24", "#7d8590"];

  const flood = (arr, i) => {
    const r = (i / N) | 0, c = i % N; if (arr[i].open || arr[i].flag) return;
    arr[i].open = true; if (arr[i].n === 0 && !arr[i].mine) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N) flood(arr, nr * N + nc); }
  };
  const open = (i) => {
    if (state !== "run" || cells[i].flag) return;
    const arr = cells.map(c => ({ ...c }));
    if (arr[i].mine) { arr.forEach(c => c.mine && (c.open = true)); setCells(arr); setState("over"); return; }
    flood(arr, i); setCells(arr);
    if (arr.every(c => c.mine || c.open)) setState("win");
  };
  const flag = (e, i) => { e.preventDefault(); if (state !== "run" || cells[i].open) return; const arr = cells.map(c => ({ ...c })); arr[i].flag = !arr[i].flag; setCells(arr); };
  const restart = () => { setCells(build()); setState("run"); };
  const left = MINES - cells.filter(c => c.flag).length;

  return (
    <div className="game-wrap" tabIndex={0}>
      <div className="game-hud"><span>💣 <b>{left}</b></span>
        <span>{state === "win" ? "¡Ganaste! 🎉" : state === "over" ? "¡Boom! 💥" : "En juego"}</span>
        <button className="tb-btn" style={{ height: 26, padding: "0 10px" }} onClick={restart}><Ic name="refresh" size={16} /> Nuevo</button></div>
      <div className="mines-board" style={{ gridTemplateColumns: `repeat(${N}, 30px)` }}>
        {cells.map((c, i) => (
          <button key={i} className={"mine-cell" + (c.open ? " open" : "")} onClick={() => open(i)} onContextMenu={e => flag(e, i)}>
            {c.open ? (c.mine ? "💣" : (c.n ? <span style={{ color: NCOL[c.n] }}>{c.n}</span> : "")) : (c.flag ? "🚩" : "")}
          </button>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>Clic para abrir · clic derecho para marcar 🚩</div>
    </div>
  );
}

/* -------------------- Games hub -------------------- */
const GAMES = [
  { id: "flappy", name: "Flappy Sotos", icon: "flutter_dash", color: "#54a0ff", comp: Flappy, desc: "Vuela entre las tuberías" },
  { id: "snake", name: "Snake", icon: "pest_control", color: "#34c759", comp: Snake, desc: "Crece sin chocar" },
  { id: "2048", name: "2048", icon: "grid_4x4", color: "#f59563", comp: G2048, desc: "Une los números" },
  { id: "mines", name: "Buscaminas", icon: "bomb", color: "#e2483d", comp: Mines, desc: "Evita las minas" },
].map(g => ({ ...g, group: "Sotos" }));
// Dos Lunas: cada juego por separado (proyecto DosLunas, `npm run build:sotos`; portadas con su propio paintThumb)
const DL = [["bloques", "Torre de Luna", "Piezas que caen; 10 líneas abren el mensaje"], ["laberinto", "Laberinto Lunar", "Recoge luces y esquiva a tres espíritus"], ["espiritus", "Lluvia de Huskies", "Lanza estrellas a las oleadas que bajan"],
  ["duelo", "Duelo de Lunas", "Faroles que se pasan una lunita, solo o a dos"], ["tejados", "Carrera por los Tejados", "Corre y salta los huecos entre casas"], ["muro", "Muro de Faroles", "Haz rebotar la luz y apaga el muro"],
  ["dragon", "Dragón de Papel", "Come flores de cerezo para crecer"], ["parejas", "Parejas de Huskies", "Encuentra las parejas en tres rondas"], ["fichas", "Fichas del Templo", "Quita fichas iguales que estén libres"],
  ["carreras", "Ruta de los Faroles", "Carrera contra el reloj, estilo clásico"], ["pinball", "Pinball de las Lunas", "Mesa de tres pisos con misiones y rangos"], ["esferas", "Cadena de Lunas", "Dispara esferas y rompe la cadena"], ["mascotas", "Casa de Patitas", "Cuida gatitos y perritos virtuales"]];
const DL_GAMES = DL.map(([id, name, desc]) => ({ id: "dl-" + id, name, desc, group: "Dos Lunas", color: "#151838", pixel: true,
  cover: `juegos/dos-lunas/portadas/${id}.png`, frame: `juegos/dos-lunas/index.html?juego=${id}` }));
// Sala clásica: el motor de sotomontes-web/arcade, un juego por entrada (<arcade-solo>)
const SALA = [["pac", "Come-cocos", "Laberinto, pastillas y cuatro fantasmas", "radio_button_checked", "#f2c94c"], ["blocks", "Bloques", "Encaja piezas y desbloquea poderes", "view_quilt", "#17c0eb"],
  ["invaders", "Invasores", "Defiende la base del enjambre", "rocket", "#7bed6a"], ["pong", "Paletas", "Duelo contra la CPU, que sube de nivel", "sports_tennis", "#f3f2f2"],
  ["bricks", "Ladrillos", "Power-ups y multibola", "grid_view", "#ff7a59"], ["mines", "Minas", "El clásico de escritorio, con ratón", "flag", "#ec3013"]];
const SALA_GAMES = SALA.map(([id, name, desc, icon, ink]) => ({ id: "sala-" + id, name, desc, icon, ink, group: "Sala clásica", color: "#0b0b0b", frame: `juegos/sala/index.html?juego=${id}` }));
const ALL_GAMES = [...GAMES, ...DL_GAMES, ...SALA_GAMES];
const GROUPS = [["Sotos", "Juegos de Sotos"], ["Dos Lunas", "Dos Lunas · pixel art, con logros y récords"], ["Sala clásica", "Sala clásica · teclado, P pausa, Esc salir, M silencio"]];
// juego que corre en su propia página (iframe del mismo origen): avisa al cerrarse con postMessage
function FrameGame({ g, onClose }) {
  React.useEffect(() => {
    const onMsg = (e) => { if (e.origin === location.origin && e.data?.type === "sotos-game-close") onClose(); };
    window.addEventListener("message", onMsg); return () => window.removeEventListener("message", onMsg);
  }, [onClose]);
  return <iframe title={g.name} src={import.meta.env.BASE_URL + g.frame} allow="fullscreen; gamepad" style={{ flex: 1, width: "100%", border: 0, background: "#0a0b1e" }} />;
}
function GamesApp() {
  const [game, setGame] = useG(null);
  const G = game && ALL_GAMES.find(x => x.id === game);
  return (
    <div className={"app" + (G?.frame ? " game-full" : "")} style={{ flexDirection: "column", background: G?.frame ? "#000" : "var(--surface-2)" }}>
      {G?.frame && <button className="game-back" title="Volver a Juegos (Esc en la sala)" onClick={() => setGame(null)}><Ic name="arrow_back" size={18} /> Juegos</button>}
      {!G?.frame && <Toolbar>
        {game && <button className="tb-btn icon" onClick={() => setGame(null)}><Ic name="arrow_back" /></button>}
        <span className="tb-title">{G ? G.name : "Juegos"}</span>
        <div className="tb-spacer" />
        <span className="faint" style={{ fontSize: 12 }}>{ALL_GAMES.length} juegos</span>
      </Toolbar>}
      {!game ? (
        <div className="scroll" style={{ flex: 1, padding: 22 }}>
          {GROUPS.map(([grp, label]) => (
            <React.Fragment key={grp}>
              <div className="game-group">{label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 14, marginBottom: 22 }}>
                {ALL_GAMES.filter(g => g.group === grp).map(g => (
                  <button key={g.id} className="game-card" onClick={() => setGame(g.id)}>
                    <div className={"game-cover" + (g.pixel ? " pixel" : "")} style={{ background: g.pixel ? g.color : `linear-gradient(150deg, ${g.color}, ${g.color}99)` }}>
                      {g.cover ? <img className={g.pixel ? "pixel-cover" : ""} src={import.meta.env.BASE_URL + g.cover} alt="" /> : <Ic name={g.icon} size={46} style={{ color: g.ink || "#fff" }} />}</div>
                    <div style={{ padding: "11px 13px", textAlign: "left" }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{g.name}</div>
                      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{g.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : G.frame ? (
        <FrameGame g={G} onClose={() => setGame(null)} />
      ) : (
        <div style={{ flex: 1, display: "grid", placeItems: "center", overflow: "auto", padding: 16 }}>
          <G.comp />
        </div>
      )}
    </div>
  );
}

export { GamesApp };
