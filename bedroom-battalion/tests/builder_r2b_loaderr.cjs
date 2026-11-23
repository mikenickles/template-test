// Prints console output and page errors during load (diagnostic for a page that does not become ready).
const path = require('path'), fs = require('fs'); const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage();
  p.on('console', (m) => console.log('C', m.type(), m.text())); p.on('pageerror', (e) => console.log('PE', e.message));
  await p.route(/three@[\d.]+\/(.*)$/, (r) => { const m = r.request().url().match(/three@[\d.]+\/(.*?)(\?.*)?$/); r.fulfill({ body: fs.readFileSync(path.join(__dirname, 'node_modules/three', m[1])), contentType: 'text/javascript' }); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(4000); await b.close(); })();
