// Renders Lyra's launcher icons, splash screens and the desktop icon from Kit (Lyra's face),
// orange on white. Run: node scripts/kit-icons.mjs   (needs Playwright, a dev-only tool here)
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = new URL("..", import.meta.url).pathname;
const res = join(root, "android/app/src/main/res");
const ORANGE = "#d2602a";
const WHITE = "#ffffff";
// Kit's body and eyes from web/src/LyraMark.tsx; the body spans x 19..81, y 30..79
const BODY = "M19 70 C19 46 32 30 50 30 C68 30 81 45 81 66 C81 75 77 79 68 79 L30 79 C22 79 19 76 19 70 Z";
const kit = `<path d="${BODY}" fill="${ORANGE}"/><ellipse cx="57" cy="52" rx="2.4" ry="3.4" fill="#1a1a1a"/><ellipse cx="66" cy="52" rx="2.4" ry="3.4" fill="#1a1a1a"/>`;

/** Kit centered in a w×h picture, its body `share` of the shorter side wide. */
function svg(w, h, share, back) {
  const unit = 62 / share; // viewBox units across the shorter side
  const vw = (unit * w) / Math.min(w, h);
  const vh = (unit * h) / Math.min(w, h);
  const x = 50 - vw / 2;
  const y = 54.5 - vh / 2;
  const bg =
    back === "square" ? `<rect x="${x}" y="${y}" width="${vw}" height="${vh}" rx="${vw * 0.22}" fill="${WHITE}"/>`
    : back === "circle" ? `<circle cx="50" cy="54.5" r="${vw / 2}" fill="${WHITE}"/>`
    : back === "fill" ? `<rect x="${x}" y="${y}" width="${vw}" height="${vh}" fill="${WHITE}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${vw} ${vh}">${bg}${kit}</svg>`;
}

const size = (file) => {
  if (file.endsWith(".png")) {
    const b = readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  // webp VP8/VP8L/VP8X headers
  const b = readFileSync(file);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas></canvas>");
async function render(file, markup, w, h) {
  const type = file.endsWith(".webp") ? "image/webp" : "image/png";
  const data = await page.evaluate(
    async ({ markup, w, h, type }) => {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
      await img.decode();
      const c = document.querySelector("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.clearRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      return c.toDataURL(type, 1);
    },
    { markup, w, h, type },
  );
  writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
}

for (const dir of readdirSync(res)) {
  const full = join(res, dir);
  if (!statSync(full).isDirectory()) continue;
  for (const name of ["ic_launcher.webp", "ic_launcher_round.webp", "ic_launcher_foreground.webp", "splash.webp"]) {
    const file = join(full, name);
    try {
      statSync(file);
    } catch {
      continue;
    }
    const { w, h } = size(file);
    if (name === "ic_launcher.webp") await render(file, svg(w, h, 0.6, "square"), w, h);
    if (name === "ic_launcher_round.webp") await render(file, svg(w, h, 0.58, "circle"), w, h);
    // adaptive icon: 108dp canvas on a white background color; keep Kit inside the 66dp safe zone
    if (name === "ic_launcher_foreground.webp") await render(file, svg(w, h, 0.44), w, h);
    if (name === "splash.webp") await render(file, svg(w, h, 0.3, "fill"), w, h);
    console.log(`  ${dir}/${name} ${w}x${h}`);
  }
}
// desktop: icon.png for the window and notifications, icon.ico sizes as PNGs for the packager
await render(join(root, "desktop/icon.png"), svg(256, 256, 0.62, "square"), 256, 256);
for (const s of [16, 24, 32, 48, 64, 128, 256]) await render(join(root, `desktop/.ico-${s}.png`), svg(s, s, 0.62, "square"), s, s);
await browser.close();
