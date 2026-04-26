import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import "./styles.css";

function installPageProtection() {
  const blockedCombos = new Set([
    "F10",
    "F12",
    "CTRL+SHIFT+I",
    "CTRL+SHIFT+J",
    "CTRL+SHIFT+C",
    "CTRL+U",
    "CTRL+S",
    "CTRL+P",
    "META+ALT+I",
    "META+ALT+J",
    "META+ALT+C",
    "META+U",
    "META+S",
    "META+P"
  ]);

  const warn = (message: string) => {
    window.alert(message);
  };

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    warn("O botao direito do mouse esta desativado nesta pagina.");
  });

  document.addEventListener("keydown", (event) => {
    const combo = [
      event.ctrlKey ? "CTRL" : "",
      event.metaKey ? "META" : "",
      event.altKey ? "ALT" : "",
      event.shiftKey ? "SHIFT" : "",
      event.key.toUpperCase()
    ]
      .filter(Boolean)
      .join("+");

    if (blockedCombos.has(combo)) {
      event.preventDefault();
      event.stopPropagation();
      warn("Essa acao foi bloqueada nesta pagina.");
    }
  });

  window.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });
}

installPageProtection();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
