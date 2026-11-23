// (0.65) Tomo's launcher icons, splash screens and desktop icon from the robot picture
// (web/src/assets/tomo-icon.png). Run: node scripts/tomo-icons.mjs  (needs Playwright, dev only)
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = new URL("..", import.meta.url).pathname;
const res = join(root, "android/app/src/main/res");
const pic = `data:image/png;base64,${readFileSync(join(root, "web/src/assets/tomo-icon.png")).toString("base64")}`;

const size = (file) => {
  const b = readFileSync(file);
  if (file.endsWith(".png")) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
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
/** the picture `share` of the shorter side, centered on white; shape: square (rounded) | circle | fill | none */
async function render(file, w, h, share, shape) {
  const type = file.endsWith(".webp") ? "image/webp" : "image/png";
  const data = await page.evaluate(
    async ({ pic, w, h, share, shape, type }) => {
      const img = new Image();
      img.src = pic;
      await img.decode();
      const c = document.querySelector("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.clearRect(0, 0, w, h);
      if (shape === "circle") {
        g.beginPath();
        g.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        g.clip();
      } else if (shape === "square") {
        const r = Math.min(w, h) * 0.22;
        g.beginPath();
        g.roundRect(0, 0, w, h, r);
        g.clip();
      }
      if (shape !== "none") {
        g.fillStyle = "#fcfcfc";
        g.fillRect(0, 0, w, h);
      }
      const s = Math.min(w, h) * share;
      g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s);
      return c.toDataURL(type, 1);
    },
    { pic, w, h, share, shape, type },
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
    if (name === "ic_launcher.webp") await render(file, w, h, 1, "square");
    if (name === "ic_launcher_round.webp") await render(file, w, h, 1, "circle");
    // adaptive icon: 108dp canvas; the launcher masks it, so the picture fills it (face inside the safe zone)
    if (name === "ic_launcher_foreground.webp") await render(file, w, h, 0.7, "fill");
    if (name === "splash.webp") await render(file, w, h, 0.36, "fill");
    console.log(`  ${dir}/${name} ${w}x${h}`);
  }
}
await render(join(root, "desktop/icon.png"), 256, 256, 1, "square");
for (const s of [16, 24, 32, 48, 64, 128, 256]) await render(join(root, `desktop/.ico-${s}.png`), s, s, 1, "square");
await browser.close();
