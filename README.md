# Sotos OS

**Tu ordenador en la nube.** Un escritorio completo que corre 100 % en el navegador: ventanas, dock, archivos, documentos, hojas de cálculo, presentaciones, multimedia, navegador web, terminal, juegos y widgets.

© 2026 Sebastian Sotomontes. Todos los derechos reservados.

## Estructura

| Carpeta   | Qué es |
|-----------|--------|
| `web/`    | Escritorio (React 18 + Vite). Fuentes e iconos servidos localmente. |
| `server/` | Servidor Node ≥ 22 sin dependencias: proxy del Navegador (`/px/…`) y API (`/api/…`). |

## Desarrollo

```powershell
# terminal 1 — servidor (proxy + API) en :8787
cd server; npm run dev

# terminal 2 — escritorio en :5173
cd web; npm install; npm run dev
```

Abre http://localhost:5173.

## Cuentas, nube y compartir

- **Invitado**: todo vive en el navegador (IndexedDB). Sin servidor también funciona.
- **Cuenta**: los archivos se guardan en el servidor (`server/data`), con caché local, cola sin conexión y cambios en vivo entre dispositivos (SSE). Cada cambio viaja como una operación (`web/src/os/tree-ops.js`, el mismo código en navegador y servidor).
- **Compartir**: enlaces públicos o solo para ciertas cuentas, con permiso de lectura o edición y caducidad. Página pública en `/#/s/<token>`.
- **Seguridad**: contraseñas con scrypt, sesiones en cookie HttpOnly, límite de intentos, cabecera anti-CSRF `X-Sotos`, contenido compartido servido con `nosniff` y `sandbox`.

## Word, Excel y PowerPoint (ONLYOFFICE)

Con cuenta y un servidor ONLYOFFICE Docs configurado, Documentos/Hojas/Presentaciones abren los editores completos de ONLYOFFICE (guardado automático vía callback firmado con JWT). Sin ONLYOFFICE, o como invitado, se usan los editores propios de Sotos, que también leen y escriben `.docx`, `.xlsx` y `.pptx` reales.

Desarrollo local: `powershell -File scripts\onlyoffice-dev.ps1` (requiere Docker) y reiniciar `npm run dev` en `server/`.

## Despliegue en un servidor

```bash
cp .env.example .env        # dominios + OO_JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

Levanta tres contenedores: **Caddy** (HTTPS automático), **Sotos** (escritorio + API + proxy) y **ONLYOFFICE Docs**. Se necesitan tres subdominios apuntando al servidor (escritorio, proxy del navegador y office) y un VPS con al menos 4 GB de RAM (ONLYOFFICE es el que más consume).

## Navegador y proxy

Casi todos los sitios prohíben mostrarse dentro de otra página (`X-Frame-Options`, CSP). El Navegador de Sotos los carga a través de su proxy propio (`server/px.mjs`), que:

- quita esas cabeceras y reescribe enlaces, formularios, redirecciones, CSS, `fetch`/XHR;
- guarda las cookies de cada visitante en el servidor (sesiones simples funcionan);
- bloquea direcciones de redes privadas;
- se sirve en un **origen distinto** al del escritorio, para que ninguna página pueda leer la sesión de Sotos.

En producción el proxy debe ir en su propio subdominio y el build del escritorio se configura con `VITE_PX_ORIGIN=https://px.tudominio`.

Limitaciones conocidas: sitios muy dependientes de JavaScript o con protección anti-bots (Google login, YouTube completo, bancos) pueden fallar; para esos queda el botón "Abrir en pestaña real".
