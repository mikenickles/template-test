// Renders Lyra's launcher icons and splash screens for Android. Run: node scripts/android-icons.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Playwright is a dev-only tool here; it is not one of Lyra's dependencies.
const { chromium } = createRequire(import.meta.url)("playwright");
const res = new URL("../android/app/src/main/res/", import.meta.url).pathname;
const INK = "#131416";

// The mark from web/src/LyraMark.tsx, on a 48-unit grid.
const mark = (paper = "#f3f1ea", accent = "#c4ef4b") => `
  <path d="M14 7.5L21 19L35 21.5L31 39L16.5 35.5L21 19" fill="none" stroke="${paper}" stroke-opacity="0.42" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="14" cy="7.5" r="6.5" fill="${accent}" opacity="0.3"/>
  <circle cx="14" cy="7.5" r="4.2" fill="${accent}"/>
  <g fill="${paper}"><circle cx="21" cy="19" r="2.5"/><circle cx="35" cy="21.5" r="2.5"/><circle cx="31" cy="39" r="2.5"/><circle cx="16.5" cy="35.5" r="2.5"/></g>`;

// viewBox centred on the mark (its bounds are roughly x 7..37, y 1..42)
const svg = ({ size, w = size, h = size, pad, bg, shape }) => {
  const span = 48 * pad;
  const vw = (span * w) / Math.min(w, h);
  const vh = (span * h) / Math.min(w, h);
  const cx = 22;
  const cy = 22;
  const back =
    shape === "circle"
      ? `<circle cx="${cx}" cy="${cy}" r="${span / 2}" fill="${INK}"/>`
      : shape === "square"
        ? `<rect x="${cx - span / 2}" y="${cy - span / 2}" width="${span}" height="${span}" rx="${span * 0.22}" fill="${INK}"/>`
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}" style="background:${bg}">${back}${mark()}</svg>`;
};

const pngSize = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, markup, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${markup}`);
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
}

for (const dir of readdirSync(res)) {
  const full = join(res, dir);
  if (!statSync(full).isDirectory()) continue;
  for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png", "splash.png"]) {
    const file = join(full, name);
    try {
      statSync(file);
    } catch {
      continue;
    }
    const { w, h } = pngSize(file);
    if (name === "ic_launcher.png") await render(file, svg({ size: w, pad: 1.25, bg: "transparent", shape: "square" }), w, h);
    if (name === "ic_launcher_round.png") await render(file, svg({ size: w, pad: 1.25, bg: "transparent", shape: "circle" }), w, h);
    // adaptive icon: 108dp canvas, keep the mark inside the 66dp safe zone
    if (name === "ic_launcher_foreground.png") await render(file, svg({ size: w, pad: 108 / 50, bg: "transparent" }), w, h);
    if (name === "splash.png") await render(file, svg({ size: Math.min(w, h), w, h, pad: 3.6, bg: INK }), w, h);
    console.log(`  ${dir}/${name} ${w}x${h}`);
  }
}
await browser.close();
