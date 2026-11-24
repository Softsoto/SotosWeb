// Sotos — arma los paquetes de instalación en dist-paquetes/
//   node scripts/empaquetar.mjs            (compila el escritorio y empaqueta)
//   node scripts/empaquetar.mjs --sin-compilar
// Genera:
//   sotos-<v>.zip / .tar.gz      la aplicación lista (escritorio compilado, sin datos ni configuración)
//   Sotos-Setup-<v>.exe          instalador de Windows (IExpress, incluido en Windows)
//   instalar-sotos.ps1 / .sh     instaladores de un solo archivo (descargan la última versión)
//   SHA256SUMS.txt               huellas para comprobar las descargas
// © 2026 Sebastian Sotomontes
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V = fs.readFileSync(path.join(ROOT, "VERSION"), "utf8").trim();
const OUT = path.join(ROOT, "dist-paquetes"), NAME = `sotos-${V}`, STAGE = path.join(OUT, "stage", NAME);
const log = (m) => console.log("  " + m);
// se vacía (no se borra la carpeta: en Windows falla si alguna ventana la tiene abierta)
fs.mkdirSync(OUT, { recursive: true }); for (const e of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, e), { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

if (!process.argv.includes("--sin-compilar")) { log("Compilando el escritorio…"); execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "--silent"], { cwd: path.join(ROOT, "web"), stdio: "inherit", shell: process.platform === "win32" }); }
if (!fs.existsSync(path.join(ROOT, "web/dist/index.html"))) throw new Error("Falta web/dist: compila el escritorio");

// copia con filtro (nunca datos, configuración, registros ni dependencias de desarrollo)
const SKIP = /(^|[\\/])(data|node_modules|\.env|sotos\.env|.*\.log|\.DS_Store)$/;
function copy(rel, dest = rel) {
  const src = path.join(ROOT, rel), dst = path.join(STAGE, dest); if (!fs.existsSync(src) || SKIP.test(rel)) return;
  if (fs.statSync(src).isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src)) copy(path.join(rel, e), path.join(dest, e)); }
  else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
}
log("Reuniendo los archivos…");
for (const p of ["server", "web/dist", "web/src/os/tree-ops.js", "VERSION", "README.md", "CHANGELOG.md", "LICENSE", ".env.example", "instalar-sotos.ps1", "instalar-sotos.sh",
  "sdk", "scripts/restablecer-clave.mjs", "scripts/restaurar-copia.mjs", "scripts/whatsapp-dev.ps1", "scripts/jellyfin-dev.ps1", "scripts/immich-dev.ps1", "scripts/onlyoffice-dev.ps1", "scripts/drawio-dev.ps1", "scripts/neko-dev.ps1",
  "services/whatsapp/index.mjs", "services/whatsapp/package.json", "services/whatsapp/package-lock.json"]) copy(p);
// capturas que usa la presentación del asistente
const TOUR = ["escritorio", "archivos", "word", "correo-html", "mundos-chat", "whatsapp", "video-mkv", "paint", "tema-grafito-dark", "notificaciones"];
for (const t of TOUR) copy(`docs/capturas/${t}.jpg`);
copy("paquete/Dockerfile", "Dockerfile"); copy("paquete/docker-compose.nas.yml", "docker-compose.nas.yml");
// ícono de Windows (ICO con la imagen PNG dentro)
const png = fs.readFileSync(path.join(ROOT, "web/public/iconos/sotos-192.png"));
const ico = Buffer.alloc(22); ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 192; ico[7] = 192; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(STAGE, "sotos.ico"), Buffer.concat([ico, png]));
fs.writeFileSync(path.join(STAGE, "LEEME.txt"), [
  `Sotos ${V} — tu ordenador en la nube · © 2026 Sebastian Sotomontes · MIT`, "",
  "Windows:  ejecuta Sotos-Setup.exe, o:  powershell -ExecutionPolicy Bypass -File instalar-sotos.ps1",
  "Linux / hosting:  bash instalar-sotos.sh            (con --servicio queda como servicio de systemd)",
  "NAS con Docker (Synology, QNAP, TrueNAS, Unraid):  docker compose -f docker-compose.nas.yml up -d --build",
  "", "Después abre http://localhost:8787 (o la IP del equipo) y termina la configuración en el asistente.",
  "Requisitos: Node.js 22 o superior (salvo con Docker).", ""].join("\r\n"));

// archivos
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "pipe" });
const stageDir = path.dirname(STAGE);
log("Comprimiendo…");
sh("tar", ["-czf", path.join(OUT, `${NAME}.tar.gz`), NAME], stageDir);
if (process.platform === "win32") sh("tar", ["-a", "-cf", path.join(OUT, `${NAME}.zip`), NAME], stageDir); else sh("zip", ["-qr", path.join(OUT, `${NAME}.zip`), NAME], stageDir);
fs.copyFileSync(path.join(ROOT, "instalar-sotos.ps1"), path.join(OUT, "instalar-sotos.ps1"));
fs.copyFileSync(path.join(ROOT, "instalar-sotos.sh"), path.join(OUT, "instalar-sotos.sh"));

// instalador .exe para Windows con IExpress (viene con Windows): lleva el .zip y el instalador
if (process.platform === "win32") {
  log("Armando Sotos-Setup.exe…");
  const ex = path.join(OUT, "stage", "exe"); fs.mkdirSync(ex, { recursive: true });
  fs.copyFileSync(path.join(OUT, `${NAME}.zip`), path.join(ex, `${NAME}.zip`));
  fs.copyFileSync(path.join(ROOT, "instalar-sotos.ps1"), path.join(ex, "instalar-sotos.ps1"));
  fs.writeFileSync(path.join(ex, "setup.cmd"), `@echo off\r\ntitle Instalar Sotos ${V}\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-sotos.ps1" -Paquete "%~dp0${NAME}.zip"\r\n`);
  const target = path.join(OUT, `Sotos-Setup-${V}.exe`);
  const sed = `[Version]\r\nClass=IEXPRESS\r\nSEDVersion=3\r\n[Options]\r\nPackagePurpose=InstallApp\r\nShowInstallProgramWindow=1\r\nHideExtractAnimation=1\r\nUseLongFileName=1\r\nInsideCompressed=0\r\nCAB_FixedSize=0\r\nCAB_ResvCodeSigning=0\r\nRebootMode=N\r\nInstallPrompt=%InstallPrompt%\r\nDisplayLicense=%DisplayLicense%\r\nFinishMessage=%FinishMessage%\r\nTargetName=%TargetName%\r\nFriendlyName=%FriendlyName%\r\nAppLaunched=%AppLaunched%\r\nPostInstallCmd=%PostInstallCmd%\r\nAdminQuietInstCmd=%AdminQuietInstCmd%\r\nUserQuietInstCmd=%UserQuietInstCmd%\r\nSourceFiles=SourceFiles\r\n[Strings]\r\nInstallPrompt=\r\nDisplayLicense=\r\nFinishMessage=\r\nTargetName=${target}\r\nFriendlyName=Sotos ${V}\r\nAppLaunched=cmd /c setup.cmd\r\nPostInstallCmd=<None>\r\nAdminQuietInstCmd=\r\nUserQuietInstCmd=\r\nFILE0="setup.cmd"\r\nFILE1="instalar-sotos.ps1"\r\nFILE2="${NAME}.zip"\r\n[SourceFiles]\r\nSourceFiles0=${ex}\\\r\n[SourceFiles0]\r\n%FILE0%=\r\n%FILE1%=\r\n%FILE2%=\r\n`;
  const sedFile = path.join(ex, "sotos.sed"); fs.writeFileSync(sedFile, sed);
  try { execFileSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "iexpress.exe"), ["/N", "/Q", sedFile], { stdio: "pipe", timeout: 600_000 }); } catch (e) { console.error("  IExpress falló:", e.message); }
  if (!fs.existsSync(target)) console.error("  No se generó el .exe");
}
fs.rmSync(path.join(OUT, "stage"), { recursive: true, force: true });

// huellas
const sums = fs.readdirSync(OUT).filter(f => !f.endsWith(".txt")).map(f => `${crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, f))).digest("hex")}  ${f}`);
fs.writeFileSync(path.join(OUT, "SHA256SUMS.txt"), sums.join("\n") + "\n");
for (const f of fs.readdirSync(OUT)) log(`${f.padEnd(32)} ${(fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1)} MB`);
console.log(`\n  Paquetes de Sotos ${V} listos en dist-paquetes/`);
