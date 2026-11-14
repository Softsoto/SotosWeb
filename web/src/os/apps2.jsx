/* ============================================================
   Sotos OS — Music, Video, PDF
   ============================================================ */
import React from "react";
import { TRACKS, VIDEOS } from "./data.jsx";
import { Ic, SideItem, Toolbar } from "./ui.jsx";
const { useState: useS2, useRef: useR2, useEffect: useE2 } = React;

/* -------------------- Music (real playback) -------------------- */
function MusicApp() {
  const [cur, setCur] = useS2(0);
  const [playing, setPlaying] = useS2(false);
  const [t, setT] = useS2(0);
  const [dur, setDur] = useS2(0);
  const audio = useR2(null);
  const track = TRACKS[cur];

  useE2(() => {
    const a = audio.current; if (!a) return;
    if (playing) a.play().catch(() => setPlaying(false)); else a.pause();
  }, [playing, cur]);

  const fmt = s => (isNaN(s) ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
  const pick = i => { setCur(i); setT(0); setPlaying(true); };
  const next = () => pick((cur + 1) % TRACKS.length);
  const prev = () => pick((cur - 1 + TRACKS.length) % TRACKS.length);

  return (
    <div className="app">
      <audio ref={audio} src={track.src}
        onTimeUpdate={e => setT(e.target.currentTime)} onLoadedMetadata={e => setDur(e.target.duration)} onEnded={next} />
      <div className="app-side">
        <div className="side-group">
          <div className="side-label">Biblioteca</div>
          <SideItem icon="play_circle" label="En reproducción" active color="#fc3c44" />
          <SideItem icon="favorite" label="Favoritas" color="#ff375f" />
          <SideItem icon="schedule" label="Recientes" color="#7d8590" />
        </div>
        <div className="side-group">
          <div className="side-label">Listas</div>
          <SideItem icon="queue_music" label="Concentración" color="#2f6fed" />
          <SideItem icon="queue_music" label="Synthwave" color="#8e5cf6" />
          <SideItem icon="queue_music" label="Lo-fi noche" color="#0aa5b5" />
        </div>
      </div>
      <div className="app-main">
        <div className="scroll" style={{ flex: 1 }}>
          <div style={{ padding: "22px 22px 8px", display: "flex", gap: 18, alignItems: "flex-end" }}>
            <div style={{ width: 120, height: 120, borderRadius: 14, background: track.color, boxShadow: "var(--shadow-card)", display: "grid", placeItems: "center" }}>
              <Ic name="music_note" size={52} style={{ color: "rgba(255,255,255,.9)" }} />
            </div>
            <div>
              <div className="faint" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>Lista</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Concentración</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{TRACKS.length} canciones · audio real</div>
            </div>
          </div>
          <div style={{ padding: "8px 14px 14px" }}>
            {TRACKS.map((tr, i) => (
              <div key={tr.id} onClick={() => pick(i)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 10px", borderRadius: 9, cursor: "default", background: cur === i ? "var(--hover)" : "transparent" }}>
                <div style={{ width: 22, textAlign: "center", color: cur === i ? "var(--accent)" : "var(--text-faint)", fontSize: 13 }}>
                  {cur === i && playing ? <Ic name="equalizer" size={18} /> : i + 1}</div>
                <div style={{ width: 34, height: 34, borderRadius: 7, background: tr.color, flex: "0 0 34px" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: cur === i ? "var(--accent)" : "var(--text)" }}>{tr.title}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{tr.artist} · {tr.album}</div>
                </div>
                <div className="faint" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{tr.dur}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: "0 0 70px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, padding: "0 18px", background: "var(--surface)" }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: track.color, flex: "0 0 44px" }} />
          <div style={{ width: 150 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</div>
            <div className="faint" style={{ fontSize: 12 }}>{track.artist}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="tb-btn icon" onClick={prev}><Ic name="skip_previous" /></button>
            <button className="tb-btn icon" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "transparent", width: 38, height: 38 }}
              onClick={() => setPlaying(!playing)}><Ic name={playing ? "pause" : "play_arrow"} size={22} /></button>
            <button className="tb-btn icon" onClick={next}><Ic name="skip_next" /></button>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9 }}>
            <span className="faint" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", width: 34, textAlign: "right" }}>{fmt(t)}</span>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--surface-3)", cursor: "pointer" }}
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); const nt = ((e.clientX - r.left) / r.width) * dur; if (audio.current) audio.current.currentTime = nt; setT(nt); }}>
              <div style={{ width: (dur ? (t / dur) * 100 : 0) + "%", height: "100%", borderRadius: 3, background: "var(--accent)" }} />
            </div>
            <span className="faint" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", width: 34 }}>{fmt(dur)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Video (real playback) -------------------- */
function VideoApp({ file }) {
  const [cur, setCur] = useS2(0);
  const v = VIDEOS[cur];
  return (
    <div className="app">
      <div className="app-side" style={{ width: 210, flexBasis: 210 }}>
        <div className="side-label">Vídeos</div>
        {VIDEOS.map((vid, i) => (
          <div key={vid.id} onClick={() => setCur(i)}
            style={{ display: "flex", gap: 10, padding: "8px", borderRadius: 9, cursor: "pointer", alignItems: "center",
              background: cur === i ? "var(--hover)" : "transparent" }}>
            <div style={{ width: 56, height: 34, borderRadius: 6, background: vid.color, display: "grid", placeItems: "center", flex: "0 0 56px" }}>
              <Ic name="play_arrow" size={20} style={{ color: "#fff" }} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vid.title}</div>
              <div className="faint" style={{ fontSize: 11.5 }}>{vid.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="app-main" style={{ background: "#0a0c10" }}>
        <video key={v.src} src={v.src} controls autoPlay style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
      </div>
    </div>
  );
}

/* -------------------- PDF -------------------- */
function PdfApp({ file }) {
  const [page, setPage] = useS2(1);
  const TOTAL = 4;
  const Line = ({ w }) => <div style={{ height: 9, borderRadius: 3, background: "var(--surface-3)", width: w }} />;
  return (
    <div className="app" style={{ flexDirection: "column" }}>
      <Toolbar>
        <span className="office-badge pdf" style={{ marginRight: 2 }}>PDF</span>
        <span className="tb-title" style={{ fontSize: 13.5 }}>{file || "Concert Undersea.pdf"}</span>
        <div className="tb-spacer" />
        <button className="tb-btn icon" onClick={() => setPage(Math.max(1, page - 1))}><Ic name="chevron_left" /></button>
        <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{page} / {TOTAL}</span>
        <button className="tb-btn icon" onClick={() => setPage(Math.min(TOTAL, page + 1))}><Ic name="chevron_right" /></button>
        <div className="divider-v" style={{ width: 1, height: 22, background: "var(--border)", margin: "0 6px" }} />
        <button className="tb-btn icon"><Ic name="download" /></button>
        <button className="tb-btn icon"><Ic name="print" /></button>
      </Toolbar>
      <div className="scroll" style={{ flex: 1, background: "var(--surface-2)", padding: 26, display: "grid", placeItems: "start center" }}>
        <div style={{ width: 460, minHeight: 600, background: "#fff", boxShadow: "var(--shadow-card)", padding: "52px 48px",
          display: "flex", flexDirection: "column", gap: 14, color: "#1b1f24" }}>
          {page === 1 && <>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1b1f24" }}>Acuerdo de servicio</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Sotos Cloud, S.L. · Junio 2026</div>
            <div style={{ height: 10 }} />
          </>}
          {[...Array(page === 1 ? 9 : 13)].map((_, i) => <Line key={i} w={`${70 + (i * 37 % 30)}%`} />)}
          <div style={{ height: 8 }} />
          {[...Array(7)].map((_, i) => <Line key={"b" + i} w={`${65 + (i * 53 % 33)}%`} />)}
        </div>
      </div>
    </div>
  );
}

export { MusicApp, VideoApp, PdfApp };
