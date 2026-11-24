# Historial de cambios de Sotos

Todas las versiones de Sotos, de la más reciente a la más antigua.
© 2026 Sebastian Sotomontes · Licencia MIT

## 3.6.4 — 24 de noviembre de 2026

### Nuevo
- **Actualizar con un botón.** Cuando hay una versión nueva, el administrador ve al entrar el aviso «Sotos X está disponible» con **Actualizar** y **Más tarde**. Al tocar Actualizar se abre una ventana con el avance: copia de seguridad, descarga, verificación, instalación y reinicio. Cuando Sotos vuelve con la versión nueva, la página se recarga sola. La notificación diaria, el Panel de control y Administración → Servidor abren esa misma ventana.
- **Docker y NAS se actualizan solos.** La versión nueva se instala en la carpeta de datos (`/data/app`), así sobrevive a reinicios y a recrear el contenedor. Al arrancar se usa la más nueva entre la de la imagen y la instalada. Las imágenes anteriores a esta versión hay que reconstruirlas una sola vez (`docker compose up -d --build`).
- **Copias con git** (desarrollo): el botón hace `git pull` y vuelve a compilar el escritorio.

### Arreglado
- El aviso de versión nueva no decía qué hacer en Docker ni en copias con git, y no había botón.

## 3.6.3 — 24 de noviembre de 2026

### Nuevo
- **Carpetas del NAS**: en un NAS (Synology u otro) Sotos muestra las carpetas compartidas montadas en `/nas` tal como están en el disco, sin copiarlas. Se pueden ver fotos y PDF, reproducir video y música (con avance), copiar archivos a tus archivos, guardar los tuyos en el NAS, subir, crear carpetas y renombrar. Borrar los manda a la papelera de la carpeta compartida. Por defecto solo el administrador las ve (`SOTOS_NAS_USERS=todos` para todos) y `SOTOS_NAS_WRITE=0` las deja en solo lectura.
- **Administración → Servicios**: instala después de la instalación los servicios opcionales (Office, Diagramas, Cine, Fotos, navegador virtual) con el avance en vivo; Sotos se reinicia solo para usarlos.
- **Docker en NAS**: la imagen trae el cliente de Docker para instalar esos servicios en el Docker del propio NAS (montando `/var/run/docker.sock`), `SOTOS_UID`/`SOTOS_GID` para correr con los permisos de un usuario de DSM, `SOTOS_DATA_ANTES` para traer los datos de una instalación anterior y una red propia (`sotos-red`) donde los servicios se llaman por nombre. `docker-compose.nas.yml` viene listo y comentado.

### Arreglado
- **Compartir enlaces no copiaba nada** entrando por `http://IP` (Docker, NAS, red local): el navegador solo da acceso al portapapeles con HTTPS o en el propio equipo, y el botón «Copiar» fallaba sin avisar. Ahora copia también por HTTP, avisa si de verdad no se puede y el enlace queda en un campo que se selecciona al tocarlo. Lo mismo para copiar direcciones, correos, teléfonos, el informe del sistema y el enlace de donaciones.
- El ícono del botón «Copiar» del enlace salía como texto invisible y lo dejaba enorme.

## 3.6.2 — 23 de noviembre de 2026

### Nuevo
- **Panel de control** (en Inicio y al tocar el reloj): vista por categorías o por íconos, atrás/adelante y buscador.
  - **Programas y características**: lo instalado con su editor, fecha, tamaño y versión; desinstalar (con opción de borrar los datos de la app) y, para el administrador, quitar apps del servidor.
  - **Programas predeterminados**: qué app abre cada tipo de archivo; el doble clic lo respeta y los archivos sin app propia se abren con la app del SDK que los admite.
  - **Seguridad y mantenimiento**: dos pasos, sesiones, conexión, sincronización, espacio, papelera, copias y actualizaciones, cada uno con su botón para arreglarlo.
  - **Sistema** (con informe para copiar), **Copias de seguridad**, **Herramientas administrativas**, **Cuentas** y **Sesiones**, **Personalización** y **Fondo**.
  - **Sonido** (prueba de altavoz izquierdo y derecho, medidor del micrófono, esquemas de sonido), **Dispositivos** (pantalla, cámaras, micrófonos, batería, red, mandos), **Fecha y hora** (reloj, relojes de otras zonas, comparar la hora con el servidor), **Región** y **Almacenamiento** (uso por tipo, archivos más grandes, vaciar la papelera, borrar la copia local del navegador).
- **Temas Núcleo y Circuito**: Núcleo con metal plateado, título en píldora de gel verde, orbes y menú Inicio de metal; Circuito en negro brillante con líneas de luz cian, rejilla en perspectiva y estelas. Con fondos y sonidos propios.

### Arreglado
- **Los PDF no se abrían**: el servidor mandaba los archivos `.mjs` (y el `.wasm` del abridor de comprimidos) con un tipo equivocado y el navegador se negaba a usarlos.
- **Imagen de Docker**: el `Dockerfile` principal no copiaba `sdk/` ni `VERSION`, así que el contenedor no arrancaba. Ahora trae ffmpeg, guarda la configuración del asistente en `/data` y ajusta los permisos de la carpeta de datos.
- Íconos que salían como texto (el rectángulo de Paint, íconos de Mundos, Juegos y Contactos, la noche en el clima).
- Ajustes → Acerca de muestra la versión real.

## 3.6.1 — 23 de noviembre de 2026

### Arreglado
- **WhatsApp ya no tumba el escritorio**: abrirlo sin el servicio de WhatsApp dejaba la pantalla en blanco. Además, cada ventana queda aislada: si una app falla, solo esa ventana muestra el aviso con «Volver a abrir» o «Cerrar ventana», y el resto de Sotos sigue.
- **Servicio de WhatsApp más resistente**: el servidor ya no se cae si el servicio se corta a mitad de una respuesta; un doble clic en «Vincular» no abre dos sesiones; un mensaje raro no detiene la sesión; si la sesión se abre en otro lado o las credenciales se dañan lo explica en vez de reintentar sin fin; los errores quedan en `errores.log` y el script de arranque lo vuelve a levantar si se cierra. La app muestra «WhatsApp no responde» con «Reintentar ahora» en vez de quedarse cargando.
- **Los temas de época llegan al interior de las apps**: barras laterales, barras de herramientas, botones, campos y selección con el estilo de cada época, íconos de época en las barras laterales y de título, y **modo oscuro** propio de cada época (antes usaba los colores cálidos del tema Sotos).
- **Vidrio de verdad en Cristal y Vidrio**: la barra de tareas, el menú Inicio y las ventanas desenfocan y ondulan el fondo que tienen detrás.
- `?tema=` y `?modo=` ya no se quedan pegados en la dirección después de aplicarse.
- **Bóveda**: se abre también desde Inicio en los temas Grafito y de época; como invitado explica que necesita una cuenta y lleva a iniciar sesión.

### SDK
- `sotos.files.pickFolder()` y `sotos.files.saveIn(carpeta, archivo)` para que una app elija una carpeta y guarde varios archivos en ella.

## 3.6 — 23 de noviembre de 2026

### Nuevo
- **Temas de época**: cinco escritorios completos que recuerdan otras épocas, con arte, fondos, íconos y sonidos propios (sin logos ni marcas de nadie):
  - **Prado** (2001): barra azul brillante, botón verde de Inicio, ventanas azules de esquinas redondas, menú Inicio de dos columnas e inicio de sesión «haga clic en su nombre».
  - **Cristal** (2007) y **Vidrio** (2009): vidrio translúcido con desenfoque y vetas de luz en ventanas, barra y menú Inicio con buscador; Vidrio agrupa las apps en la barra.
  - **Mosaico** (2012): pantalla de mosaicos vivos (hora, calendario, fotos que cambian, avisos) y escritorio plano de bordes rectos.
  - **Aluminio** (Mac): barra de menú arriba, botones de semáforo y dock con lupa.
  - **Íconos-objeto** dibujados para cada app (carpeta, globo, calendario de escritorio, portapapeles…) con el estilo de cada época, carpetas propias y vistas previas en Ajustes → Apariencia. Ctrl + Esc abre Inicio.
- **Sonidos** sintetizados de cada época al entrar y salir, abrir, cerrar, minimizar y maximizar ventanas, abrir Inicio, errores, avisos y vaciar la papelera (se apagan en Apariencia).
- **Tu cuenta a un clic en tu foto**: cambiar correo y contraseña, foto y nombre, verificación en dos pasos y **sesiones abiertas** (ver dónde está abierta tu cuenta y cerrarlas).
- **Datos de las cuentas** (Administración → Servidor): *cada persona* o *solo el administrador*; en el segundo caso el panel lo avisa y el servidor lo hace cumplir. El administrador ahora también cambia el correo de una cuenta.
- **Contribuir**: app para apoyar este Sotos con los medios que publique el administrador (PayPal, Ko-fi, GitHub Sponsors, Buy Me a Coffee, Nequi, Daviplata, Bancolombia, transferencia o un enlace propio), página pública **/#/donar** para compartir, y cómo contribuir al proyecto (errores, ideas, código, traducciones).
- **Descargas al servidor**: pega un enlace y el servidor lo baja a tu carpeta Descargas con progreso en vivo, aunque cierres el navegador; bloquea direcciones internas para que nadie use el servidor como trampolín.

### Arreglado
- Los cambios de contactos hechos desde el celular (CardDAV) no se veían en vivo en la app Contactos.
- 12 íconos que no existían en la fuente y aparecían como texto; el generador de íconos ya no se pasa del límite de Google.

## 3.5.1 — 21 de noviembre de 2026

### Arreglado
- **Actualizaciones más seguras**: el actualizador ahora instala todo lo que trae la versión nueva (antes usaba una lista fija y una carpeta nueva podía faltar, dejando el servidor sin arrancar). Guarda la versión anterior, comprueba que la nueva arranca antes de reiniciar y, si no arranca, vuelve sola a la anterior y lo avisa.

## 3.5 — 21 de noviembre de 2026

### Nuevo
- **Recuperar la contraseña por correo**: «¿Olvidaste tu contraseña?» en la pantalla de acceso envía un enlace de un solo uso que dura 30 minutos. Al cambiarla se cierran las demás sesiones, y si la cuenta tiene verificación en dos pasos también pide el código. La respuesta es la misma exista o no la cuenta.
- **Calendario y contactos en el celular (CalDAV y CardDAV)**: iPhone, iPad y Mac los encuentran solos; Android con DAVx⁵; Thunderbird y Outlook. Se sincronizan tus calendarios, los de tus Mundos y tus contactos en ambos sentidos, con zonas horarias, avisos y eventos que se repiten (se conservan tal cual los manda el celular). Usa las mismas claves por dispositivo de la unidad de red.
- **Selector de archivos del sistema**, el mismo en todas las apps: Sotos Drive con sus carpetas, Recientes, búsqueda, miniaturas, vista de lista, carpeta nueva y «Desde este equipo». Recuerda la última carpeta. Lo usan Correo (adjuntar), Mundos y Bóveda (subir), Calendario y Contactos (importar) y Paint («Guardar como», con aviso antes de reemplazar).
- **Enlaces para compartir más completos**: contraseña (la página la pide y entrega una llave de 12 horas), límite de descargas (sin vistas previas, para que no se pueda saltar), contadores de visitas y descargas, y **carpetas para pedir archivos**: quien tiene el enlace sube archivos con su nombre, sin ver lo que hay dentro; no se pisan archivos con el mismo nombre y te llega un aviso con cada uno.
- **Copia fuera del servidor** (Administración → Copias): después de cada copia local se envía a otro disco, un NAS montado o un almacenamiento S3 (Backblaze B2, Cloudflare R2, Wasabi, AWS S3, MinIO). Solo viaja lo nuevo; en disco lo repetido se enlaza y no ocupa de nuevo; rotación y limpieza del contenido que ya ninguna copia usa; botones «Probar» y «Enviar ahora»; claves cifradas. `node scripts/restaurar-copia.mjs` trae una copia de vuelta desde el bucket sin necesitar el servidor viejo.
- **SDK para crear apps de la Tienda** (`sdk/`): manifiesto `sotos-app.json` con permisos (archivos, datos propios, avisos, usuario), `sotos-sdk.js` con abrir y guardar archivos por el selector del sistema, datos de la app por persona, avisos, título de ventana, tema en vivo y «Abrir con» desde Archivos. Las apps corren aisladas (origen opaco: no ven la sesión ni la API) y solo llegan a los archivos que la persona elige. Herramientas `crear-app.mjs` y `empaquetar-app.mjs`, tipos para el editor, documentación y una app de ejemplo (Notas Markdown). El administrador instala el `.zip` en **Administración → Apps**; la Tienda muestra autor, versión y permisos.
- Arreglados 12 íconos que no existían en la fuente (Renombrar, flechas de desplegar, papelera vacía…) y el generador de íconos ya no se pasa del límite de Google (la fuente sigue en ~50 KB).
- **Correo del servidor** en Administración → Servidor: cuenta de envío (Gmail, Outlook, iCloud, Yahoo o cualquier SMTP) con la contraseña cifrada, dirección pública de Sotos para los enlaces y botón de prueba.

## 3.4 — 20 de noviembre de 2026

### Nuevo
- **Paquetes de instalación** en cada versión publicada: `Sotos-Setup.exe` para Windows (revisa el equipo, instala, crea accesos en el menú Inicio y el escritorio y abre el asistente), `sotos-x.y.z.zip`/`.tar.gz` con el escritorio ya compilado y `SHA256SUMS.txt`.
- **Instalador de un solo archivo** (`instalar-sotos.ps1` y `instalar-sotos.sh`) con las acciones `instalar`, `actualizar`, `comprobar` y `desinstalar`: descarga la última versión, comprueba su huella SHA-256, separa la aplicación de los datos y, en Linux, puede dejar Sotos como servicio de systemd.
- **Synology y otros NAS**: el paquete trae un `Dockerfile` (con ffmpeg) y `docker-compose.nas.yml` para Container Manager.
- **Actualizaciones desde Administración → Servidor**: aviso diario a los administradores, novedades de la versión y «Actualizar ahora» (copia de seguridad, descarga, verificación SHA-256, reemplazo solo de la aplicación y reinicio).
- `node scripts/empaquetar.mjs` arma todos los paquetes.

### Arreglado
- El panel de Administración quedaba centrado en vertical por un estilo que se aplicaba a toda la ventana.

## 3.3 — 20 de noviembre de 2026

### Nuevo
- **Asistente de instalación web** (como el de WordPress o Chevereto): al abrir un Sotos recién descargado aparece un asistente de 9 pasos. Elige dónde vivirá Sotos (este computador, hosting o VPS, Synology NAS u otro NAS) con detección automática y consejos para cada caso, revisa los requisitos, muestra la base de datos integrada (SQLite, sin usuarios ni contraseñas de base de datos), configura el sitio, crea la cuenta de administrador, fija las opciones y, si hay Docker, instala los servicios opcionales con su avance en vivo.
- **Presentación mientras se instala**, al estilo de Ubuntu: diapositivas con capturas reales de Sotos, barra de avance y registro técnico. Mientras se configura, la barra lateral también va mostrando las funciones.
- **Tema oscuro elegante** (por defecto) y claro, en español e inglés.
- En Windows, opción de **arrancar Sotos al encender** el equipo.
- `scripts/restablecer-clave.mjs` para cambiar la contraseña de una cuenta desde el servidor.

### Seguridad
- Desde otro equipo, el asistente pide un **código de instalación** que muestra la consola del servidor. Mientras Sotos no está instalado nadie puede registrarse, y al terminar el asistente deja de existir.

## 3.2 — 18 de noviembre de 2026

### Nuevo
- **Cine (Jellyfin)**: tus videos y tu música como en un servicio de streaming, con portadas, «continuar viendo» y subtítulos. Cada persona tiene su propia cuenta de Jellyfin, creada por Sotos, que solo ve sus archivos; entra sin otra contraseña.
- **Fotos (Immich)**: tus fotos y videos por fecha y lugar, con reconocimiento de caras, búsqueda inteligente y recuerdos. Immich lee tus fotos de Sotos en modo de solo lectura: nunca las copia ni las modifica.
- **Conectar Sotos como unidad (WebDAV)**: tus archivos como una carpeta más en Windows, Mac, Linux o el celular. Cada dispositivo usa su propia clave, que se puede revocar; lo que se borra va a la Papelera.
- **Videollamadas en los mundos**: video, audio y compartir pantalla directo entre los navegadores; los demás miembros reciben un aviso.
- **Avisos aunque Sotos esté cerrado**, como los de una app del celular (Web Push cifrado de extremo a extremo con el servicio de avisos).
- **Sotos instalable** en el celular o el computador, y **diseño para celular**: cada app a pantalla completa, Dock abajo que se desliza, un toque abre y mantener presionado muestra el menú.
- **Interfaz en inglés**, elegible en Ajustes → Región o en la pantalla de inicio; fechas y números también cambian. Nada de lo que escribe la gente se traduce.
- **Carpetas en el Dock**: arrástralas o usa el clic derecho.

### Seguridad y datos
- **Verificación en dos pasos** con Google Authenticator, Microsoft Authenticator o Authy, con 10 códigos de recuperación. El administrador puede quitarla si alguien pierde el celular.
- **Copias de seguridad automáticas** cada día a las 3:00, con las últimas 7. Los archivos que no cambian no ocupan espacio de nuevo. Pestaña «Copias» en Administración.
- **Papelera que se vacía sola** a los 30 días, con aviso 3 días antes, y **aviso de espacio** al pasar el 80 % y el 95 %.

### Más rápido
- La fuente de íconos pasó de 5,2 MB a 51 KB y cada app se descarga al abrirla: el arranque descarga mucho menos.

## 3.1 — 18 de noviembre de 2026

### Nuevo
- **Coedición en los mundos**: un Word, Excel o PowerPoint de la carpeta de un mundo se abre en Euro-Office u ONLYOFFICE y todos los miembros lo editan a la vez, en una sola sesión en vivo. Quien no es miembro no puede abrirlo.
- **Buscador general** (botón Buscar de la barra superior o `Ctrl + K`): apps, archivos, contactos, eventos, tareas, ajustes y búsqueda en internet, agrupados.
- **Dock personalizable**: arrastra una app desde Aplicaciones o el escritorio para agregarla, arrástrala fuera para quitarla (con deshacer), clic derecho para «Agregar al Dock», «Quitar del Dock» o «Mantener en el Dock». Las apps abiertas que no están fijadas aparecen al final.
- **Mover entre carpetas**: al arrastrar, las carpetas, la ruta de arriba y la barra lateral se abren solas si te detienes encima; y «Mover a…» en el clic derecho con un árbol de carpetas.
- **Galería**: clic derecho sobre una foto con «Abrir ubicación del archivo», usar como fondo, editar con Paint, compartir, propiedades y papelera.
- **Bóveda**: ahora se pueden arrastrar archivos y carpetas desde Archivos de Sotos (con opción de quitar los originales).
- **Bóvedas y administración**: al instalar se elige si el administrador puede revisar las bóvedas de los usuarios (`SOTOS_VAULT_ADMIN`). Si se permite, el panel de administración las lista y las abre, y cada apertura queda en el registro.

### Seguridad
- Cambiar la foto o el nombre del perfil pide la contraseña de la cuenta; el servidor la verifica.

## 3.0 — Lanzamiento oficial (18 de noviembre de 2026)

### Nuevo
- **WhatsApp dentro de Sotos**: cada cuenta vincula su propio WhatsApp con un código QR y lo usa con la interfaz de Sotos (chats, fotos, videos, audios, documentos, enviar archivos de tu nube, chat nuevo por número). Antes de vincular se avisa con claridad que usa un cliente no oficial y que WhatsApp podría suspender el número.
- **Bóveda secreta**: un espacio oculto y cifrado con tu propia clave. No aparece en ninguna lista ni búsqueda, ni el servidor ni un administrador pueden ver lo que guardas, y se cierra sola al dejarla de usar.
- **Paint**: editor de dibujo propio con pincel, borrador, líneas, figuras, relleno, texto, cuentagotas, paleta, deshacer y guardar en Imágenes.
- **Diagramas** (draw.io), **Pizarra** (Excalidraw) y **Código** (el editor de VS Code): guardan en tus archivos; draw.io puede alojarse en tu propio servidor.
- **Correo profesional**: varias cuentas por persona, alias con remitente principal, firma en HTML y un editor con formato (estilos, letras, colores, listas, enlaces, imágenes). Respuestas y reenvíos con la cita en HTML.
- **Videos MKV con audio y subtítulos**: el servidor prepara una sola vez las películas cuyo audio el navegador no reproduce (AC3, E-AC3, DTS), copiando la imagen sin perder calidad. Después se ven como un archivo normal: se adelanta al instante, se elige la pista de audio y los subtítulos, y todo va sincronizado. También lee subtítulos .srt externos.
- **Gestor de transferencias**: barra con el avance de cada subida (velocidad, tiempo restante, cancelar). Los videos grandes se reproducen sin descargarse completos y las descargas van directo al navegador.
- **Avatares**: cinco fotos por defecto (perro, gato, persona, balón y partitura) o la tuya. Cada cuenta, contacto y chat muestra una foto en lugar de círculos con iniciales.
- **Iconos del escritorio arrastrables** a cualquier lugar, recordados en tu cuenta, con «Ordenar iconos».
- **Logo del sistema a elegir**: el actual o el clásico (el husky y la gata).

### Administración
- Tu cuenta aparece primero; puedes revisar los archivos de cada persona **carpeta por carpeta** y eliminar contenido que infrinja derechos de autor, con un motivo que le llega como notificación.
- **Registro** de todo lo que hacen los administradores (ver, abrir, eliminar, cambiar roles o cuotas).
- Quitarte el rol de administrador pide tu contraseña y muestra una advertencia.
- Cuotas de hasta 50 GB por cuenta y archivos de hasta 50 GB.

### Mejoras y correcciones
- iCloud envía correo (siempre por el puerto 587 con STARTTLS) y explica qué usuario usar.
- Colores para todas las apps en el tema Grafito, con iconos dibujados para las nuevas.
- Los widgets de monedas, reloj mundial, sistema y recientes ya no cortan los datos.
- WhatsApp no ocupa conexiones extra del navegador y no repite chats.
- El servidor ya no se cae si la base de datos está ocupada.
- El texto «Abriendo con…» muestra el motor real (ONLYOFFICE o Euro-Office).
- El demo en línea se retiró.

## 2.3 — 17 de noviembre de 2026
- Correo real (IMAP/SMTP) con contraseña cifrada, calendario y tareas, versiones de archivos y copias de seguridad, tienda de apps, panel de administración, ONLYOFFICE y Euro-Office probados de punta a punta, navegador virtual (Neko) y WhatsApp Web dentro de Sotos.

## 2.2 — 17 de noviembre de 2026
- Logo nuevo, once widgets, juegos de Dos Lunas y de la sala clásica por separado, miniaturas de video, portadas de música, carpetas con símbolo y animaciones de ventana.

## 2.1 — 16 de noviembre de 2026
- Mundos (muro, carpeta y chat compartidos), notificaciones, contactos con vCard, visor de PDF propio, carátulas de música y el tema Grafito.

## 2.0 — 14 de noviembre de 2026
- Reconstrucción completa: archivos reales en la nube, cuentas, sincronización en vivo, Word/Excel/PowerPoint con archivos de Office auténticos, navegador con proxy, terminal, enlaces para compartir e instaladores.
