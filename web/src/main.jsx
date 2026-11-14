/* Sotos OS — © 2026 Sebastian Sotomontes */
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/onest/700.css";
import "@fontsource/onest/800.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/800.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "material-symbols/rounded.css";
import "./os/styles.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { OS } from "./os/shell.jsx";
import { SharePage } from "./os/share-page.jsx";

// /#/s/<token> → página pública de un elemento compartido; si no, el escritorio
const share = /^#\/s\/([a-f0-9]{32})/.exec(location.hash);
if (share) document.body.classList.add("is-share");
createRoot(document.getElementById("root")).render(share ? <SharePage token={share[1]} /> : <OS />);
window.addEventListener("hashchange", () => { if (/^#\/s\//.test(location.hash) !== !!share) location.reload(); });
