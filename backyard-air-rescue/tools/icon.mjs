// Renders the launcher icon (android/icon.svg) to the mipmap PNG sizes.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'android/icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const [name, px] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  const page = await browser.newPage({ viewport: { width: px, height: px } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}</body>`);
  mkdirSync(join(root, `android/res/mipmap-${name}`), { recursive: true });
  await page.screenshot({ path: join(root, `android/res/mipmap-${name}/ic_launcher.png`), omitBackground: true });
  await page.close();
}
await browser.close();
