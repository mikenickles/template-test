import "@fontsource-variable/bricolage-grotesque/opsz.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Apply the saved accent before the first paint, so the app doesn't flash lime.
try {
  const accent = localStorage.getItem("lyra.accent");
  if (accent) document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.bubbles = localStorage.getItem("lyra.bubbles") || "softer";
} catch {
  // storage unavailable: the default accent shows until settings load
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
