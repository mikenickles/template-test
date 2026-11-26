// Bundles the game into www/ as one classic script so it runs from file:// inside the Android WebView.
import { build, context } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'www'), { recursive: true });
copyFileSync(join(root, 'web/index.html'), join(root, 'www/index.html'));
const opts = { entryPoints: [join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: ['chrome80'], outfile: join(root, 'www/game.js'), logLevel: 'info' };
if (process.argv.includes('--watch')) { const ctx = await context(opts); await ctx.watch(); } else await build(opts);
