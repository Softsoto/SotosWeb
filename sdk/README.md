# SDK de Sotos

Crea apps para la Tienda de Sotos con HTML, CSS y JavaScript. Tu app corre en su propia ventana del escritorio, abre y guarda archivos en Sotos Drive con el selector del sistema, guarda sus datos en la cuenta de cada persona, manda avisos y sigue el tema claro u oscuro.

```
sdk/
  sotos-sdk.js        el SDK (las apps lo cargan desde /sdk/sotos-sdk.js)
  sotos-sdk.d.ts      tipos para el autocompletado del editor
  manifest.mjs        las reglas de sotos-app.json (las usa también el servidor)
  crear-app.mjs       crea el esqueleto de una app nueva
  empaquetar-app.mjs  revisa la app y la empaqueta en .zip
  ejemplos/notas-md/  app completa de ejemplo: notas Markdown con vista previa
```

## Empezar en 3 pasos

```bash
node sdk/crear-app.mjs lista-compras "Lista de compras"   # 1. crea la carpeta lista-compras/
# 2. edita lista-compras/index.html, app.js y estilo.css
node sdk/empaquetar-app.mjs lista-compras                 # 3. → lista-compras-1.0.0.zip
```

Instala el `.zip` en **Administración → Apps → Instalar una app (.zip)**. La app aparece en la Tienda y cada persona la agrega a su cuenta. Para actualizarla, sube la versión nueva: reemplaza a la anterior y conserva los datos de cada persona.

## sotos-app.json

```json
{
  "id": "lista-compras",
  "name": "Lista de compras",
  "version": "1.0.0",
  "description": "Una frase que diga qué hace.",
  "author": "Tu nombre",
  "icon": "shopping_cart",
  "color": "#4f7a3a",
  "category": "Productividad",
  "entry": "index.html",
  "width": 900,
  "height": 620,
  "permissions": ["storage", "notify"],
  "opens": [],
  "homepage": "https://…"
}
```

| Campo | Qué es |
|---|---|
| `id` | 2-30 letras minúsculas, números o guiones. Único en el servidor; no puede ser el de una app de Sotos. |
| `version` | `mayor.menor.parche` (1.0.0). |
| `icon` | Nombre de un ícono de [Material Symbols](https://fonts.google.com/icons) (ej. `edit_note`). |
| `entry` | La página que se abre (por defecto `index.html`). Usa rutas relativas dentro de la app. |
| `permissions` | Lo que la app puede pedir. Se muestran en la Tienda antes de instalarla. |
| `opens` | Extensiones que la app sabe abrir (`["md","txt"]`): aparece **Abrir con** en Archivos. Requiere `files.read`. |

### Permisos

| Permiso | Para qué |
|---|---|
| `files.read` | Abrir los archivos **que la persona elija** en el selector (o le dé con «Abrir con»). La app nunca ve el resto del Drive. |
| `files.write` | Guardar con «Guardar como» donde la persona elija, y reescribir archivos que ya le dio. |
| `storage` | Guardar datos propios de la app en la cuenta de cada persona (hasta 2 MB). |
| `notify` | Mandar avisos a la campana de notificaciones. |
| `user` | Ver el nombre y el idioma de quien usa la app. |

## La API

Carga el SDK en tu HTML y usa el objeto global `sotos`. Todo devuelve promesas.

```html
<script src="/sdk/sotos-sdk.js"></script>
```

```js
const info = await sotos.ready;          // { app: { id, name, version }, lang, theme: { dark, accent }, user? }

// archivos (la persona elige; tu app solo recibe lo que eligió)
const [f] = await sotos.files.pick({ exts: ["md", "txt"], multiple: false });   // [] si cancela
const texto = await (await sotos.files.read(f)).text();                        // Blob
const nuevo = await sotos.files.save({ name: "nota.md", data: texto });       // «Guardar como» → archivo o null
await sotos.files.write(nuevo, "contenido nuevo");                            // reescribe uno que ya te dieron

// datos de la app (por persona)
await sotos.storage.set("ajustes", { fuente: 16 });
const ajustes = await sotos.storage.get("ajustes");   // null si no existe
await sotos.storage.remove("ajustes"); const claves = await sotos.storage.keys();

// avisos, ventana y eventos
sotos.notify({ title: "Listo", body: "Se exportó tu lista" });
sotos.window.setTitle("Compras de diciembre");
sotos.on("theme", (t) => console.log(t.dark, t.accent));   // cambia en vivo
sotos.on("open", (archivo) => abrir(archivo));             // «Abrir con» desde Archivos
```

Un archivo es `{ id, name, size, type, ext, mtime }`. Los que vienen de «Desde este equipo» traen `local: true`: se pueden leer, pero para guardarlos en Sotos usa `files.save`.

Si un permiso falta, la promesa se rechaza con `error.code === "permission"`.

### Tema

El SDK pone `data-sotos-theme="dark"` o `"light"` en `<html>` y la variable CSS `--sotos-accent` con el color de acento de la persona:

```css
:root { --fondo: #f6f1e7; --texto: #2b2622; }
:root[data-sotos-theme="dark"] { --fondo: #1d1a17; --texto: #ece6dc; }
button.principal { background: var(--sotos-accent); }
```

## Seguridad: cómo corre tu app

- Se sirve con `Content-Security-Policy: sandbox` y se muestra en un `<iframe sandbox>` **sin** `allow-same-origin`: tiene un origen propio y opaco. No puede leer la sesión, las cookies ni llamar a la API de Sotos.
- Todo pasa por el SDK (`postMessage`), y el escritorio revisa los permisos del manifiesto en cada llamada.
- A los archivos solo llega lo que la persona elige en el selector del sistema.
- Por el aislamiento **no** hay `localStorage`, `sessionStorage`, `indexedDB` ni cookies: usa `sotos.storage`. `empaquetar-app.mjs` te avisa si tu código los usa.
- Puedes usar `fetch` a servicios externos que acepten CORS, módulos JS (`type="module"`), WebAssembly, `<canvas>`, audio y video.

## Probar mientras desarrollas

1. Arranca Sotos en tu equipo (`npm run dev` en `web/` y el servidor en `server/`).
2. Empaqueta e instala tu app; para cada cambio vuelve a empaquetar y subir el `.zip` (se actualiza en el sitio).
3. Abre la consola del navegador: los errores de tu app aparecen ahí, en el marco de la app.

## Licencia

El SDK, las herramientas y el ejemplo son MIT. Tus apps son tuyas: elige la licencia que quieras.

© 2026 Sebastian Sotomontes
