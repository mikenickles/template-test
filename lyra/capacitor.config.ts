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
    // a white constellation in the status bar (scripts/avatar.py makes it), tinted Lyra's lime
    LocalNotifications: { smallIcon: "ic_stat_lyra", iconColor: "#8fb82a" },
  },
};

export default config;
