# Historial de cambios de Sotos

Todas las versiones de Sotos, de la más reciente a la más antigua.
© 2026 Sebastian Sotomontes · Licencia MIT

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
