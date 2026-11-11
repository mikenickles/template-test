import { buildApp } from "./app.ts";
import { isLoopback, loadConfig } from "./config.ts";

const cfg = loadConfig();

if (!isLoopback(cfg.host) && !cfg.accessToken) {
  console.error(
    `Lyra won't listen on ${cfg.host} without a password.\n` +
      `Set LYRA_ACCESS_TOKEN in .env (for example: ${"openssl rand -hex 24"}), or use LYRA_HOST=127.0.0.1.`,
  );
  process.exit(1);
}

const app = await buildApp(cfg);
await app.listen({ host: cfg.host, port: cfg.port });

const local = `http://localhost:${cfg.port}`;
console.log(`\nLyra is running.\n  On this computer: ${local}`);
if (!isLoopback(cfg.host)) {
  console.log(`  On your phone:    http://<this computer's Tailscale name>:${cfg.port}/?token=${cfg.accessToken}`);
  console.log("  Open the phone link once; it remembers you after that.");
}
console.log(`  Data folder:      ${cfg.dataDir}\n`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
