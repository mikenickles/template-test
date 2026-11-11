// Renders web/public/icon.svg to the PNG sizes phones need. Run: node scripts/icons.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright is a dev-only tool here; it is not one of Lyra's dependencies.
const { chromium } = createRequire(import.meta.url)("playwright");

const svg = readFileSync(new URL("../web/public/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180]]) {
  await page.setViewportSize({ width: size, height: size });
  // full-bleed square: phones apply their own rounding
  await page.setContent(`<style>html,body{margin:0;background:#131416}</style>${svg.replace('rx="15"', 'rx="0"').replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../web/public/${name}`, import.meta.url).pathname });
}
await browser.close();
