/* ============================================================
   Películas abiertas de ejemplo (Wikimedia Commons, CC BY).
   El banco de muestras que se usaba antes dejó de ser público (403):
   legacyUrl() traduce esas direcciones guardadas a las nuevas.
   © 2026 Sebastian Sotomontes
   ============================================================ */
const W = "https://upload.wikimedia.org/wikipedia/commons/transcoded/";
export const OPEN_MOVIES = [
  { name: "Sintel.webm",          legacy: "ForBiggerBlazes", oldName: "Demo producto.mp4",   url: W + "f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.480p.vp9.webm", credit: "Durian Open Movie Project · CC BY 3.0" },
  { name: "Big Buck Bunny.webm",  legacy: "BigBuckBunny",    oldName: "Big Buck Bunny.mp4",  url: W + "c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm", credit: "Blender Foundation · CC BY 3.0" },
  { name: "Elephants Dream.webm", legacy: "ElephantsDream",  oldName: "Elephants Dream.mp4", url: W + "a/a2/Elephants_Dream_%282006%29.webm/Elephants_Dream_%282006%29.webm.480p.vp9.webm", credit: "Orange Open Movie Team · CC BY 2.5" },
  { name: "Tears of Steel.webm",  legacy: "ForBiggerFun",    oldName: "For Bigger Fun.mp4",  url: W + "1/10/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm.480p.vp9.webm", credit: "Blender Foundation · CC BY 3.0" },
];
export function liveUrl(url) {
  if (!url || !url.includes("gtv-videos-bucket")) return url;
  const m = OPEN_MOVIES.find(v => url.includes("/" + v.legacy + "."));
  return m ? m.url : url;
}
export const movieCredit = (url) => OPEN_MOVIES.find(v => v.url === liveUrl(url))?.credit || null;