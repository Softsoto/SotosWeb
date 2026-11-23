/* ============================================================
   Sotos — temas de época
   Cinco escritorios que recuerdan épocas de los sistemas de escritorio, con arte, fondos,
   sonidos y nombres propios (sin logos ni marcas de nadie). Se suman a «Sotos» y «Grafito».
     familia "win": barra de tareas abajo + menú Inicio (o pantalla de mosaicos en Mosaico)
     familia "mac": barra de menú arriba + dock abajo con lupa
   © 2026 Sebastian Sotomontes
   ============================================================ */
export const ERAS = {
  prado:    { name: "Prado",    year: "2001", family: "win", start: "menu",   wall: "era-prado",    accent: "#2f6fd8", desc: "Barra azul brillante, botón verde de Inicio y ventanas de esquinas redondas", group: false, sound: "prado" },
  cristal:  { name: "Cristal",  year: "2007", family: "win", start: "menu",   wall: "era-cristal",  accent: "#3aa0b8", desc: "Vidrio oscuro translúcido, botón redondo y barra negra brillante", group: false, sound: "cristal" },
  vidrio:   { name: "Vidrio",   year: "2009", family: "win", start: "menu",   wall: "era-vidrio",   accent: "#1f8fb3", desc: "Vidrio claro, barra de íconos agrupados y menú Inicio con buscador", group: true, sound: "vidrio" },
  mosaico:  { name: "Mosaico",  year: "2012", family: "win", start: "screen", wall: "era-mosaico",  accent: "#2a7f62", desc: "Pantalla de mosaicos vivos y un escritorio plano de bordes rectos", group: true, sound: "mosaico" },
  aluminio: { name: "Aluminio", year: "Mac",  family: "mac", start: null,     wall: "era-aluminio", accent: "#3478c6", desc: "Barra de menú arriba, botones de semáforo y dock con lupa", group: false, sound: "aluminio" },
};
export const eraOf = (skin) => ERAS[skin] || null;
export const isWinSkin = (skin) => ERAS[skin]?.family === "win";
export const isMacSkin = (skin) => ERAS[skin]?.family === "mac";
export const ERA_WALL_IDS = Object.values(ERAS).map(e => e.wall);
