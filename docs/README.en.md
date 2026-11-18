<p align="center"><img src="banner.png" alt="Sotos Web" width="100%"></p>

# Sotos — your computer in the cloud

A complete desktop that runs in the browser: windows, dock, real cloud files, Word/Excel/PowerPoint editing on genuine Office files (built-in editors, or ONLYOFFICE / Euro-Office), real e-mail over IMAP/SMTP with several accounts and aliases, calendar, tasks, file versions, an app store, a web browser with an isolated proxy and a virtual browser, a terminal, link sharing, and its own visual identity.

© 2026 Sebastian Sotomontes. Released under the [MIT License](../LICENSE). This is the English technical guide; the main README (in Spanish) is [here](../README.md).

### A tribute to inevio

Sotos is also a tribute to **inevio**, the web desktop that showed, years ago, that a whole operating system could live in a browser tab. The Grafito skin, the window motion and many of the features added in versions 2.2 and 2.3 (mail, calendar, tasks, inbox, file versions, contact groups, presence, store) pay homage to what inevio made possible. Sotos does not use inevio's code, artwork or assets: everything here is written from scratch. inevio is a trademark of its respective owners; Sotos is not affiliated with it.

| | |
|---|---|
| Version | 3.0 (official release) · see [CHANGELOG](CHANGELOG.en.md) |
| Desktop | React 18 + Vite 6 (`web/`) |
| Server | Node.js ≥ 22, zero npm dependencies (`server/`) |
| Data | SQLite built into Node (`node:sqlite`) + one file per blob; IndexedDB in the browser |
| Deployment | This computer · Linux server with systemd and Caddy · Docker (Caddy + Sotos + document server) |
| UI language | Spanish |

<p align="center"><img src="capturas/escritorio.jpg" alt="Desktop" width="100%"></p>

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
14. [Static demo build](#14-static-demo-build)
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
| `SOTOS_WORLD_QUOTA_MB` | `2048` | Quota of each world's shared folder |
| `SOTOS_REG_LIMIT` | `5` (prod) / `500` (dev) | New accounts per hour and IP |
| `SOTOS_MAX_FILE_MB` | `512` | Maximum file size |
| `SOTOS_SHOW_LAN` | — | `1` exposes LAN addresses in `/api/info` and in Settings |
| `OO_URL` | — | Public Document Server URL (enables the integration) |
| `OO_INTERNAL` | `OO_URL` | URL the server uses to download saved versions |
| `SOTOS_INTERNAL` | `http://host.docker.internal:8787` | URL the Document Server uses to reach Sotos |
| `SOTOS_OO_JWT` | `data/secrets.json` | JWT secret shared with the Document Server |
| `OO_ENGINE` | — | Informational: `onlyoffice` or `eurooffice` (written by `scripts/onlyoffice-dev.ps1`) |
| `NEKO_URL` | — | Public URL of the Neko virtual browser (enables it) |
| `NEKO_CONTAINER` | — | Docker container name, used to open a given address in the virtual browser |
| `SOTOS_NEKO_PASS` | `data/secrets.json` | Neko room password |
| `SOTOS_ADMIN_EMAIL` | — | Account promoted to administrator (otherwise the first account) |
| `SOTOS_MAIL_INSECURE` | — | `1` disables TLS certificate checks for mail (local tests only) |
| `WA_URL` | — | WhatsApp service (`services/whatsapp`, e.g. `http://127.0.0.1:8790`); enables native WhatsApp |
| `WA_SECRET` | `data/secrets.json` | Secret shared with the WhatsApp service |
| `DRAWIO_URL` | — | Self-hosted draw.io (`jgraph/drawio`); otherwise the public embed is used |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Video preparation (MKV, AC3/DTS audio, subtitles) |
| `SOTOS_MEDIA_CACHE_GB` | `30` | Disk space for prepared videos |
| `SOTOS_VAULT_ADMIN` | `0` | `1` lets administrators review users' vaults (key escrow; asked by the installer) |
| `SOTOS_BACKUP_DIR` / `_KEEP` / `_HOUR` | `data/copias` / `7` / `3` | Daily backups (`off` disables) |
| `SOTOS_TRASH_DAYS` | `30` | Trash retention (0 = forever) |
| `SOTOS_ICE` | public STUN | STUN/TURN servers for calls (JSON) |
| `SOTOS_PUSH_CONTACT` | — | VAPID subject (mailto: or https:) |
| `JELLYFIN_URL` / `IMMICH_URL` | — | Enable Cinema and Photos (`scripts/jellyfin-dev.ps1`, `scripts/immich-dev.ps1`) |

## 4. Repository layout

```
instalar.ps1 · instalar.sh          installers (3 modes + update/uninstall)
Dockerfile · docker-compose*.yml    image and deployments (domain+HTTPS / IP)
Caddyfile · .env.example            reverse proxy with automatic certificates
scripts/
  capturas.mjs                      automated screenshots (headless Edge + CDP)
  onlyoffice-dev.ps1                local Document Server (-Motor onlyoffice|eurooffice, -Puerto 8099)
  neko-dev.ps1                      local Neko virtual browser (port 8098)
  whatsapp-dev.ps1                  native WhatsApp service (port 8790)
  drawio-dev.ps1                    self-hosted draw.io (port 8097)
services/whatsapp/                  optional WhatsApp service (Baileys), one session per account
  sync-apps.ps1                     copies the Store apps into web/public/apps
server/
  index.mjs                         routing, static files, injected proxy origin
  http.mjs                          HTTP helpers, rate limiting, HS256 JWT
  db.mjs                            SQLite, data paths, secrets
  auth.mjs                          accounts, scrypt, sessions
  fs.mjs                            per-user state, operations, blobs, SSE
  shares.mjs                        public links and "shared with me"
  social.mjs                        notifications and contacts
  worlds.mjs                        worlds: members, wall, chat, shared folder
  inbox.mjs                         "Send to…": files sent between accounts, accept/decline
  agenda.mjs                        calendars, events with reminders, task lists, comments
  store.mjs                         Store: per-account installs and star reviews
  admin.mjs                         admin panel: stats, registration, quotas, users
  mail.mjs                          IMAP/SMTP client and MIME parser (no dependencies), accounts, aliases
  neko.mjs                          virtual browser session and "open this address"
  wa.mjs                            bridge to the WhatsApp service (events over the main SSE)
  media.mjs                         video preparation with ffmpeg (cached, served with Range), subtitles
  vault.mjs                         secret vault: scrypt password, AES-256-GCM at rest
  oo.mjs                            ONLYOFFICE / Euro-Office integration
  px.mjs                            browser proxy (rewriting + injected client)
web/src/
  main.jsx                          bootstrap, public route /#/s/<token>
  os/shell.jsx                      OS: boot, sign-in, menu bar, dock, desktop, windows
  os/tree-ops.js                    pure tree operations (shared with the server)
  os/vfs.js                         file system, IndexedDB, queue and sync
  os/api.js · config.js             API client, proxy origin, demo flag
  os/files-ui.jsx                   thumbnails, drag and drop, menus, properties, sharing
  os/apps1.jsx                      Files, Notes, Sheets, Gallery, autosave
  os/apps2.jsx                      Music (ID3 covers), Video, PDF
  os/pdf-viewer.jsx                 pdf.js viewer: thumbnails, text layer, search, print
  os/id3.js                         ID3v2.2/2.3/2.4 tags and embedded covers
  os/worlds.jsx                     Worlds: wall, shared folder, live chat, members
  os/contacts.jsx                   Contacts, vCard import/export
  os/notifications.jsx              notification bell and toasts
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
| `GET /api/fs/events` | SSE: `hello`, `fs`, `notif`, `notif-read`, `world`, `world-msg`, `world-fs` |
| `GET\|POST /api/shares` · `DELETE /api/shares/:token` | Own links |
| `GET /api/notifications` · `POST …/read {ids?}` · `POST …/clear` | Notification center (last 200 per account) |
| `GET\|POST /api/contacts` · `PUT\|DELETE /api/contacts/:id` | Address book; entries whose email has an account get `sotos: { id, name }` |
| `GET\|POST /api/worlds` · `GET\|PUT\|DELETE /api/worlds/:id` | Worlds (shared spaces); only the owner edits or deletes |
| `POST /api/worlds/:id/members {email}` · `DELETE …/members/:uid` | Invite (account required) · remove or leave |
| `GET\|POST /api/worlds/:id/posts` · `DELETE …/posts/:pid` · `POST …/posts/:pid/comments` | Wall |
| `GET\|POST /api/worlds/:id/messages` · `POST …/read` | Chat (`?before=` paging) and unread marker |
| `GET /api/worlds/:id/fs/state` · `POST …/fs/ops` · `GET\|PUT …/fs/blob/:id` | Shared folder: same pure operations as personal files, own quota |
| `GET /api/shares/with-me` | Shared with me |
| `GET /api/s/:token[/blob/:id[?dl]]` | Public: metadata and content inside the shared item |
| `GET /api/inbox` · `POST /api/inbox/send` · `POST …/:id/accept\|refuse` | Send files to another account |
| `GET\|POST /api/calendar…` · `GET\|POST /api/tasks…` | Calendars, events, task lists, tasks and comments |
| `GET /api/fs/versions/:id` · `POST …/:id/:at/restore` | File version history |
| `GET /api/store` · `POST /api/store/:app/install\|uninstall` · `GET\|POST …/reviews` | Store |
| `GET\|PUT /api/admin/…` | Admin panel (administrators only) |
| `GET /api/mail/accounts` · `PUT\|DELETE /api/mail/account[?acc=]` · `PUT /api/mail/aliases?acc=` | Mail accounts and aliases |
| `GET /api/mail/boxes\|messages[/:uid[/attachment]]?acc=` · `POST …/flags\|move` · `DELETE …/:uid` · `POST /api/mail/send` | Mailboxes, messages, sending |
| `GET /api/neko` · `POST /api/neko/session\|open` | Virtual browser |
| `GET /api/oo/status` · `POST /api/oo/config` | Document Server integration |
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

Local development: `scripts/onlyoffice-dev.ps1 -Motor onlyoffice` or `-Motor eurooffice` (requires Docker; container `sotos-docs` on port 8099), then restart the server. Both engines share the same API and JWT. **Tested end to end** with `onlyoffice/documentserver:9.1.0` and `ghcr.io/euro-office/documentserver:v9.3.1`: the editor loads inside the Sotos window, typed text comes back inside the saved `.docx`, and the previous content is kept in the version history.

### Mail

`mail.mjs` is a small IMAP and SMTP client written for Sotos: literal-aware response parser, modified UTF-7 mailbox names, MIME parser (multipart, base64, quoted-printable, RFC 2047, charsets, `cid:` images inlined), SMTP over implicit TLS or STARTTLS with AUTH PLAIN/LOGIN and timeouts. Each user can link up to 10 accounts; passwords are encrypted with AES-256-GCM and never sent back to the browser. Every account can have aliases (send-as identities); the From selector lists all accounts and aliases and the message goes out through the account that owns the address. Presets for Gmail, Outlook, iCloud and Yahoo (iCloud requires the primary @icloud.com address as the login and an app-specific password; a custom domain goes in as an alias). HTML mail is shown in a sandboxed iframe without scripts, and remote images are blocked until the reader asks for them.

### Native WhatsApp, vault and video preparation

- **WhatsApp**: `services/whatsapp` runs Baileys with one session and one SQLite store per Sotos account, listening on localhost with a shared secret. `server/wa.mjs` proxies it and forwards its events over the existing SSE connection, so the app opens no extra browser connection. The app shows a clear notice that it is an unofficial client before linking.
- **Secret vault**: hidden app (`vault.jsx`) with its own password; files and names are encrypted at rest with AES-256-GCM using a scrypt-derived key, so neither the server nor administrators can read them. Sessions auto-lock after 15 minutes idle.
- **Video**: `server/media.mjs` prepares MKV/AVI or AC3/E-AC3/DTS videos once (video stream copied, audio to AAC), caches the result under `data/media-cache` and serves it with HTTP Range; embedded text subtitles are exported as WebVTT and external `.srt`/`.vtt` files next to the video are picked up.

### Virtual browser (Neko)

Some sites refuse to be shown inside another page (sign-ins, banks, WhatsApp Web). With `scripts/neko-dev.ps1`, a real Firefox runs in a container (`ghcr.io/m1k1o/neko/firefox:3.0.8`) and is streamed over WebRTC into the Browser (button **Virtual**) and into the **WhatsApp** app. The room is shared by everyone who can reach it, so on a multi-user server the WhatsApp session should be closed after use.

## 11. Visual identity and wallpapers

- Paper-and-ink tokens (`--surface`, `--ink-line`, `--print-shadow`, …) for light and dark themes; no `backdrop-filter`.
- Windows with custom controls, a top stripe in the app's color and an offset "printed" shadow.
- Accent palette: clay `#c4532f`, moss `#4f7a3a`, sky `#2f5d8a`, mustard `#c9902a`, plum `#7a3e6b`, lagoon `#1f7a78`.
- `wallpapers.js`: 8 deterministic scenes (seeded by id) inspired by Colombian landscapes, with halftone skies, flat layers with a registration offset, scene elements (frailejón, wax palm, cactus, hilltop chapel, city) and paper grain; rendered at screen resolution and cached as blob URLs.

### Grafito skin

A second full skin selected in Settings → Appearance (`settings.skin = "grafito"`). `shell.jsx` sets `data-skin` and `data-wallgray` on `<html>`; every rule lives under `[data-skin="grafito"]` in `styles.css` with its own light and dark tokens. The dock becomes a full-height rail (`.dock.rail`), `--desk-left` offsets maximized and snapped windows, folders read `--folder-color`, the font switches to Lato and the wallpaper gets a grayscale filter (optional).

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

## 14. Static demo build

A static, guest-only build without a server (`VITE_DEMO=1 npm run build:demo` → `../demo-dist`): `config.js#DEMO` skips sign-in, never calls the API, hides the proxy and shows a welcome dialog and a DEMO badge. The public online demo was retired; the build is kept for local presentations.

## 15. Tests and screenshots

- API smoke test (sign-up, session, operations, blobs, public links, anti-CSRF, permanent deletion): 20/20.
- Formats: generated `.docx`, `.xlsx`, `.pptx` and `.pdf` files were validated by opening them with independent libraries in Node.
- Formulas: precedence, ranges, multi-letter columns, cycles, division by zero and unknown names.
- Sync: new account → local cache wiped → everything comes back from the server, content included.
- Social layer (notifications, contacts, worlds, permissions, quotas, SSE fan-out): 26/26 API checks.
- Two-browser end-to-end run (two accounts in separate headless Edge instances): contacts, vCard round-trip, world creation and invitation, live notification badge, wall posts and comments, chat, shared-folder upload seen live by the other member, PDF render/text layer/search, ID3 title/artist/album/cover: 18/18.
- Static demo build: apps open, `.docx`/`.xlsx` load through lazy chunks, no console or network errors.
- Version 2.3 suites (headless Edge + CDP, two browsers where it applies): presence/inbox/groups/blocking 16/16, calendar and tasks 15/15, versions and backup 11/11, admin and region 17/17, window motion 13/13, context menus 52/52, archives 10/10, Store and Mail UI 12/12, multiple mail accounts 11/11, aliases and iCloud setup 4/4, mail API against a local IMAP/SMTP test server 29/29, ONLYOFFICE and Euro-Office 5/5 each, virtual browser 5/5.

Automated screenshots (server and `web` running):

```powershell
node scripts/capturas.mjs docs/capturas
```

Launches headless Edge at 1600×1000 (device scale 1.5), uses a local screenshot account and drives the system through `window.__sotos` (development builds only) plus real mouse and keyboard events over CDP.

## 16. Screenshots

| | |
|---|---|
| ![Sign-in](capturas/acceso.jpg) | ![Files](capturas/archivos.jpg) |
| ![Word](capturas/word.jpg) | ![Excel](capturas/excel.jpg) |
| ![Slides](capturas/presentaciones.jpg) | ![Terminal](capturas/terminal.jpg) |
| ![Browser](capturas/navegador.jpg) | ![Context menu](capturas/menu-contextual.jpg) |
| ![Wallpapers](capturas/fondos.jpg) | ![Sharing](capturas/compartir.jpg) |
| ![Public link](capturas/enlace-publico.jpg) | ![Dark theme](capturas/tema-oscuro.jpg) |
| ![World wall](capturas/mundos-muro.jpg) | ![World chat](capturas/mundos-chat.jpg) |
| ![Notifications](capturas/notificaciones.jpg) | ![Contacts](capturas/contactos.jpg) |
| ![PDF viewer](capturas/visor-pdf.jpg) | ![Music covers](capturas/musica-caratulas.jpg) |
| ![Grafito light](capturas/tema-grafito-light.jpg) | ![Grafito dark](capturas/tema-grafito-dark.jpg) |
| ![Mail](capturas/correo.jpg) | ![Mail accounts and aliases](capturas/correo-alias.jpg) |
| ![Calendar](capturas/calendario.jpg) | ![Tasks](capturas/tareas.jpg) |
| ![Versions](capturas/versiones.jpg) | ![Store](capturas/tienda.jpg) |
| ![Euro-Office](capturas/euro-office.jpg) | ![Virtual browser](capturas/navegador-virtual.jpg) |
| ![Games](capturas/juegos.jpg) | ![Widgets](capturas/widgets.jpg) |

## 17. Roadmap

- Syntax check of `instalar.sh` on real Linux.
- Window controls: user's choice between Sotos, Mac and Windows styles.
- Touch screens and a phone layout.
- Interface languages besides Spanish.
- A "lite" build without the virtual browser.
- New apps (camera, maps, code editor); world roles and post attachments.
- Automatic server backups, two-factor sign-in, per-user virtual browser rooms.
- Performance (lazy-loaded apps, icon font subset), strict CSP, per-account proxy limits.
