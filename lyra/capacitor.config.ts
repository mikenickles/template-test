import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lyra.chief",
  appName: "Lyra",
  webDir: "web/dist",
  android: {
    // Lyra talks only to HTTPS APIs; a local model server on your network is the one http exception.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
};

export default config;
