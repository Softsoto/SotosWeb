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

## Navegador y proxy

Casi todos los sitios prohíben mostrarse dentro de otra página (`X-Frame-Options`, CSP). El Navegador de Sotos los carga a través de su proxy propio (`server/px.mjs`), que:

- quita esas cabeceras y reescribe enlaces, formularios, redirecciones, CSS, `fetch`/XHR;
- guarda las cookies de cada visitante en el servidor (sesiones simples funcionan);
- bloquea direcciones de redes privadas;
- se sirve en un **origen distinto** al del escritorio, para que ninguna página pueda leer la sesión de Sotos.

En producción el proxy debe ir en su propio subdominio y el build del escritorio se configura con `VITE_PX_ORIGIN=https://px.tudominio`.

Limitaciones conocidas: sitios muy dependientes de JavaScript o con protección anti-bots (Google login, YouTube completo, bancos) pueden fallar; para esos queda el botón "Abrir en pestaña real".
