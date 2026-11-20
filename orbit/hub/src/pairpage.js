/**
 * The pairing page the hub opens on the PC: a large QR code to scan with the Orbit app, with the
 * address and code underneath for typing by hand. It refreshes itself when the code changes and
 * says so when a phone pairs. Served only to the PC itself.
 */
export const PAIR_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pair with Orbit</title>
<style>
  :root { color-scheme: dark; --bg: #08090D; --card: #111318; --edge: rgba(232,236,255,.08); --text: #F4F5F8; --muted: #A3A7B6; --faint: #8B8FA0; --live: #46E3A6; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text);
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; }
  main { width: min(420px, 100%); text-align: center; }
  .mark { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; font-size: 20px; letter-spacing: -.02em; }
  h1 { font-size: 30px; letter-spacing: -.03em; margin: 28px 0 8px; }
  p { color: var(--muted); margin: 0 0 28px; }
  .qr { background: #fff; border-radius: 28px; padding: 26px; width: 300px; height: 300px; margin: 0 auto; transition: opacity .25s; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .manual { margin-top: 28px; background: var(--card); border: 1px solid var(--edge); border-radius: 22px; padding: 18px 20px; text-align: left; }
  .row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; }
  .row span:first-child { color: var(--faint); font-size: 14px; }
  .mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 17px; }
  .code { font-size: 24px; letter-spacing: .12em; }
  .done { display: none; margin-top: 28px; color: var(--live); font-weight: 600; }
  .paired .done { display: block; }
  .paired .qr { opacity: .25; }
</style>
</head>
<body>
<main>
  <div class="mark">
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="11.4" cy="14.8" r="10.4" fill="#F4F5F8"/><rect x="6.3" y="11.2" width="2.9" height="6.8" rx="1.4" fill="#08090D"/><rect x="13.6" y="11.2" width="2.9" height="6.8" rx="1.4" fill="#08090D"/><circle cx="22.6" cy="3.4" r="2.9" fill="#F4F5F8"/></svg>
    Orbit
  </div>
  <h1>Pair your phone</h1>
  <p>Open Orbit on your phone, tap <b>Scan QR code</b>, and point it at this.</p>
  <div class="qr" id="qr"></div>
  <div class="done" id="done"></div>
  <div class="manual">
    <div class="row"><span>Or type the address</span><span class="mono" id="address">…</span></div>
    <div class="row"><span>and the code</span><span class="mono code" id="code">…</span></div>
  </div>
</main>
<script>
  let shown = '';
  async function refresh() {
    try {
      const r = await fetch('/pair.json', { cache: 'no-store' });
      const s = await r.json();
      if (s.code !== shown) {
        shown = s.code;
        document.getElementById('qr').innerHTML = s.svg;
        document.getElementById('code').textContent = s.code.slice(0, 3) + ' ' + s.code.slice(3);
        document.getElementById('address').textContent = s.address;
      }
      if (s.justPaired) {
        document.body.classList.add('paired');
        document.getElementById('done').textContent = 'Paired with ' + s.justPaired + '. You can close this page.';
      }
    } catch (e) { /* the hub is restarting; try again shortly */ }
  }
  refresh();
  setInterval(refresh, 2000);
</script>
</body>
</html>
`;
