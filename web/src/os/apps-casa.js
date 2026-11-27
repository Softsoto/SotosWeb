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
];
export const CASA_IDS = APPS_CASA.map(a => a.id);
