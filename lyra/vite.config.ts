import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = `http://127.0.0.1:${process.env.LYRA_PORT ?? 4310}`;

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": api, "/auth": api },
  },
});
