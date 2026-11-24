import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { applySizes } from "./sizes";

applySizes(); // text and avatar size, before the first paint

// Apply the saved accent and look before the first paint, so the app doesn't flash another color.
// (0.66) colors and looks from before 0.66 show as their closest new one until the settings load.
const OLD_ACCENT: Record<string, string> = { lime: "moss", yellow: "honey", red: "orange", maroon: "plum", navy: "denim", indigo: "denim", teal: "pine" };
const OLD_LOOK: Record<string, string> = { radio: "night", zine: "paper", film: "paper" };
try {
  const accent = localStorage.getItem("lyra.accent");
  if (accent) document.documentElement.dataset.accent = OLD_ACCENT[accent] ?? accent;
  document.documentElement.dataset.bubbles = localStorage.getItem("lyra.bubbles") || "softer";
  const look = localStorage.getItem("lyra.theme") || "paper";
  document.documentElement.dataset.theme = OLD_LOOK[look] ?? look;
} catch {
  // storage unavailable: the default accent shows until settings load
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
