<p align="center"><img src="docs/banner.png" alt="Sotos Web" width="100%"></p>

# Sotos — your computer in the cloud

A complete desktop that runs in the browser: windows, dock, real cloud files, Word/Excel/PowerPoint editing on genuine Office files, a web browser with an isolated proxy, a terminal, link sharing, and its own visual identity.

© 2026 Sebastian Sotomontes. All rights reserved. **Private** source repository; the public showcase lives at [`Softsoto/SotosWeb`](https://github.com/Softsoto/SotosWeb) and the live demo at <https://softsoto.github.io/SotosWeb-demo/>.

| | |
|---|---|
| Version | 2.0 |
| Desktop | React 18 + Vite 6 (`web/`) |
| Server | Node.js ≥ 22, zero npm dependencies (`server/`) |
| Data | SQLite built into Node (`node:sqlite`) + one file per blob; IndexedDB in the browser |
| Deployment | This computer · Linux server with systemd and Caddy · Docker (Caddy + Sotos + document server) |
| UI language | Spanish |

<p align="center"><img src="docs/capturas/escritorio.jpg" alt="Desktop" width="100%"></p>

---

## Contents

1. [Development setup](#1-development-setup)
2. [Installer](#2-installer)
3. [Environment variables](#3-environment-variables)
4. [Repository layout](#4-repository-layout)
5. [Architecture](#5-architecture)
6. [File system and sync](#6-file-system-and-sync)
7. [API](#7-api)
8. [Browser proxy](#8-browser-proxy)
9. [Office formats and formulas](#9-office-formats-and-formulas)
10. [Document server (ONLYOFFICE)](#10-document-server-onlyoffice)
11. [Visual identity and wallpapers](#11-visual-identity-and-wallpapers)
12. [Global context menu](#12-global-context-menu)
13. [Security](#13-security)
14. [Public demo](#14-public-demo)
15. [Tests and screenshots](#15-tests-and-screenshots)
16. [Screenshots](#16-screenshots)
17. [Roadmap](#17-roadmap)

---

## 1. Development setup

```powershell
# terminal 1 — server (API + proxy) on :8787, bound to this machine only
cd server
npm run dev

# terminal 2 — desktop with hot reload on :5173 (proxies /api to :8787)
cd web
npm install
npm run dev
```

Open <http://localhost:5173>. Without the server, the desktop runs in guest mode (everything in IndexedDB).

Production build: `cd web && npm run build` → `web/dist`, served by the server with `NODE_ENV=production`.

## 2. Installer

| Script | System | Modes |
|---|---|---|
| `instalar.ps1` | Windows (PowerShell 5.1+) | `equipo` (this computer), `docker`, `-Actualizar` (update), `-Desinstalar` (uninstall) |
| `instalar.sh` | Linux and macOS | `equipo`, `servidor` (server), `docker`, `actualizar`, `desinstalar` |

```powershell
powershell -ExecutionPolicy Bypass -File instalar.ps1                       # wizard
powershell -ExecutionPolicy Bypass -File instalar.ps1 -Modo equipo -Inicio -Firewall
```
```bash
./instalar.sh                              # wizard
./instalar.sh servidor os.example.com      # VPS with automatic HTTPS
./instalar.sh docker                       # containers (by IP or domain)
```

The installer messages are in Spanish, like the rest of the product.

**This computer (`equipo`)** — checks for Node ≥ 22 (offers to install it with winget on Windows, NodeSource on Debian/Ubuntu), builds `web/`, writes `server/sotos.env` (port 8787, proxy on 8788, data in `%LOCALAPPDATA%\SotosOS` or `~/.local/share/sotos-os`, `SOTOS_SHOW_LAN=1`), creates `iniciar-sotos.cmd|sh`, optionally starts with the user session (Startup shortcut on Windows, `systemd --user` service on Linux) and opens the firewall for private networks only. It finishes by printing `http://localhost:8787` and the LAN addresses.

**Server (`servidor`)** — copies to `/opt/sotos-os`, builds, creates the `sotos` system user, `/etc/sotos-os.env` (mode 600) and the `sotos-os.service` unit with `ProtectSystem=strict`, `NoNewPrivileges` and `ReadWritePaths=/var/lib/sotos-os`. With a domain it installs Caddy and configures the desktop and `px.` hosts; without one it serves by IP with the proxy on `PORT+1` and prints the public IP.

**Docker** — generates `.env` with a 32-byte secret. With a domain it uses `docker-compose.yml` (Caddy with HTTPS + Sotos + ONLYOFFICE on three subdomains); without one it writes `COMPOSE_FILE=docker-compose.ip.yml` (ports 8787, 8788 and 8080).

## 3. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | — | `production` serves `web/dist` and routes the proxy by host |
| `PORT` | `8787` | Desktop + API |
| `HOST` | `127.0.0.1` (dev) / `0.0.0.0` (prod) | Listening interface |
| `PX_PORT` | — | Browser proxy on its own port (IP mode) |
| `PX_HOST` | — | Host served only as the proxy (domain mode) |
| `PX_PUBLIC` | — | Public proxy origin injected into the page |
| `TRUST_PROXY` | — | Trust `X-Forwarded-*` (behind Caddy) |
| `SOTOS_DATA` | `server/data` | Database, blobs and secrets |
| `SOTOS_WEB` | `web/dist` | Built desktop |
| `SOTOS_REGISTRATION` | `open` | `closed` disables new sign-ups |
| `SOTOS_QUOTA_MB` | `2048` | Per-account quota |
| `SOTOS_MAX_FILE_MB` | `512` | Maximum file size |
| `SOTOS_SHOW_LAN` | — | `1` exposes LAN addresses in `/api/info` and in Settings |
| `OO_URL` | — | Public Document Server URL (enables the integration) |
| `OO_INTERNAL` | `OO_URL` | URL the server uses to download saved versions |
| `SOTOS_INTERNAL` | `http://host.docker.internal:8787` | URL the Document Server uses to reach Sotos |
| `SOTOS_OO_JWT` | `data/secrets.json` | JWT secret shared with ONLYOFFICE |

## 4. Repository layout

```
instalar.ps1 · instalar.sh          installers (3 modes + update/uninstall)
Dockerfile · docker-compose*.yml    image and deployments (domain+HTTPS / IP)
Caddyfile · .env.example            reverse proxy with automatic certificates
scripts/
  capturas.mjs                      automated screenshots (headless Edge + CDP)
  onlyoffice-dev.ps1                local Document Server for development
server/
  index.mjs                         routing, static files, injected proxy origin
  http.mjs                          HTTP helpers, rate limiting, HS256 JWT
  db.mjs                            SQLite, data paths, secrets
  auth.mjs                          accounts, scrypt, sessions
  fs.mjs                            per-user state, operations, blobs, SSE
  shares.mjs                        public links and "shared with me"
  oo.mjs                            ONLYOFFICE Docs integration
  px.mjs                            browser proxy (rewriting + injected client)
web/src/
  main.jsx                          bootstrap, public route /#/s/<token>
  os/shell.jsx                      OS: boot, sign-in, menu bar, dock, desktop, windows
  os/tree-ops.js                    pure tree operations (shared with the server)
  os/vfs.js                         file system, IndexedDB, queue and sync
  os/api.js · config.js             API client, proxy origin, demo flag
  os/files-ui.jsx                   thumbnails, drag and drop, menus, properties, sharing
  os/apps1.jsx                      Files, Notes, Sheets, Gallery, autosave
  os/apps2.jsx                      Music, Video, PDF
  os/apps3.jsx                      Mail, Messages, Browser
  os/apps4.jsx                      Settings (account, wallpapers, network), Store
  os/apps5.jsx                      Documents, Slides, Launchpad, Trash
  os/terminal.jsx                   sotos-sh
  os/office.js                      .docx/.xlsx/.csv/.pptx/.pdf, HTML sanitizing, printing
  os/formula.js                     formula engine
  os/onlyoffice.jsx                 ONLYOFFICE editor with built-in editors as fallback
  os/context-menu.jsx               global context menu
  os/wallpapers.js                  procedurally drawn wallpapers
  os/seed.js                        real sample content created on first boot
  os/auth-ui.jsx · share-page.jsx   sign-in and public share page
```

Source comments and UI strings are in Spanish.

## 5. Architecture

```mermaid
flowchart LR
  subgraph B["Browser"]
    UI["shell.jsx + apps"] <--> V["vfs.js<br/>IndexedDB · queue"]
    UI <-. postMessage .-> F["proxy iframe"]
  end
  subgraph S["server/index.mjs"]
    A["auth.mjs"] & FS["fs.mjs"] & SH["shares.mjs"] & OO["oo.mjs"]
    PX["px.mjs"]
    DB[("sotos.db")] ; BL[("blobs/&lt;uid&gt;/&lt;id&gt;")]
  end
  V <-->|"/api/fs/ops · /api/fs/blob"| FS
  FS -->|"SSE /api/fs/events"| V
  F <--> PX --> NET(("Internet"))
  OO <-.->|JWT| DS["ONLYOFFICE Docs"]
  FS --- DB & BL
```

In production one host (or port) is proxy-only, so the desktop session cookies never reach proxied pages.

## 6. File system and sync

- State = `{ root, trash }`. Nodes `{ id, name, type, size, ctime, mtime, children?, url?, meta? }`; `root` and `desktop` are fixed.
- `tree-ops.js#applyOp` implements `replace`, `create`, `write`, `rename`, `move`, `copy`, `trash`, `restore` and `destroy` as pure functions (idempotent where it applies) and returns side effects (`copyBlobs`, `deleteBlobs`) that only the server executes.
- The client decides ids (`Date.now().toString(36)` + random), unique names and timestamps, so every operation is deterministic.
- Queue: `[{k:"blob",id} | {k:"op",op}]`, persisted in IndexedDB `kv/queue`; consecutive operations are batched (up to 200 per request). Errors: 401 → `auth`, 507/413 → `full`, network → retry every 5 s.
- On an `fs` SSE event from another origin: `GET /api/fs/state`, then the pending queue is re-applied on top.
- New account: sample content is generated, its blobs are queued, followed by a `replace` operation.
- IndexedDB databases: `sotos-os` (guest) and `sotos-os-<uid>` (one per account). Settings → Account → Import copies guest files into the account.

## 7. API

Every write requires the `X-Sotos: 1` header.

| Method and path | Description |
|---|---|
| `GET /api/health` · `GET /api/info` | Health · LAN addresses (when `SOTOS_SHOW_LAN=1`) |
| `GET /api/auth/me` | Session user and sign-up policy |
| `POST /api/auth/register \| login \| logout \| password` | Accounts |
| `GET /api/fs/state` | `{ version, state, fresh, used, quota }` |
| `POST /api/fs/ops` | `{ ops, origin }` → `{ version }` |
| `GET\|PUT /api/fs/blob/:id` | Content (PUT enforces quota and size limit, atomic write) |
| `GET /api/fs/events` | SSE: `hello`, `fs` |
| `GET\|POST /api/shares` · `DELETE /api/shares/:token` | Own links |
| `GET /api/shares/with-me` | Shared with me |
| `GET /api/s/:token[/blob/:id[?dl]]` | Public: metadata and content inside the shared item |
| `GET /api/oo/status` · `POST /api/oo/config` | ONLYOFFICE integration |
| `GET /api/oo/file?t=` · `POST /api/oo/callback?t=` | Used by the Document Server, JWT-signed |

## 8. Browser proxy

`/px/<absolute url>`:

- Request: forwards method, body and useful headers; cookies come from an in-memory jar keyed by `sotos_px_sid`; `Referer`/`Origin` of the real site.
- Response: strips `X-Frame-Options`, CSP, COOP/COEP/CORP, HSTS, `Set-Cookie` (moved to the jar) and similar headers; rewrites redirects; adds `Access-Control-Allow-Origin: *`.
- HTML: rewrites `href|src|action|poster|data-src|srcset`, `style` and `<style>` `url()`/`@import`, `meta refresh`; removes `<base>`, `integrity` and `nonce`; injects the client.
- Injected client: patches `fetch`, `XMLHttpRequest`, `window.open`, `history.pushState/replaceState`, `sendBeacon` and `Worker`, observes the DOM, reports `{type:"sotos-px", url, title}` and forwards right-clicks as `{type:"sotos-ctx", …}`; it runs `{type:"sotos-cmd"}` (insert text, delete, select all) only when it comes from `window.parent`.
- Orphan root-relative requests (`/static/x.js`) → 307 to the last origin (from `Referer` or the `sotos_px_origin` cookie).
- SSRF: resolves DNS and rejects loopback, private, CGNAT, link-local and multicast addresses.
- Proxy cookies: `SameSite=None; Secure` over HTTPS or `localhost`; `SameSite=Lax` over plain HTTP by IP (same site as the desktop).

## 9. Office formats and formulas

| Library | Use |
|---|---|
| mammoth | `.docx` → HTML |
| docx | HTML → `.docx` (headings, numbered lists with their own definition, tables, data-URL images, text formatting) |
| ExcelJS | `.xlsx` ↔ model `{ sheets:[{ name, cells, fmt, widths }] }`, formulas with cached results |
| PptxGenJS + JSZip | `.pptx`; the Sotos model is stored in `sotos/slides.json` and `Extension="json"` is declared in `[Content_Types].xml` |
| in-house | CSV (`,` or `;` separator, quoting), text PDF (Helvetica, WinAnsi, xref) |

`formula.js`: tokenizer → precedence parser → evaluator with per-cell memoization and cycle detection. `A1`, `$B$2`, `AA10` references and ranges; function names in English and Spanish. No `eval` or `Function`.

## 10. Document server (ONLYOFFICE)

`withOnlyOffice(App)` wraps Documents, Sheets and Slides: with an account and `OO_URL` set it uses the ONLYOFFICE editor; otherwise the built-in one.

1. `POST /api/oo/config` → signed config (`document.key = id-mtime-size`, download and callback URLs with 12 h / 48 h JWTs).
2. The browser loads `OO_URL/web-apps/apps/api/documents/api.js` and creates the editor in its own iframe.
3. Callback with status 2 or 6: the URL JWT and the body or header JWT are verified, the download host must be the Document Server, the file is written atomically and a `write` operation is applied (other devices receive it through SSE).

Local development: `scripts/onlyoffice-dev.ps1` (requires Docker), then restart the server's `npm run dev`. **Status: implemented, end-to-end test with Docker pending.**

## 11. Visual identity and wallpapers

- Paper-and-ink tokens (`--surface`, `--ink-line`, `--print-shadow`, …) for light and dark themes; no `backdrop-filter`.
- Windows with custom controls, a top stripe in the app's color and an offset "printed" shadow.
- Accent palette: clay `#c4532f`, moss `#4f7a3a`, sky `#2f5d8a`, mustard `#c9902a`, plum `#7a3e6b`, lagoon `#1f7a78`.
- `wallpapers.js`: 8 deterministic scenes (seeded by id) inspired by Colombian landscapes, with halftone skies, flat layers with a registration offset, scene elements (frailejón, wax palm, cactus, hilltop chapel, city) and paper grain; rendered at screen resolution and cached as blob URLs.

## 12. Global context menu

`context-menu.jsx` listens to `contextmenu` on `document` after the apps: if none called `preventDefault`, it builds a menu for the target (editable field, selection, link, image, title bar or window). Menu buttons do not steal focus (`mousedown.preventDefault`), so text selections survive. `showMenu(x, y, items)` is also used by the Browser for proxied pages. `Shift + right-click` keeps the native menu.

## 13. Security

- scrypt (N = 2¹⁵, r = 8, p = 1) with a 16-byte salt; 30-day sessions, 32-byte token, only its SHA-256 is stored.
- Rate limits: sign-up 5/h per IP; sign-in 20/15 min per IP and 8/15 min per email; equal work whether or not the account exists.
- `Secure` cookie only over HTTPS (detected from the socket, or from `X-Forwarded-Proto` with `TRUST_PROXY`).
- Blob ids validated with `^[a-z0-9]{6,40}$` before touching disk; writes go to `.part` + `rename`.
- Shared content: `nosniff`, CSP `sandbox` (except PDF), forced download for unsafe types.
- `sanitizeHtml` with an allow-list of tags and attributes for documents, pasting and printing (iframe without `allow-scripts`).
- Desktop headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## 14. Public demo

Static build, guest mode only, no proxy:

```bash
cd web
VITE_DEMO=1 npm run build:demo     # → ../demo-dist
```

`demo-dist/` is its own git repository (ignored here) published as [`Softsoto/SotosWeb-demo`](https://github.com/Softsoto/SotosWeb-demo) with GitHub Pages: <https://softsoto.github.io/SotosWeb-demo/>. In this mode `config.js#DEMO` skips sign-in, never calls the API, hides the proxy toggle and shows a welcome dialog and a DEMO badge. To update it: rebuild, then commit and push inside `demo-dist/`.

## 15. Tests and screenshots

- API smoke test (sign-up, session, operations, blobs, public links, anti-CSRF, permanent deletion): 20/20.
- Formats: generated `.docx`, `.xlsx`, `.pptx` and `.pdf` files were validated by opening them with independent libraries in Node.
- Formulas: precedence, ranges, multi-letter columns, cycles, division by zero and unknown names.
- Sync: new account → local cache wiped → everything comes back from the server, content included.
- Public demo: tested live on GitHub Pages (apps open, `.docx`/`.xlsx` load through lazy chunks, no console or network errors).

Automated screenshots (server and `web` running):

```powershell
node scripts/capturas.mjs docs/capturas
```

Launches headless Edge at 1600×1000 (device scale 1.5), uses a local screenshot account and drives the system through `window.__sotos` (development builds only) plus real mouse and keyboard events over CDP.

## 16. Screenshots

| | |
|---|---|
| ![Sign-in](docs/capturas/acceso.jpg) | ![Files](docs/capturas/archivos.jpg) |
| ![Word](docs/capturas/word.jpg) | ![Excel](docs/capturas/excel.jpg) |
| ![Slides](docs/capturas/presentaciones.jpg) | ![Terminal](docs/capturas/terminal.jpg) |
| ![Browser](docs/capturas/navegador.jpg) | ![Context menu](docs/capturas/menu-contextual.jpg) |
| ![Wallpapers](docs/capturas/fondos.jpg) | ![Sharing](docs/capturas/compartir.jpg) |
| ![Public link](docs/capturas/enlace-publico.jpg) | ![Dark theme](docs/capturas/tema-oscuro.jpg) |

## 17. Roadmap

- End-to-end ONLYOFFICE test with Docker and a pinned `OO_VERSION`.
- Syntax check of `instalar.sh` on real Linux.
- Window controls: user's choice between Sotos, Mac and Windows styles.
- Touch screens and a phone layout.
- New apps (calculator, calendar, tasks, camera, maps, code editor), real-time chat between accounts, working Store.
- File version history, admin panel, automatic server backups, two-factor sign-in.
- Performance (lazy-loaded apps, icon font subset), strict CSP, per-account proxy limits.
