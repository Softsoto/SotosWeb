/* ============================================================
   Sotos — videollamadas en los mundos
   WebRTC directo entre los navegadores (malla: cada participante con cada uno, ideal hasta ~6).
   El servidor de Sotos solo pasa las ofertas, respuestas y candidatos de conexión.
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { Ic, toast } from "./ui.jsx";
import { api, onServer } from "./api.js";
import { PersonAvatar } from "./contacts.jsx";
const { useState, useEffect, useRef } = React;

function Tile({ stream, name, muted, self, camOff }) {
  const v = useRef(null);
  useEffect(() => { if (v.current && v.current.srcObject !== stream) v.current.srcObject = stream || null; }, [stream]);
  const hasVideo = !!stream && stream.getVideoTracks().some(t => t.enabled && t.readyState === "live") && !camOff;
  return <div className={"call-tile" + (self ? " self" : "")}>
    <video ref={v} autoPlay playsInline muted={muted} style={{ visibility: hasVideo ? "visible" : "hidden" }} />
    {!hasVideo && <div className="call-avatar"><PersonAvatar name={name} size={72} /></div>}
    <span className="call-name">{self ? "Tú" : name}</span>
  </div>;
}

export function WorldCall({ w, visible, onActive }) {
  const [phase, setPhase] = useState("idle"); // idle | joining | in
  const [others, setOthers] = useState([]);   // quién está en la llamada (antes de unirse)
  const [peers, setPeers] = useState({});     // id → { name, stream }
  const [mic, setMic] = useState(true), [cam, setCam] = useState(true), [sharing, setSharing] = useState(false);
  const local = useRef(null), pcs = useRef(new Map()), pending = useRef(new Map()), ice = useRef([]), names = useRef({}), camTrack = useRef(null);
  const refresh = () => api("GET", `worlds/${w.id}/call`).then(r => { setOthers(r.participants); ice.current = r.iceServers; }).catch(() => {});
  useEffect(() => { refresh(); }, [w.id]);
  useEffect(() => { onActive?.(phase === "in"); }, [phase]);
  const signal = (to, data) => api("POST", `worlds/${w.id}/call/signal`, { to, data }).catch(() => {});

  const closePeer = (id) => { pcs.current.get(id)?.close(); pcs.current.delete(id); setPeers(p => { const x = { ...p }; delete x[id]; return x; }); };
  const peer = (id, name, initiator) => {
    if (pcs.current.has(id)) return pcs.current.get(id);
    names.current[id] = name;
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    pcs.current.set(id, pc);
    local.current?.getTracks().forEach(t => pc.addTrack(t, local.current));
    pc.onicecandidate = (e) => { if (e.candidate) signal(id, { type: "candidate", candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => setPeers(p => ({ ...p, [id]: { name: names.current[id] || name, stream: e.streams[0] } }));
    pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState)) closePeer(id); };
    setPeers(p => ({ ...p, [id]: p[id] || { name, stream: null } }));
    if (initiator) (async () => { const o = await pc.createOffer(); await pc.setLocalDescription(o); signal(id, { type: "offer", sdp: o.sdp }); })();
    return pc;
  };

  // mensajes de la llamada que llegan por la conexión en vivo de Sotos
  useEffect(() => onServer("call", async (d) => {
    if (d.world !== w.id) return;
    if (d.participants) setOthers(d.participants);
    if (phase !== "in") return;
    if (d.kind === "leave") return closePeer(d.from);
    if (d.kind !== "signal") return;
    const { data } = d;
    try {
      const flush = async (pc) => { for (const c of pending.current.get(d.from) || []) await pc.addIceCandidate(c).catch(() => {}); pending.current.delete(d.from); };
      if (data.type === "offer") { const pc = peer(d.from, d.name, false); await pc.setRemoteDescription({ type: "offer", sdp: data.sdp }); await flush(pc); const a = await pc.createAnswer(); await pc.setLocalDescription(a); signal(d.from, { type: "answer", sdp: a.sdp }); }
      else if (data.type === "answer") { const pc = pcs.current.get(d.from); if (pc) { await pc.setRemoteDescription({ type: "answer", sdp: data.sdp }); await flush(pc); } }
      else if (data.type === "candidate") { const pc = pcs.current.get(d.from); // los candidatos pueden llegar antes que la descripción: se guardan
        if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {}); else pending.current.set(d.from, [...(pending.current.get(d.from) || []), data.candidate]); }
    } catch (e) { console.warn("[llamada]", e); }
  }), [w.id, phase]);

  const join = async (video) => {
    setPhase("joining");
    try {
      local.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
      camTrack.current = local.current.getVideoTracks()[0] || null; setCam(!!camTrack.current); setMic(true);
      const r = await api("POST", `worlds/${w.id}/call/join`); ice.current = r.iceServers;
      setPhase("in");
      for (const p of r.participants) peer(p.id, p.name, true); // quien llega llama a los que ya están
    } catch (e) {
      local.current?.getTracks().forEach(t => t.stop()); local.current = null; setPhase("idle");
      toast(e.name === "NotAllowedError" ? "Sotos necesita permiso para usar el micrófono y la cámara" : e.name === "NotFoundError" ? "No se encontró micrófono o cámara" : e.message, { error: true });
    }
  };
  const leave = async () => {
    for (const id of [...pcs.current.keys()]) closePeer(id);
    local.current?.getTracks().forEach(t => t.stop()); local.current = null; setSharing(false);
    setPhase("idle"); await api("POST", `worlds/${w.id}/call/leave`).catch(() => {}); refresh();
  };
  useEffect(() => { if (phase !== "in") return; const t = setInterval(() => api("POST", `worlds/${w.id}/call/ping`).catch(() => {}), 15_000); return () => clearInterval(t); }, [phase]);
  useEffect(() => () => { if (local.current) { pcs.current.forEach(pc => pc.close()); local.current.getTracks().forEach(t => t.stop()); api("POST", `worlds/${w.id}/call/leave`).catch(() => {}); } }, []);

  const toggleMic = () => { local.current?.getAudioTracks().forEach(t => t.enabled = !mic); setMic(!mic); };
  const toggleCam = () => { if (!camTrack.current) return toast("Te uniste solo con audio", { icon: "videocam_off" }); camTrack.current.enabled = !cam; setCam(!cam); };
  const share = async () => {
    const swap = (track) => pcs.current.forEach(pc => pc.getSenders().find(s => s.track?.kind === "video")?.replaceTrack(track));
    if (sharing) { swap(camTrack.current); setSharing(false); return; }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true }); const t = s.getVideoTracks()[0];
      if (!pcs.current.size || ![...pcs.current.values()].some(pc => pc.getSenders().some(x => x.track?.kind === "video"))) { t.stop(); return toast("Para compartir pantalla, únete con cámara", { icon: "screen_share" }); }
      swap(t); setSharing(true); t.onended = () => { swap(camTrack.current); setSharing(false); };
    } catch {}
  };

  if (!visible && phase !== "in") return null;
  if (phase !== "in") return <div className="call-lobby" style={{ display: visible ? undefined : "none" }}>
    <Ic name="video_call" size={48} style={{ color: "var(--world, var(--accent))" }} />
    <h3>Videollamada de «{w.name}»</h3>
    {others.length ? <div className="call-who">{others.map(p => <span key={p.id}><PersonAvatar name={p.name} size={30} /> {p.name}</span>)}<span className="faint">{others.length === 1 ? "está" : "están"} en la llamada</span></div>
      : <div className="muted">Nadie está en la llamada todavía. Al entrar, los demás miembros reciben un aviso.</div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
      <button className="tb-btn primary" disabled={phase === "joining"} onClick={() => join(true)}><Ic name="videocam" /> {others.length ? "Unirse con cámara" : "Iniciar con cámara"}</button>
      <button className="tb-btn" disabled={phase === "joining"} onClick={() => join(false)}><Ic name="mic" /> Solo audio</button>
    </div>
    <div className="faint" style={{ fontSize: 11.5, maxWidth: 420, textAlign: "center" }}>El video y el audio van directo entre los navegadores de los participantes; el servidor de Sotos no los graba ni los guarda.</div>
  </div>;
  const list = Object.entries(peers);
  return <div className="call-room" style={{ display: visible ? undefined : "none" }}>
    <div className={"call-grid n" + Math.min(list.length + 1, 6)}>
      <Tile self stream={local.current} name="Tú" muted camOff={!cam && !sharing} />
      {list.map(([id, p]) => <Tile key={id} stream={p.stream} name={p.name} />)}
    </div>
    {!list.length && <div className="call-alone faint">Esperando a que alguien se una…</div>}
    <div className="call-bar">
      <button className={"call-btn" + (mic ? "" : " off")} title={mic ? "Silenciar" : "Activar micrófono"} onClick={toggleMic}><Ic name={mic ? "mic" : "mic_off"} /></button>
      <button className={"call-btn" + (cam ? "" : " off")} title={cam ? "Apagar cámara" : "Encender cámara"} onClick={toggleCam}><Ic name={cam ? "videocam" : "videocam_off"} /></button>
      {navigator.mediaDevices?.getDisplayMedia && <button className={"call-btn" + (sharing ? " on" : "")} title={sharing ? "Dejar de compartir" : "Compartir pantalla"} onClick={share}><Ic name={sharing ? "stop_screen_share" : "screen_share"} /></button>}
      <button className="call-btn hang" title="Salir de la llamada" onClick={leave}><Ic name="call_end" /></button>
    </div>
  </div>;
}
