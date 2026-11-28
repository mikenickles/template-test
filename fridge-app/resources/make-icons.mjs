// Renders the launcher icon and splash images for Android with Playwright.
// Usage: node resources/make-icons.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const RES = 'android/app/src/main/res';
const BG = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B67E8"/><stop offset="0.55" stop-color="#4F5BD5"/><stop offset="1" stop-color="#7A4FC9"/></linearGradient>`;
// Fridge glyph centred in a 108×108 canvas (inside the 66dp safe zone).
const GLYPH = `
  <rect x="38" y="27" width="32" height="54" rx="7" fill="none" stroke="#fff" stroke-width="4.5"/>
  <path d="M38 48h32M45 35v6M45 55v9" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M77 27l1.8 4.8 4.8 1.8-4.8 1.8-1.8 4.8-1.8-4.8-4.8-1.8 4.8-1.8z" fill="#FFE3A3"/>`;
const svg = (size, inner, { bg = false, round = false, square = false } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108"><defs>${BG}</defs>
${bg ? (round ? '<circle cx="54" cy="54" r="54" fill="url(#g)"/>' : square ? '<rect width="108" height="108" fill="url(#g)"/>' : '<rect width="108" height="108" rx="24" fill="url(#g)"/>') : ''}
${inner}</svg>`;

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const b = await chromium.launch();
const page = await b.newPage();
async function render(markup, w, h, file, transparent = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#EDEFF3'}">${markup}</body></html>`);
  await page.screenshot({ path: file, omitBackground: transparent });
}
for (const [d, k] of Object.entries(DENS)) {
  const dir = `${RES}/mipmap-${d}`;
  const fg = Math.round(108 * k), legacy = Math.round(48 * k);
  await render(svg(fg, GLYPH), fg, fg, `${dir}/ic_launcher_foreground.png`);
  await render(svg(fg, '', { bg: true, square: true }), fg, fg, `${dir}/ic_launcher_background.png`);
  // Legacy icons: scale the 108 canvas so the glyph fills a 48dp icon nicely.
  const legacyInner = `<g transform="translate(-14 -14) scale(1.26)">${GLYPH}</g>`;
  await render(svg(legacy, legacyInner, { bg: true }), legacy, legacy, `${dir}/ic_launcher.png`);
  await render(svg(legacy, legacyInner, { bg: true, round: true }), legacy, legacy, `${dir}/ic_launcher_round.png`);
}
// Splash images: same size as the ones Capacitor generated.
const splashes = execFileSync('find', [RES, '-name', 'splash.png']).toString().trim().split('\n');
for (const f of splashes) {
  const dims = execFileSync('file', [f]).toString().match(/(\d+) x (\d+)/);
  const w = +dims[1], h = +dims[2], s = Math.round(Math.min(w, h) * 0.28);
  await render(`<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s * 0.18)}px;font-family:sans-serif">${svg(s, `<g transform="translate(-14 -14) scale(1.26)">${GLYPH}</g>`, { bg: true })}<div style="font-size:${Math.round(s * 0.2)}px;font-weight:600;color:#1B1B1F;letter-spacing:-0.02em">Family Fridge</div></div>`, w, h, f, false);
}
await b.close();
fs.writeFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`);
fs.copyFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, `${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`);
console.log('icons and', splashes.length, 'splash images written');
