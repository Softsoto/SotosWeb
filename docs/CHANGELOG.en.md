# Changelog

© 2026 Sebastian Sotomontes · MIT License. The Spanish [CHANGELOG](../CHANGELOG.md) is the reference.

## 3.6 — 2026-11-23
- Era themes: Prado (2001), Cristal (2007), Vidrio (2009), Mosaico (2012, live tile Start screen) and Aluminio (Mac) — full desktops with taskbar + Start menu or menubar + magnifying dock, era login screens, original wallpapers, illustrated object icons per app, era folders, translucent glass with light streaks, and synthesized era sounds (login, logout, windows, Start, errors, notifications, empty trash). No third-party logos or marks.
- Account panel on your photo: change email and password, photo and name, 2FA, and open sessions (see and close them). Admin policy "account details: each person / admin only", enforced by the server; admins can now change a user's email.
- Contribute app and public /#/donar page with donation methods published by the admin (PayPal, Ko-fi, GitHub Sponsors, Buy Me a Coffee, Nequi, Daviplata, Bancolombia, bank transfer, custom link), plus ways to contribute to the project.
- Server-side downloads: paste a link and the server downloads it to your Downloads folder with live progress; internal addresses are blocked (SSRF protection).
- Fixes: live contact refresh after CardDAV changes; 12 missing icons; icon subset size guard.

## 3.5.1 — 2026-11-21
- Safer updates: the updater installs everything in the new package (no fixed list, so new folders are never missed), keeps the previous version, checks that the new one boots before restarting, and rolls back automatically if it does not.

## 3.5 — 2026-11-21
- App SDK (`sdk/`): `sotos-app.json` manifest with permissions (files.read, files.write, storage, notify, user); `sotos-sdk.js` (pick/read/save/write files through the system picker, per-user app storage, notifications, window title, live theme, "Open with" from Files). Apps run sandboxed (opaque origin, no access to the session or API) and only get the files the user picks. Admin installs `.zip` apps in Admin → Apps; the Store shows author, version and permissions. Tools: `crear-app.mjs`, `empaquetar-app.mjs`, TypeScript types, docs and a Markdown notes example app.
- CalDAV/CardDAV: calendars, World calendars and contacts sync with iPhone/iPad/Mac (auto-discovery), Android (DAVx⁵), Thunderbird and Outlook; time zones, alarms and recurring events preserved; uses per-device app passwords.
- Password recovery by email (single-use 30-minute link, signs out other sessions, asks for the 2FA code when enabled, no account enumeration) with server SMTP settings in Admin → Server.
- Off-site backups to another disk/NAS folder or S3-compatible storage (Backblaze B2, Cloudflare R2, Wasabi, AWS, MinIO): incremental, rotation and cleanup, own SigV4 signing; `scripts/restaurar-copia.mjs` restores from the bucket.
- Share links: password, download limit, view/download counters and upload-only folders (file requests).
- System file picker shared by Mail, Worlds, Vault, Calendar, Contacts and Paint ("Save as").
- Fixes: 12 icons that did not exist in the font, icon subset size guard, admin pane layout.

## 3.4 — 2026-11-20
- Install packages per release: Windows `Sotos-Setup.exe` (IExpress), prebuilt `sotos-x.y.z.zip`/`.tar.gz`, `SHA256SUMS.txt`; single-file installers `instalar-sotos.ps1`/`.sh` (install, update, check, uninstall; SHA-256 verification; app and data kept apart; optional systemd service); Synology/NAS `Dockerfile` + `docker-compose.nas.yml`; one-click updates in Admin → Server with daily admin notice, backup first, SHA-256 check and restart; `scripts/empaquetar.mjs`. Fixed the Admin window being vertically centered.

## 3.3 — 2026-11-20
- Web installer (WordPress/Chevereto style) at /instalar: target selection with auto-detection (this computer, hosting/VPS, Synology NAS, other NAS), requirements, built-in SQLite database step, site, admin account, options, optional Docker services with live progress, Ubuntu-style slideshow during setup and install, dark (default) and light themes, install code for remote setup, Windows autostart, self-restart; existing instances are marked as installed; `scripts/restablecer-clave.mjs`.

## 3.2 — 2026-11-18
- Cinema (Jellyfin) and Photos (Immich): media library mirrored with hard links, automatic service setup, one service account per Sotos user limited to their own media, sign-in without another password (Jellyfin served same-origin at /jellyfin; Immich via its session cookies).
- WebDAV drive at /dav/ with per-device app passwords; daily backups (VACUUM INTO + hard links, rotation, admin tab); trash auto-empty and quota warnings; two-step verification (TOTP + recovery codes).
- Web Push (VAPID + RFC 8291, no dependencies), installable PWA, phone layout, video calls in worlds (WebRTC mesh), English UI (on-screen dictionary), icon font subset (5.2 MB -> 51 KB) and on-demand app loading.

## 3.1 — 2026-11-18
- Live co-editing of world documents (one Document Server session per file, members only); general search (apps, files, contacts, events, tasks, settings, web); Dock drag to add/remove, pin running apps; spring-loaded folders and Move to…; Gallery "Open file location"; drag from Files into the vault; password required to change profile photo/name; install-time `SOTOS_VAULT_ADMIN` (vault key escrow for admins, audited).

## 3.0 — Official release (2026-11-18)

### Added
- **Native WhatsApp**: optional per-account service (`services/whatsapp`, Baileys, localhost + shared secret) bridged by `server/wa.mjs`; QR linking, chats, photos, video, audio, documents, sending Sotos files, new chat by number; clear risk notice before linking; events delivered over the existing SSE connection.
- **Secret vault** (`server/vault.mjs`, `vault.jsx`): hidden app protected by its own password (scrypt); file contents and names encrypted at rest with AES-256-GCM; auto-locks after 15 min idle; admins only see an encrypted file count.
- **Paint** (own), **Diagrams** (draw.io embed, self-hostable via `DRAWIO_URL`), **Whiteboard** (Excalidraw), **Code** (Monaco).
- **Mail**: multiple accounts per user, aliases with a primary sender, HTML signature, rich HTML composer with sanitizing, HTML replies and forwards.
- **Video preparation** (`server/media.mjs`, ffmpeg): MKV/AVI and AC3/E-AC3/DTS audio prepared once (video copied, audio to AAC), cached with a size limit, served as a normal file with HTTP Range; audio and subtitle track selection, external .srt/.vtt, embedded text subtitles as WebVTT.
- **Transfers manager** (upload progress, speed, ETA, cancel), HTTP Range and media types on blobs, direct downloads, large uploads no longer duplicated in the browser.
- **Avatars**: five CC0 default photos plus uploads, stored on the account; contacts, chats and mail show photos instead of initials.
- Draggable desktop icons on a grid, selectable system logo (current or the original husky and cat).

### Admin
- Own account listed first, review users' files folder by folder, delete with a reason sent as a notification, audit log, password + warning to drop your own admin role.

### Changed / fixed
- iCloud/Outlook SMTP forced to 587 STARTTLS; Grafito tiles fall back to the app color; widget rows fit the card; WhatsApp chat de-duplication; SQLite `busy_timeout`; docs editor shows the running engine; online demo retired.

## 2.3 — 2026-11-17
Real mail (IMAP/SMTP), calendar and tasks, file versions and backups, store, admin panel, ONLYOFFICE and Euro-Office tested end to end, Neko virtual browser.

## 2.2 — 2026-11-17
New logo, widgets, games, video thumbnails, album covers, folder symbols, window motion.

## 2.1 — 2026-11-16
Worlds, notifications, contacts, PDF viewer, ID3 covers, Grafito skin.

## 2.0 — 2026-11-14
Full rebuild: real cloud files, accounts, live sync, genuine Office files, proxy browser, terminal, sharing, installers.