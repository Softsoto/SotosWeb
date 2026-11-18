/* Sotos — Monaco (el editor de VS Code, MIT) con sus workers empaquetados por Vite.
   Se carga solo al abrir el editor de código. © 2026 Sebastian Sotomontes */
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};
// colores propios de Sotos (papel y tinta en claro; carbón en oscuro)
monaco.editor.defineTheme("sotos-claro", { base: "vs", inherit: true, rules: [], colors: { "editor.background": "#fbf8f1", "editorLineNumber.foreground": "#b3a993", "editor.lineHighlightBackground": "#f1ebdd" } });
monaco.editor.defineTheme("sotos-oscuro", { base: "vs-dark", inherit: true, rules: [], colors: { "editor.background": "#1d1f22", "editorLineNumber.foreground": "#5b6068", "editor.lineHighlightBackground": "#26292d" } });
export default monaco;
