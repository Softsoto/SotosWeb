/* ============================================================
   Sotos — apps de la casa que corren con el SDK (web/public/apps/<id>/)
   Se instalan desde la Tienda como cualquier app. Corren aisladas, igual que una app
   de terceros, y piden todo por el SDK (archivos que eliges, datos en tu cuenta, avisos).
   Este catálogo lo leen el escritorio (para la Tienda) y el servidor (para sus permisos).
   sdk: false → corre como página de confianza (la necesita el afinador por el micrófono).
   © 2026 Sebastian Sotomontes
   ============================================================ */
export const APPS_CASA = [
  { id: "lector", name: "Lector", icon: "menu_book", color: "#7a4e2a", cat: "Entretenimiento", size: { w: 1040, h: 760 },
    desc: "Libros EPUB y cómics CBZ: recuerda la página en la que ibas, modo noche y tamaño de letra.", permissions: ["files.read", "storage"], opens: ["epub", "cbz", "txt"] },
  { id: "solitario", name: "Solitario", icon: "playing_cards", color: "#2f6b45", cat: "Juegos", size: { w: 1000, h: 720 },
    desc: "El solitario de siempre con baraja propia: deshacer, pistas, racha y mejores tiempos.", permissions: ["storage"] },
  { id: "palabras", name: "Palabras", icon: "text_fields", color: "#a2562c", cat: "Juegos", size: { w: 980, h: 740 },
    desc: "Sopa de letras y crucigramas en español que se arman solos, con reto del día.", permissions: ["storage"] },
  { id: "rompecabezas", name: "Rompecabezas", icon: "extension", color: "#5a4a8a", cat: "Juegos", size: { w: 1040, h: 760 },
    desc: "Arma tus propias fotos: elige una y la parte en 12, 24, 48 o 96 piezas.", permissions: ["files.read", "storage"], opens: ["jpg", "jpeg", "png", "webp"] },
  { id: "ritmos", name: "Caja de ritmos", icon: "graphic_eq", color: "#b23a2e", cat: "Música", size: { w: 1040, h: 680 },
    desc: "Arma ritmos de 16 pasos con bombo, caja, guacharaca, tambora y campana, y guárdalos en .wav.", permissions: ["files.write", "storage"] },
  { id: "afinador", name: "Afinador", icon: "tune", color: "#1f6f78", cat: "Música", size: { w: 620, h: 660 }, sdk: false,
    desc: "Afina guitarra, tiple o ukelele con el micrófono, y metrónomo con acentos." },
  { id: "pixelart", name: "Pixel art", icon: "grid_4x4", color: "#3a6ea5", cat: "Creatividad", size: { w: 1100, h: 760 },
    desc: "Dibujos de píxeles con paletas retro, animación cuadro a cuadro y exportación a PNG o GIF.", permissions: ["files.read", "files.write", "storage"], opens: [] },
  { id: "memes", name: "Memes y stickers", icon: "add_reaction", color: "#c27c0e", cat: "Creatividad", size: { w: 1060, h: 760 },
    desc: "Texto arriba y abajo, recorte y borrador para quitar el fondo; guarda stickers listos para WhatsApp.", permissions: ["files.read", "files.write"], opens: ["jpg", "jpeg", "png", "webp"] },
  { id: "diario", name: "Diario", icon: "auto_stories", color: "#8a3f5f", cat: "Personal", size: { w: 980, h: 720 },
    desc: "Una entrada al día con tu estado de ánimo y un calendario de colores por mes.", permissions: ["storage", "files.write"] },
  { id: "pelis", name: "Películas y series", icon: "live_tv", color: "#3c4a5c", cat: "Entretenimiento", size: { w: 1040, h: 740 },
    desc: "Lo que viste, tu nota y lo que quieres ver, con estadísticas del año.", permissions: ["storage", "files.write"] },
  // ---- avanzadas: muestran lo que se puede hacer con el SDK ----
  { id: "soto", name: "SOTO", icon: "enhanced_encryption", color: "#b8452f", cat: "Seguridad", size: { w: 980, h: 700 },
    desc: "Abre y crea archivos .soto cifrados con AES-256-GCM y scrypt, compatibles con SOTO de escritorio.", permissions: ["files.read", "files.write"], opens: ["soto"] },
  { id: "claves", name: "Claves", icon: "key", color: "#3d4a5c", cat: "Seguridad", size: { w: 1000, h: 700 },
    desc: "Gestor de contraseñas cifrado con el sistema de SOTO: solo tú tienes la clave maestra.", permissions: ["storage", "files.read", "files.write"] },
  { id: "tablero", name: "Tablero", icon: "view_quilt", color: "#2f6b8a", cat: "Productividad", size: { w: 1180, h: 760 },
    desc: "Tableros tipo kanban con columnas, tarjetas, etiquetas, fechas y listas de chequeo.", permissions: ["storage", "files.write"] },
  { id: "visor3d", name: "Visor 3D", icon: "category", color: "#5b4b8a", cat: "Creatividad", size: { w: 1100, h: 760 },
    desc: "Modelos STL y OBJ en 3D con WebGL: girar, acercar, medidas y captura en PNG.", permissions: ["files.read", "files.write"], opens: ["stl", "obj"] },
  { id: "fotos-edit", name: "Editor de fotos", icon: "brush", color: "#a2562c", cat: "Creatividad", size: { w: 1180, h: 780 },
    desc: "Brillo, contraste, color, filtros, recorte, giro y viñeta, con historial y guardado de una copia.", permissions: ["files.read", "files.write"], opens: ["jpg", "jpeg", "png", "webp"] },
  // ---- con internet (permiso «net»): Sotos hace la petición solo a estos sitios ----
  { id: "clima", name: "Clima", icon: "partly_cloudy_day", color: "#2f7fa8", cat: "Internet", size: { w: 1000, h: 720 },
    desc: "Pronóstico por horas y por días de cualquier ciudad, con Open-Meteo.", permissions: ["net", "storage"], hosts: ["api.open-meteo.com", "geocoding-api.open-meteo.com"] },
  { id: "monedas", name: "Monedas", icon: "currency_exchange", color: "#3d7a3f", cat: "Internet", size: { w: 900, h: 680 },
    desc: "Convierte entre más de 150 monedas con la tasa del día y su historia.", permissions: ["net", "storage"], hosts: ["open.er-api.com", "api.frankfurter.dev"] },
  { id: "wiki", name: "Enciclopedia", icon: "travel_explore", color: "#4a4a4a", cat: "Internet", size: { w: 1040, h: 760 },
    desc: "Busca en Wikipedia en español, lee artículos y mira qué pasó un día como hoy.", permissions: ["net", "storage", "files.write"], hosts: ["es.wikipedia.org", "api.wikimedia.org"] },
  { id: "sismos", name: "Sismos", icon: "earthquake", color: "#8a4a2f", cat: "Internet", size: { w: 1180, h: 760 },
    desc: "Los sismos del mundo en un mapa casi en vivo, con aviso de los fuertes y búsqueda en el archivo desde 1900.", permissions: ["net", "notify", "storage"], hosts: ["earthquake.usgs.gov", "cdn.jsdelivr.net"] },
  { id: "orbita", name: "Estación espacial", icon: "satellite_alt", color: "#2c3e63", cat: "Internet", size: { w: 1180, h: 740 },
    desc: "Dónde está la Estación Espacial Internacional ahora mismo, su órbita, la noche en la Tierra y cuándo pasa cerca de ti.", permissions: ["net", "storage"], hosts: ["api.wheretheiss.at", "cdn.jsdelivr.net"] },
  // ---- trabajo y finanzas (para empresas y para uso personal) ----
  { id: "facturas", name: "Facturas", icon: "receipt_long", color: "#b8452f", cat: "Negocios", size: { w: 1220, h: 800 },
    desc: "Cotizaciones, cuentas de cobro y facturas con IVA, retenciones y abonos, en PDF con tu logo, e informe para el contador.", permissions: ["storage", "files.read", "files.write"] },
  { id: "crm", name: "Ventas", icon: "handshake", color: "#2f6b8a", cat: "Negocios", size: { w: 1240, h: 800 },
    desc: "CRM con embudo de negocios, pronóstico, actividades con recordatorios e historial de cada cliente.", permissions: ["storage", "notify", "files.read", "files.write"] },
  { id: "horas", name: "Horas", icon: "timer", color: "#5a4a8a", cat: "Negocios", size: { w: 1080, h: 760 },
    desc: "Cronómetro por proyecto y cliente, planilla semanal, tarifas, horas presupuestadas e informe en PDF.", permissions: ["storage", "files.write"] },
  { id: "finanzas", name: "Finanzas", icon: "account_balance_wallet", color: "#3d7a3f", cat: "Personal", size: { w: 1180, h: 780 },
    desc: "Tus cuentas en pesos y dólares, presupuesto, extractos del banco con reglas, gastos fijos y metas de ahorro.", permissions: ["storage", "files.read", "files.write", "net"], hosts: ["open.er-api.com"] },
  // ---- avanzadas sin internet ----
  { id: "ajedrez", name: "Ajedrez", icon: "chess", color: "#5b4630", cat: "Juegos", size: { w: 1080, h: 780 },
    desc: "Ajedrez contra un motor propio de cuatro niveles o entre dos personas, con pistas, deshacer y PGN.", permissions: ["storage", "files.write"] },
  { id: "datos", name: "Datos", icon: "table_chart", color: "#2f6b5a", cat: "Productividad", size: { w: 1180, h: 780 },
    desc: "Abre tablas CSV o JSON: resumen de cada columna, filtros, columnas con fórmulas y gráficas en PNG o SVG.", permissions: ["files.read", "files.write"], opens: ["csv", "tsv", "json"] },
];
export const CASA_IDS = APPS_CASA.map(a => a.id);
