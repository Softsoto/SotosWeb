/* ============================================================
   Sotos OS — mock data & registry
   ============================================================ */

// ---- App registry. icon = Material Symbol ligature, color = tile bg ----
const APPS = [
  { id: "launchpad",name: "Aplicaciones", icon: "apps",           color: "#0a84ff", comp: "LaunchpadApp", size: { w: 940, h: 640 } },
  { id: "files",   name: "Archivos",  icon: "folder",            color: "#4a90e2", comp: "FilesApp",     size: { w: 820, h: 540 } },
  { id: "docs",    name: "Documentos",icon: "description",       color: "#2b579a", comp: "DocsApp",      size: { w: 880, h: 620 } },
  { id: "sheets",  name: "Hojas",     icon: "table_chart",       color: "#217346", comp: "SheetsApp",    size: { w: 900, h: 580 } },
  { id: "slides",  name: "Presentaciones", icon: "slideshow",    color: "#c43e1c", comp: "SlidesApp",    size: { w: 900, h: 600 } },
  { id: "editor",  name: "Notas",     icon: "edit_note",         color: "#34c759", comp: "EditorApp",    size: { w: 680, h: 560 } },
  { id: "gallery", name: "Galería",   icon: "photo_library",     color: "#ff375f", comp: "GalleryApp",   size: { w: 780, h: 540 } },
  { id: "music",   name: "Música",    icon: "music_note",        color: "#fc3c44", comp: "MusicApp",     size: { w: 720, h: 500 } },
  { id: "video",   name: "Vídeo",     icon: "movie",             color: "#8e5cf6", comp: "VideoApp",     size: { w: 760, h: 520 } },
  { id: "pdf",     name: "PDF",       icon: "picture_as_pdf",    color: "#e2483d", comp: "PdfApp",       size: { w: 700, h: 620 } },
  { id: "mail",    name: "Correo",    icon: "mail",              color: "#2f6fed", comp: "MailApp",      size: { w: 880, h: 580 } },
  { id: "chat",    name: "Mensajes",  icon: "chat_bubble",       color: "#22c55e", comp: "ChatApp",      size: { w: 780, h: 540 } },
  { id: "browser", name: "Navegador", icon: "language",          color: "#0aa5b5", comp: "BrowserApp",   size: { w: 880, h: 580 } },
  { id: "terminal",name: "Terminal",  icon: "terminal",          color: "#22262e", comp: "TerminalApp",  size: { w: 660, h: 440 } },
  { id: "settings",name: "Ajustes",   icon: "settings",          color: "#7d8590", comp: "SettingsApp",  size: { w: 720, h: 540 } },
  { id: "web",     name: "Web",       icon: "public",            color: "#0aa5b5", comp: "WebViewApp",   size: { w: 1000, h: 670 } },
  { id: "store",   name: "Tienda",    icon: "shopping_bag",      color: "#0a84ff", comp: "StoreApp",     size: { w: 800, h: 560 } },
  { id: "trash",   name: "Papelera",  icon: "delete",            color: "#7d8590", comp: "TrashApp",     size: { w: 760, h: 520 } },
  { id: "games",   name: "Juegos",    icon: "sports_esports",    color: "#ff375f", comp: "GamesApp",     size: { w: 560, h: 620 } },
];
const APP_BY_ID = Object.fromEntries(APPS.map(a => [a.id, a]));

// dock order
const DOCK_IDS = ["launchpad","files","docs","sheets","slides","gallery","mail","chat","browser","music","games","__div__","terminal","store","settings"];

// extension -> app routing
const ROUTE = { docx:"docs", doc:"docs", txt:"editor", code:"editor", xlsx:"sheets", csv:"sheets",
  pptx:"slides", ppt:"slides", pdf:"pdf", img:"gallery", audio:"music", video:"video" };

// file-type visual metadata (FileGlyph)
const TYPE_META = {
  folder: { kind: "folder", color: "#54a0ff" },
  docx:   { kind: "office", letter: "W", color: "#2b579a" },
  doc:    { kind: "office", letter: "W", color: "#2b579a" },
  xlsx:   { kind: "office", letter: "X", color: "#217346" },
  csv:    { kind: "office", letter: "X", color: "#217346" },
  pptx:   { kind: "office", letter: "P", color: "#c43e1c" },
  ppt:    { kind: "office", letter: "P", color: "#c43e1c" },
  pdf:    { kind: "pdf",    letter: "PDF", color: "#e2483d" },
  img:    { kind: "img" },
  audio:  { kind: "icon", icon: "music_note", color: "#fc3c44" },
  video:  { kind: "icon", icon: "movie", color: "#8e5cf6" },
  txt:    { kind: "icon", icon: "description", color: "#8a929c" },
  code:   { kind: "icon", icon: "code", color: "#0aa5b5" },
};

// right-click menu for files
const CTX_FILE = [
  { id: "open",    label: "Abrir",          icon: "open_in_new" },
  { id: "openpc",  label: "Abrir en mi PC", icon: "download_for_offline" },
  { sep: true },
  { id: "copy",    label: "Copiar",         icon: "content_copy" },
  { id: "cut",     label: "Cortar",         icon: "content_cut" },
  { id: "link",    label: "Crear enlace",   icon: "link" },
  { id: "share",   label: "Compartir con…", icon: "group_add" },
  { id: "download",label: "Descargar",      icon: "download" },
  { sep: true },
  { id: "rename",  label: "Renombrar",      icon: "drive_file_rename_outline" },
  { id: "props",   label: "Propiedades",    icon: "info" },
  { id: "delete",  label: "Eliminar",       icon: "delete", danger: true },
];

// web services launcher. embed = incrustable en iframe; sin embed = se abre en pestaña
const WEB_SERVICES = [
  { name: "YouTube",   icon: "play_circle",  color: "#ff0000", url: "https://www.youtube.com",   cat: "Multimedia", embed: "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?rel=0" },
  { name: "Wikipedia", icon: "menu_book",    color: "#3a3a3a", url: "https://es.wikipedia.org",  cat: "Web",        embed: "https://es.m.wikipedia.org/wiki/Wikipedia:Portada" },
  { name: "Maps",      icon: "map",          color: "#34a853", url: "https://maps.google.com",   cat: "Web",        embed: "https://maps.google.com/maps?q=Madrid&z=11&output=embed" },
  { name: "Spotify",   icon: "graphic_eq",   color: "#1db954", url: "https://open.spotify.com",  cat: "Multimedia", embed: "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?theme=0" },
  { name: "Gmail",     icon: "mail",         color: "#ea4335", url: "https://mail.google.com",   cat: "Correo" },
  { name: "Outlook",   icon: "mail",         color: "#0a78d4", url: "https://outlook.live.com",  cat: "Correo" },
  { name: "iCloud Mail",icon: "cloud",       color: "#3b8ee0", url: "https://www.icloud.com/mail",cat: "Correo" },
  { name: "Google",    icon: "travel_explore",color:"#4285f4", url: "https://www.google.com",    cat: "Web" },
  { name: "Drive",     icon: "add_to_drive", color: "#1aa260", url: "https://drive.google.com",  cat: "Productividad" },
  { name: "Amazon",    icon: "shopping_cart",color: "#ff9900", url: "https://www.amazon.com",    cat: "Compras" },
  { name: "X",         icon: "tag",          color: "#101419", url: "https://x.com",            cat: "Social" },
  { name: "Facebook",  icon: "groups",       color: "#1877f2", url: "https://www.facebook.com",  cat: "Social" },
  { name: "Instagram", icon: "photo_camera", color: "#e1306c", url: "https://www.instagram.com", cat: "Social" },
  { name: "WhatsApp",  icon: "chat",         color: "#25d366", url: "https://web.whatsapp.com",  cat: "Social" },
];

// Office → versión web real
const OFFICE_WEB = {
  word:       { name: "Word para la web",       letter: "W", color: "#2b579a", ms: "https://www.office.com/launch/word",       g: "https://docs.google.com/document/u/0/",     editor: "docs" },
  excel:      { name: "Excel para la web",      letter: "X", color: "#217346", ms: "https://www.office.com/launch/excel",      g: "https://docs.google.com/spreadsheets/u/0/", editor: "sheets" },
  powerpoint: { name: "PowerPoint para la web", letter: "P", color: "#c43e1c", ms: "https://www.office.com/launch/powerpoint", g: "https://docs.google.com/presentation/u/0/", editor: "slides" },
};
const OFFICE_OF_TYPE = { docx: "word", doc: "word", xlsx: "excel", csv: "excel", pptx: "powerpoint", ppt: "powerpoint" };

// ---- Wallpapers (CSS gradients — no external assets) ----
const WALLPAPERS = [
  { id: "azure",   name: "Azure",   css: "radial-gradient(120% 120% at 15% 10%, #4f8cf0 0%, #2f63d6 38%, #1d3aa0 100%)" },
  { id: "dusk",    name: "Ocaso",   css: "linear-gradient(160deg, #1e2a78 0%, #5b3a9e 45%, #c9568f 100%)" },
  { id: "mint",    name: "Menta",   css: "radial-gradient(120% 120% at 80% 10%, #46d6b6 0%, #1a9e8a 45%, #0d5e6b 100%)" },
  { id: "graphite",name: "Grafito", css: "radial-gradient(120% 120% at 20% 0%, #3a4150 0%, #232830 55%, #14171d 100%)" },
  { id: "sand",    name: "Arena",   css: "linear-gradient(160deg, #f3c98b 0%, #e08a6a 50%, #b5567a 100%)" },
  { id: "aurora",  name: "Aurora",  css: "linear-gradient(135deg, #0f2027 0%, #1f6f8b 40%, #2bd4c4 75%, #8be9c0 100%)" },
];

// ---- Accent presets ----
const ACCENTS = ["#2f6fed", "#34c759", "#8e5cf6", "#ff375f", "#ff8a00", "#0aa5b5"];

// ---- Mock filesystem (Files app) ----
const FS = {
  name: "Sotos", type: "root", children: [
    { name: "Documentos", type: "folder", children: [
      { name: "Plan de negocio.docx", type: "docx", size: "86 KB", mod: "2 jun" },
      { name: "Acuerdo de colaboración.docx", type: "docx", size: "120 KB", mod: "1 jun" },
      { name: "Informe de estado.docx", type: "docx", size: "54 KB", mod: "31 may" },
      { name: "Gastos de viaje.docx", type: "docx", size: "38 KB", mod: "30 may" },
      { name: "Presupuesto marketing.xlsx", type: "xlsx", size: "42 KB", mod: "30 may" },
      { name: "Factura finanzas.xlsx", type: "xlsx", size: "28 KB", mod: "28 may" },
      { name: "Tendencias de marca.pptx", type: "pptx", size: "3.4 MB", mod: "27 may" },
      { name: "Proyecto música.pptx", type: "pptx", size: "5.1 MB", mod: "26 may" },
      { name: "Concert Undersea.pdf", type: "pdf", size: "180 KB", mod: "24 may" },
      { name: "Notas reunión.txt", type: "txt", size: "3 KB", mod: "1 jun" },
    ]},
    { name: "Imágenes", type: "folder", children: [
      { name: "Playa.jpg", type: "img", size: "2.4 MB", mod: "30 may", css: "linear-gradient(160deg,#9be4ff,#3ba0e0 60%,#f6d98a)" },
      { name: "Montaña.jpg", type: "img", size: "3.1 MB", mod: "30 may", css: "linear-gradient(160deg,#cdd6e0,#6b7d93 55%,#2d3a4d)" },
      { name: "Ciudad.jpg", type: "img", size: "1.8 MB", mod: "29 may", css: "linear-gradient(160deg,#ffb88c,#c45a8a 60%,#3a2b5e)" },
      { name: "Glaciar.jpg", type: "img", size: "2.0 MB", mod: "27 may", css: "linear-gradient(160deg,#bdeaf0,#4fb0c4 60%,#1e5e74)" },
    ]},
    { name: "Música", type: "folder", children: [
      { name: "Indie Disco.mp3", type: "audio", size: "5.2 MB", mod: "21 may" },
      { name: "Synthwave.mp3", type: "audio", size: "6.7 MB", mod: "20 may" },
    ]},
    { name: "Vídeos", type: "folder", children: [
      { name: "Demo producto.mp4", type: "video", size: "44 MB", mod: "19 may" },
    ]},
    { name: "Proyectos", type: "folder", children: [
      { name: "web-sotos", type: "folder", children: [
        { name: "index.html", type: "code", size: "12 KB", mod: "3 jun" },
        { name: "estilos.css", type: "code", size: "8 KB", mod: "3 jun" },
      ]},
      { name: "Roadmap.txt", type: "txt", size: "4 KB", mod: "2 jun" },
    ]},
    { name: "Bienvenido.txt", type: "txt", size: "1 KB", mod: "3 jun" },
  ]
};

// ---- Mail ----
const MAIL = [
  { id:1, from:"Equipo Sotos", addr:"hola@sotos.app", subject:"Bienvenido a tu nuevo ordenador en la nube", time:"09:24", unread:true, fav:true,
    body:"¡Hola!\n\nTu escritorio Sotos ya está listo. Todos tus archivos, apps y ajustes te siguen allá donde inicies sesión — sin instalar nada.\n\nAbre la Tienda para añadir más herramientas y pásate por Ajustes para personalizar el fondo y el color.\n\nUn saludo,\nEl equipo de Sotos" },
  { id:2, from:"Lucía Romero", addr:"lucia@studio.co", subject:"Revisión de la propuesta Q3", time:"08:51", unread:true, fav:false,
    body:"Hola,\n\nHe dejado comentarios en la propuesta. ¿Podemos verlo esta tarde en una llamada rápida?\n\nGracias,\nLucía" },
  { id:3, from:"Facturación", addr:"billing@sotos.app", subject:"Tu recibo de mayo", time:"ayer", unread:false, fav:false,
    body:"Adjuntamos el recibo correspondiente al plan Pro de mayo. Gracias por confiar en Sotos." },
  { id:4, from:"Marcos Gil", addr:"marcos@equipo.io", subject:"Carpeta compartida: web-sotos", time:"ayer", unread:false, fav:true,
    body:"Te he compartido la carpeta del proyecto con permisos de edición. ¡A darle!" },
  { id:5, from:"Boletín diseño", addr:"news@designweekly.com", subject:"10 ideas de interfaces esta semana", time:"lun", unread:false, fav:false,
    body:"Las mejores interfaces de la semana, seleccionadas para ti." },
];

// ---- Chat ----
const CHATS = [
  { id:"equipo", name:"Equipo Producto", group:true, color:"#2f6fed", last:"Lucía: ¿lo vemos a las 5?", time:"09:31", unread:2,
    messages:[
      { me:false, who:"Marcos", text:"Buenas 👋 he subido el roadmap a la carpeta compartida", time:"09:02" },
      { me:false, who:"Lucía", text:"Genial, lo reviso ahora", time:"09:10" },
      { me:true,  who:"Tú", text:"Yo añado las fechas del Q3 esta mañana", time:"09:18" },
      { me:false, who:"Lucía", text:"¿lo vemos a las 5?", time:"09:31" },
    ]},
  { id:"lucia", name:"Lucía Romero", group:false, color:"#ff375f", last:"Perfecto, hablamos.", time:"08:55", unread:0,
    messages:[
      { me:false, who:"Lucía", text:"Te dejé comentarios en la propuesta", time:"08:50" },
      { me:true,  who:"Tú", text:"Mil gracias, los miro", time:"08:53" },
      { me:false, who:"Lucía", text:"Perfecto, hablamos.", time:"08:55" },
    ]},
  { id:"marcos", name:"Marcos Gil", group:false, color:"#34c759", last:"Tú: hecho ✅", time:"ayer", unread:0,
    messages:[
      { me:false, who:"Marcos", text:"¿puedes darme acceso a vídeos?", time:"18:20" },
      { me:true,  who:"Tú", text:"hecho ✅", time:"18:22" },
    ]},
  { id:"soporte", name:"Soporte Sotos", group:false, color:"#7d8590", last:"¿En qué podemos ayudarte?", time:"vie", unread:0,
    messages:[
      { me:false, who:"Soporte", text:"¡Hola! ¿En qué podemos ayudarte?", time:"10:00" },
    ]},
];

// ---- Music (real audio sources) ----
const AUDIO = id => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${id}.mp3`;
const TRACKS = [
  { id:1, title:"Brisa nocturna", artist:"Lumen", album:"Horas azules", dur:"6:13", color:"#2f6fed", src: AUDIO(1) },
  { id:2, title:"Reflejos", artist:"Aria Kael", album:"Cristal", dur:"6:33", color:"#8e5cf6", src: AUDIO(2) },
  { id:3, title:"Estática suave", artist:"Lo-fi Coop", album:"Sesiones", dur:"6:20", color:"#fc3c44", src: AUDIO(3) },
  { id:4, title:"Corriente", artist:"Nimbo", album:"Flujo", dur:"5:54", color:"#0aa5b5", src: AUDIO(4) },
  { id:5, title:"Atardecer 320", artist:"Vega", album:"Órbita", dur:"6:08", color:"#ff8a00", src: AUDIO(5) },
  { id:6, title:"Vidriera", artist:"Aria Kael", album:"Cristal", dur:"6:01", color:"#34c759", src: AUDIO(6) },
];

// ---- Video (real sample sources) ----
const VID = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";
const VIDEOS = [
  { id:1, title:"Demo producto",  sub:"1080p · 1:00", src: VID + "ForBiggerBlazes.mp4", color:"#8e5cf6" },
  { id:2, title:"Big Buck Bunny", sub:"1080p · 10:34", src: VID + "BigBuckBunny.mp4", color:"#2f6fed" },
  { id:3, title:"Elephants Dream",sub:"1080p · 10:53", src: VID + "ElephantsDream.mp4", color:"#0aa5b5" },
  { id:4, title:"For Bigger Fun",  sub:"720p · 1:00",  src: VID + "ForBiggerFun.mp4", color:"#fc3c44" },
];

// ---- default custom shortcuts (user-editable) ----
const DEFAULT_SHORTCUTS = [
  { name:"iLovePDF", url:"https://www.ilovepdf.com", icon:"picture_as_pdf", color:"#e5322d" },
  { name:"Canva",    url:"https://www.canva.com",   icon:"brush",          color:"#7d2ae8" },
];

// ---- Gallery (gradient "photos") ----
const PHOTOS = [
  { name:"Playa", css:"linear-gradient(160deg,#9be4ff,#3ba0e0 60%,#f6d98a)" },
  { name:"Montaña", css:"linear-gradient(160deg,#cdd6e0,#6b7d93 55%,#2d3a4d)" },
  { name:"Ciudad", css:"linear-gradient(160deg,#ffb88c,#c45a8a 60%,#3a2b5e)" },
  { name:"Retrato", css:"linear-gradient(160deg,#ffd9c0,#e6a07a 60%,#7d4b46)" },
  { name:"Bosque", css:"linear-gradient(160deg,#b6e3a0,#3f9e6c 60%,#1c4a3a)" },
  { name:"Desierto", css:"linear-gradient(160deg,#f6dca0,#d99457 60%,#8a4a2e)" },
  { name:"Lago", css:"linear-gradient(160deg,#bdeaf0,#4fb0c4 60%,#1e5e74)" },
  { name:"Noche", css:"linear-gradient(160deg,#3a4a78,#1d2347 60%,#0a0e1f)" },
  { name:"Flores", css:"linear-gradient(160deg,#ffc6e0,#e06a9e 60%,#7a3a6e)" },
];

// ---- Store (apps to "install") ----
const STORE_APPS = [
  { name:"Documentos online", icon:"description", color:"#2f6fed", cat:"Productividad", desc:"Procesador de textos en la nube con co-edición." },
  { name:"Hojas online", icon:"table_chart", color:"#1aa260", cat:"Productividad", desc:"Hojas de cálculo con fórmulas y gráficos." },
  { name:"Presentaciones", icon:"slideshow", color:"#ff8a00", cat:"Productividad", desc:"Crea diapositivas y presenta en directo." },
  { name:"Calendario", icon:"calendar_month", color:"#ff375f", cat:"Organización", desc:"Agenda, eventos y recordatorios." },
  { name:"Notas rápidas", icon:"sticky_note_2", color:"#febc2e", cat:"Organización", desc:"Notas adhesivas en tu escritorio." },
  { name:"Mapas", icon:"map", color:"#34c759", cat:"Utilidades", desc:"Explora el mundo y traza rutas." },
  { name:"Calculadora", icon:"calculate", color:"#7d8590", cat:"Utilidades", desc:"Cálculos básicos y científicos." },
  { name:"Cámara", icon:"photo_camera", color:"#8e5cf6", cat:"Multimedia", desc:"Captura fotos con tu webcam." },
  { name:"Código", icon:"code", color:"#0aa5b5", cat:"Desarrollo", desc:"Editor de código con resaltado." },
  { name:"Tareas", icon:"checklist", color:"#22c55e", cat:"Organización", desc:"Listas de tareas y proyectos." },
];

export { APPS, APP_BY_ID, DOCK_IDS, ROUTE, TYPE_META, CTX_FILE, WEB_SERVICES, OFFICE_WEB, OFFICE_OF_TYPE, WALLPAPERS, ACCENTS, FS, MAIL, CHATS, TRACKS, VIDEOS, PHOTOS, STORE_APPS, DEFAULT_SHORTCUTS };
