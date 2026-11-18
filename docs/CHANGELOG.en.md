# Changelog

© 2026 Sebastian Sotomontes · MIT License. The Spanish [CHANGELOG](../CHANGELOG.md) is the reference.

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