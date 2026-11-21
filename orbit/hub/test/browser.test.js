import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Browser, browserCandidates, describePage, needsApproval } from '../src/browser.js';
import { openSocket } from '../src/cdp.js';

const CHROME = [process.env.ORBIT_TEST_CHROME, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', ...browserCandidates()].find((f) => f && fs.existsSync(f));

const SHOP = `<!doctype html><html><head><title>Corner Shop</title></head><body>
  <h1>Corner Shop</h1>
  <p>Fresh bread every morning.</p>
  <a href="/pricing">Pricing</a>
  <form role="search" action="/search"><input name="q" aria-label="Search the shop"></form>
  <form method="post" action="/order">
    <label>Email <input name="email" type="email"></label>
    <label>Password <input name="password" type="password" value="hunter2"></label>
    <label>Size <select name="size"><option>Small</option><option>Large loaf</option></select></label>
    <button type="submit">Place order</button>
  </form>
</body></html>`;

async function shop(t) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url.startsWith('/search')) return res.end(`<title>Results</title><p>Results for ${new URL(req.url, 'http://x').searchParams.get('q')}</p>`);
    if (req.url === '/order' && req.method === 'POST') return res.end('<title>Thanks</title><p>Thanks for your order!</p>');
    if (req.url === '/pricing') return res.end('<title>Pricing</title><p>Bread is $4.</p>');
    res.end(SHOP);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('what needs the user\'s OK: buying, sending and deleting, but not searching or plain links', () => {
  assert.equal(needsApproval({ kind: 'button', label: 'Place order', submit: true }), true);
  assert.equal(needsApproval({ kind: 'button', label: 'Delete account' }), true);
  assert.equal(needsApproval({ kind: 'button', label: 'Next' }), false);
  assert.equal(needsApproval({ kind: 'link', label: 'Pricing' }), false);
  assert.equal(needsApproval({ kind: 'link', label: 'Remove item' }), true);
  assert.equal(needsApproval({ kind: 'field', label: 'Search', search: true }, { submit: true }), false);
  assert.equal(needsApproval({ kind: 'field', label: 'Message' }, { submit: true }), true);
});

test('pages read with the password field never showing its value', () => {
  const text = describePage({ url: 'https://x.com', title: 'X', text: 'Hi', items: [
    { ref: 1, kind: 'password field', label: 'Password' },
    { ref: 2, kind: 'email field', label: 'Email', value: '' },
    { ref: 3, kind: 'checkbox', label: 'Remember me', checked: true },
  ] });
  assert.match(text, /\[1\] password field "Password" \(the user types this themselves\)/);
  assert.match(text, /\[2\] email field "Email" \(empty\)/);
  assert.match(text, /\[3\] checkbox "Remember me" \(checked\)/);
});

test('agents can only open public websites, never this PC or the home network', async () => {
  const browser = new Browser({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-browser-')), executable: '/nowhere' });
  const run = browser.tools(async () => true).run;
  for (const url of ['http://127.0.0.1:8787/', 'http://192.168.1.1/', 'file:///etc/passwd', 'chrome://settings']) {
    const result = await run('browser_open', { url });
    assert.equal(result.isError, true, url);
  }
  await assert.rejects(openSocket('ws://example.com:9222/devtools/browser/x'), /stay on this PC/);
});

test('the Treehouse browser opens, reads, types, searches and asks before an order', { skip: !CHROME && 'no Chrome here' }, async (t) => {
  const base = await shop(t);
  // The test shop is on this PC, which agents normally can't open; this browser is let through for it.
  const browser = new Browser({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-browser-')), executable: CHROME, headless: true, checkUrl: async (raw) => new URL(raw) });
  t.after(() => browser.close());
  const asked = [];
  let allow = false;
  const { run } = browser.tools(async (request) => {
    asked.push(request);
    return allow;
  });

  const page = await run('browser_open', { url: base });
  assert.equal(page.isError, false, page.text);
  assert.match(page.text, /Page: Corner Shop/);
  assert.match(page.text, /Fresh bread every morning/);
  assert.ok(!page.text.includes('hunter2'), 'a password is never read out');
  const ref = (pattern) => Number(new RegExp(`\\[(\\d+)\\] ${pattern}`).exec(page.text)?.[1]);
  assert.ok(ref('link "Pricing"'));

  const password = await run('browser_type', { ref: ref('password field'), text: 'guess' });
  assert.equal(password.isError, true);
  assert.match(password.text, /Passwords are the user's/);

  const typed = await run('browser_type', { ref: ref('email field'), text: 'alex@example.com' });
  assert.match(typed.text, /email field "Email" \(has "alex@example.com"\)/);
  const picked = await run('browser_type', { ref: ref('list'), text: 'large' });
  assert.match(picked.text, /list "Size" \(has "Large loaf"\)/);

  // Not allowed: the order isn't placed.
  const denied = await run('browser_click', { ref: ref('button "Place order"') });
  assert.equal(denied.isError, true);
  assert.deepEqual(asked, [{ action: 'Click “Place order”', site: '127.0.0.1' }]);
  assert.match((await run('browser_read')).text, /Page: Corner Shop/);

  allow = true;
  const ordered = await run('browser_click', { ref: ref('button "Place order"') });
  assert.match(ordered.text, /Thanks for your order/);

  // Searching needs no OK.
  await run('browser_back');
  const again = (await run('browser_read')).text;
  const search = Number(/\[(\d+)\] text field "Search the shop"/.exec(again)?.[1]);
  const results = await run('browser_type', { ref: search, text: 'rye', submit: true });
  assert.match(results.text, /Results for rye/);
  assert.equal(asked.length, 2, 'the search asked nothing');
});
