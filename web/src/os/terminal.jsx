/* ============================================================
   Sotos OS — Terminal (sotos-sh) sobre el sistema de archivos real
   © 2026 Sebastian Sotomontes
   ============================================================ */
import React from "react";
import { APPS, APP_BY_ID } from "./data.jsx";
import * as vfs from "./vfs.js";
import { ROOT, fmtSize } from "./vfs.js";
const { useState, useRef, useEffect } = React;

const HELP = `Comandos disponibles:
  ls [-l] [ruta]        listar contenido          cd [ruta]          cambiar de carpeta
  pwd                   carpeta actual            tree [ruta]        árbol de carpetas
  mkdir <nombre>        crear carpeta             touch <archivo>    crear archivo vacío
  cat <archivo>         mostrar contenido         head/tail [-n N]   primeras/últimas líneas
  echo <texto> [> f]    escribir (>> añade)       wc <archivo>       líneas, palabras, bytes
  cp <origen> <dest>    copiar                    mv <origen> <dest> mover / renombrar
  rm [-r] <ruta>        mover a la papelera       find <texto>       buscar por nombre
  grep <texto> <arch>   buscar dentro de texto    du [ruta]          espacio usado
  open <arch|app>       abrir archivo o app       download <ruta>    descargar al PC
  apps                  lista de apps             history            historial
  date  whoami  neofetch  clear  help
Atajos: ↑/↓ historial · Tab autocompleta · Ctrl+L limpia · Ctrl+C cancela la línea`;

// separa argumentos respetando comillas
function parseArgs(s) { const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]); return out; }

function TerminalApp({ openApp, openItem, profile }) {
  const [lines, setLines] = useState([{ t: "out", v: "Sotos Shell 2.0 — escribe 'help' para ver los comandos." }]);
  const [cmd, setCmd] = useState("");
  const [cwd, setCwd] = useState(ROOT);
  const [hist, setHist] = useState(() => { try { return JSON.parse(localStorage.getItem("sotos_sh_hist")) || []; } catch { return []; } });
  const hi = useRef(-1);
  const queue = useRef(Promise.resolve()); // comandos en orden, aunque sean asíncronos
  const cwdRef = useRef(ROOT);
  const scroller = useRef(null), input = useRef(null);
  useEffect(() => { scroller.current?.scrollTo(0, 9e9); }, [lines]);
  useEffect(() => { try { localStorage.setItem("sotos_sh_hist", JSON.stringify(hist.slice(-200))); } catch {} }, [hist]);

  const user = (profile?.name || "invitado").toLowerCase().split(" ")[0].normalize("NFD").replace(/[^\w]/g, "") || "invitado";
  const pathLabel = (id) => id === ROOT ? "~" : "~" + vfs.pathString(id);
  const prompt = (id) => <><span className="t-user">{user}@sotos</span>:<span className="t-path">{pathLabel(id)}</span>$ </>;

  const run = async (raw) => {
    const cwd = vfs.node(cwdRef.current) ? cwdRef.current : ROOT;
    const out = [{ t: "in", v: raw, cwd }];
    const push = (v, t = "out") => out.push({ t, v });
    const err = (v) => push(v, "err");
    let newCwd = cwd;
    if (raw.trim()) setHist(h => h[h.length - 1] === raw ? h : [...h, raw]);
    hi.current = -1;

    // redirección > / >>
    let redirect = null; let body = raw;
    const rm = /^(.*?)\s*(>>?)\s*(\S+)\s*$/.exec(raw);
    if (rm && /^\s*echo\b/.test(raw)) { body = rm[1]; redirect = { mode: rm[2], target: rm[3] }; }
    const [name, ...args] = parseArgs(body.trim());
    const at = (p) => vfs.resolve(p || ".", cwd);
    const need = (p, label) => { const n = at(p); if (!n) err(`${label}: ${p}: no existe el archivo o la carpeta`); return n; };
    const flags = args.filter(a => /^-\w/.test(a)), pos = args.filter(a => !/^-\w/.test(a));
    try {
      switch (name) {
        case undefined: break;
        case "help": push(HELP); break;
        case "clear": setLines([]); return;
        case "pwd": push(cwd === ROOT ? "/" : vfs.pathString(cwd)); break;
        case "whoami": push(user); break;
        case "date": push(new Date().toLocaleString("es-ES", { dateStyle: "full", timeStyle: "medium" })); break;
        case "history": hist.forEach((h, i) => push(String(i + 1).padStart(4) + "  " + h)); break;
        case "apps": push(APPS.filter(a => a.id !== "web").map(a => a.id.padEnd(11) + a.name).join("\n")); break;
        case "cd": {
          const n = pos[0] ? need(pos[0], "cd") : vfs.getState().root;
          if (n && n.type !== "folder") err(`cd: ${pos[0]}: no es una carpeta`); else if (n) newCwd = n.id;
          break;
        }
        case "ls": case "dir": {
          const n = need(pos[0], "ls"); if (!n) break;
          const list = n.type === "folder" ? [...(n.children || [])].sort((a, b) => (b.type === "folder") - (a.type === "folder") || a.name.localeCompare(b.name, "es")) : [n];
          if (flags.some(f => f.includes("l"))) list.forEach(c => push(`${c.type === "folder" ? "d" : "-"}  ${(c.type === "folder" ? `${(c.children || []).length} el.` : fmtSize(c.size)).padStart(10)}  ${new Date(c.mtime || 0).toLocaleDateString("es-ES").padEnd(10)}  ${c.name}${c.type === "folder" ? "/" : ""}`));
          else push(list.map(c => c.type === "folder" ? `\u0001${c.name}/` : c.name).join("    ") || "(vacío)");
          break;
        }
        case "tree": {
          const n = need(pos[0], "tree"); if (!n) break;
          let count = 0;
          const go = (x, pre) => (x.children || []).forEach((c, i, arr) => { if (count++ > 400) return; const last = i === arr.length - 1; push(pre + (last ? "└── " : "├── ") + c.name + (c.type === "folder" ? "/" : "")); if (c.children) go(c, pre + (last ? "    " : "│   ")); });
          push(n.id === ROOT ? "." : n.name); go(n, "");
          break;
        }
        case "mkdir": { if (!pos.length) { err("mkdir: falta el nombre"); break; } for (const p of pos) { const i = p.lastIndexOf("/"); const parent = i >= 0 ? at(p.slice(0, i) || "/") : at("."); if (!parent) err(`mkdir: ${p}: ruta no válida`); else vfs.mkdir(parent.id, p.slice(i + 1)); } break; }
        case "touch": { for (const p of pos) { if (at(p)) continue; const i = p.lastIndexOf("/"); const parent = i >= 0 ? at(p.slice(0, i) || "/") : at("."); if (!parent) err(`touch: ${p}: ruta no válida`); else await vfs.create(parent.id, p.slice(i + 1), ""); } break; }
        case "cat": case "head": case "tail": {
          const nIdx = args.indexOf("-n"); const count = nIdx >= 0 ? +args[nIdx + 1] || 10 : 10;
          const target = pos.filter((p, i) => !(nIdx >= 0 && args[nIdx + 1] === p))[0];
          const n = need(target, name); if (!n) break;
          if (n.type === "folder") { err(`${name}: ${target}: es una carpeta`); break; }
          if (!vfs.isText(n) && n.type !== "file") { err(`${name}: ${n.name}: archivo binario (${n.type}); usa 'open'`); break; }
          const txt = await vfs.readText(n.id); const ls = txt.split("\n");
          push(name === "cat" ? txt.slice(0, 200000) : (name === "head" ? ls.slice(0, count) : ls.slice(-count)).join("\n"));
          break;
        }
        case "wc": { const n = need(pos[0], "wc"); if (!n || n.type === "folder") break; const t = await vfs.readText(n.id); push(`${t.split("\n").length} líneas  ${t.trim() ? t.trim().split(/\s+/).length : 0} palabras  ${n.size} bytes  ${n.name}`); break; }
        case "echo": {
          const text = args.join(" ");
          if (!redirect) { push(text); break; }
          let f = at(redirect.target);
          if (f && f.type === "folder") { err(`echo: ${redirect.target}: es una carpeta`); break; }
          if (!f) { const i = redirect.target.lastIndexOf("/"); const parent = i >= 0 ? at(redirect.target.slice(0, i) || "/") : at("."); if (!parent) { err("echo: ruta no válida"); break; } const id = await vfs.create(parent.id, redirect.target.slice(i + 1), ""); f = vfs.node(id); }
          const prev = redirect.mode === ">>" ? await vfs.readText(f.id) : "";
          await vfs.write(f.id, prev + text + "\n");
          break;
        }
        case "cp": case "mv": {
          if (pos.length < 2) { err(`${name}: uso: ${name} <origen…> <destino>`); break; }
          const destP = pos[pos.length - 1]; const srcs = pos.slice(0, -1).map(p => need(p, name)).filter(Boolean); if (!srcs.length) break;
          const dest = at(destP);
          if (dest && dest.type === "folder") { if (name === "cp") await vfs.copy(srcs.map(s => s.id), dest.id); else vfs.move(srcs.map(s => s.id), dest.id); }
          else if (srcs.length === 1) {
            // destino = nuevo nombre (y quizá otra carpeta)
            const i = destP.lastIndexOf("/"); const parent = i >= 0 ? at(destP.slice(0, i) || "/") : at(".");
            if (!parent || parent.type !== "folder") { err(`${name}: ${destP}: carpeta de destino no existe`); break; }
            if (name === "mv") { vfs.move([srcs[0].id], parent.id); vfs.rename(srcs[0].id, destP.slice(i + 1)); }
            else { await vfs.copy([srcs[0].id], parent.id); const copyN = (vfs.node(parent.id).children || []).slice(-1)[0]; if (copyN) vfs.rename(copyN.id, destP.slice(i + 1)); }
          } else err(`${name}: ${destP}: no es una carpeta`);
          break;
        }
        case "rm": case "del": {
          if (!pos.length) { err("rm: falta la ruta"); break; }
          for (const p of pos) { const n = need(p, "rm"); if (!n) continue; if (n.id === ROOT || n.id === vfs.DESKTOP) { err(`rm: no se puede borrar ${n.name}`); continue; } if (n.type === "folder" && !flags.some(f => /r/.test(f))) { err(`rm: ${p}: es una carpeta (usa rm -r)`); continue; } vfs.trash([n.id]); }
          if (pos.length) push("(movido a la papelera)", "dim");
          break;
        }
        case "find": { const q = pos.join(" ").toLowerCase(); if (!q) { err("find: falta el texto"); break; } const base = at("."); let k = 0; vfs.walk(n => { if (n.id !== base.id && n.name.toLowerCase().includes(q) && k++ < 200) push(vfs.pathString(n.id) + (n.type === "folder" ? "/" : "")); }, base); if (!k) push("(sin resultados)", "dim"); break; }
        case "grep": {
          if (pos.length < 2) { err("grep: uso: grep <texto> <archivo>"); break; }
          const n = need(pos[1], "grep"); if (!n || n.type === "folder") break;
          const q = pos[0].toLowerCase(); const ls = (await vfs.readText(n.id)).split("\n"); let k = 0;
          ls.forEach((l, i) => { if (l.toLowerCase().includes(q)) { push(`${String(i + 1).padStart(4)}: ${l}`); k++; } }); if (!k) push("(sin coincidencias)", "dim");
          break;
        }
        case "du": { const n = need(pos[0], "du"); if (n) push(`${fmtSize(n.type === "folder" ? vfs.folderSize(n) : n.size)}\t${n.id === ROOT ? "/" : vfs.pathString(n.id)}`); break; }
        case "open": case "start": {
          if (!pos[0]) { err("open: falta el archivo o la app"); break; }
          if (APP_BY_ID[pos[0]]) { openApp(pos[0]); push(`Abriendo ${APP_BY_ID[pos[0]].name}…`, "dim"); break; }
          const n = need(pos[0], "open"); if (n) { openItem(n); push(`Abriendo ${n.name}…`, "dim"); }
          break;
        }
        case "download": { const n = need(pos[0], "download"); if (n) { await vfs.download(n.id); push(`Descargando ${n.name}${n.type === "folder" ? ".zip" : ""}…`, "dim"); } break; }
        case "neofetch": {
          let files = 0, folders = 0; vfs.walk(n => n.children ? folders++ : files++);
          const est = await navigator.storage?.estimate?.().catch(() => null);
          push([
            "   ▄▄▄▄▄▄▄     " + user + "@sotos",
            "  █ ▄▄▄▄▄ █    ----------------",
            "  █ █   █ █    SO:        Sotos OS 2.0 (web)",
            "  █ █▄▄▄█ █    Shell:     sotos-sh",
            "  █▄▄▄▄▄▄▄█    Navegador: " + (navigator.userAgentData?.brands?.find(b => !/Not/.test(b.brand))?.brand || "web"),
            "     ▄█▄       Núcleos:   " + (navigator.hardwareConcurrency || "?"),
            "               Archivos:  " + files + " en " + folders + " carpetas",
            "               Disco:     " + fmtSize(vfs.usedBytes()) + (est?.quota ? " / " + fmtSize(est.quota) : ""),
            "               Autor:     Sebastian Sotomontes © 2026",
          ].join("\n"));
          break;
        }
        default: err(`${name}: comando no encontrado. Escribe 'help'.`);
      }
    } catch (e) { err(`${name}: ${e.message}`); }
    cwdRef.current = newCwd; setCwd(newCwd);
    setLines(l => [...l, ...out].slice(-1000));
  };

  const complete = () => {
    const m = /^(.*?)(\S*)$/.exec(cmd); const before = m[1], word = m[2];
    if (!before.trim()) { const c = ["ls", "cd", "pwd", "tree", "mkdir", "touch", "cat", "head", "tail", "echo", "cp", "mv", "rm", "find", "grep", "du", "wc", "open", "download", "apps", "history", "clear", "help", "neofetch", "date", "whoami"].filter(x => x.startsWith(word)); if (c.length === 1) setCmd(c[0] + " "); else if (c.length) setLines(l => [...l, { t: "out", v: c.join("  ") }]); return; }
    const i = word.lastIndexOf("/"); const dirP = i >= 0 ? word.slice(0, i + 1) : ""; const frag = word.slice(i + 1).replace(/^"/, "");
    const dir = vfs.resolve(dirP || ".", cwd); if (!dir || !dir.children) return;
    const c = dir.children.filter(x => x.name.toLowerCase().startsWith(frag.toLowerCase()));
    const q = (s) => /\s/.test(s) ? `"${s}"` : s;
    if (c.length === 1) setCmd(before + q(dirP + c[0].name) + (c[0].type === "folder" ? "/" : " "));
    else if (c.length) { setLines(l => [...l, { t: "out", v: c.map(x => x.name + (x.type === "folder" ? "/" : "")).join("  ") }]); const common = c.reduce((p, x) => { let k = 0; while (k < p.length && p[k].toLowerCase() === x.name[k]?.toLowerCase()) k++; return p.slice(0, k); }, c[0].name); if (common.length > frag.length) setCmd(before + dirP + common); }
  };
  const onKey = (e) => {
    if (e.key === "Enter") { const c = cmd; setCmd(""); queue.current = queue.current.then(() => run(c)).catch(() => {}); }
    else if (e.key === "Tab") { e.preventDefault(); complete(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (!hist.length) return; hi.current = hi.current < 0 ? hist.length - 1 : Math.max(0, hi.current - 1); setCmd(hist[hi.current]); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (hi.current < 0) return; hi.current++; if (hi.current >= hist.length) { hi.current = -1; setCmd(""); } else setCmd(hist[hi.current]); }
    else if (e.ctrlKey && e.key.toLowerCase() === "l") { e.preventDefault(); setLines([]); }
    else if (e.ctrlKey && e.key.toLowerCase() === "c" && !window.getSelection().toString()) { e.preventDefault(); setLines(l => [...l, { t: "in", v: cmd + "^C", cwd }]); setCmd(""); }
  };

  return (
    <div className="app terminal" onMouseUp={() => { if (!window.getSelection().toString()) input.current?.focus(); }}>
      <div className="scroll" ref={scroller}>
        {lines.map((l, i) => (
          <div key={i} className={"t-line " + l.t}>
            {l.t === "in" ? <>{prompt(l.cwd)}{l.v}</> : l.v.includes("\u0001")
              ? l.v.split("    ").map((w, j) => <span key={j} className={w.startsWith("\u0001") ? "t-dir" : ""}>{w.replace("\u0001", "")}{"    "}</span>) : l.v}
          </div>
        ))}
        <div className="t-line in" style={{ display: "flex" }}>
          <span style={{ whiteSpace: "pre" }}>{prompt(cwd)}</span>
          <input ref={input} value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={onKey} autoFocus spellCheck={false} />
        </div>
      </div>
    </div>
  );
}

export { TerminalApp };
