import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// one version for the phone and the computer: the Android versionName
const version = readFileSync(new URL("./android/app/build.gradle", import.meta.url), "utf8").match(/versionName "([^"]+)"/)![1];

const api = `http://127.0.0.1:${process.env.LYRA_PORT ?? 4310}`;

export default defineConfig({
  root: "web",
  plugins: [react()],
  define: { __LYRA_VERSION__: JSON.stringify(version) },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": api, "/auth": api },
  },
});
