/**
 * The hub's page on the PC: a large QR code to scan with the Orbit app, with the address and code
 * underneath for typing by hand, and the folders agents may read. It refreshes itself when the code
 * changes and says so when a phone pairs. Served only to the PC itself; folders are shared only here.
 */
export const PAIR_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orbit hub</title>
<style>
  :root { color-scheme: dark; --bg: #08090D; --card: #111318; --edge: rgba(232,236,255,.08); --text: #F4F5F8; --muted: #A3A7B6; --faint: #8B8FA0; --live: #46E3A6; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; background: var(--bg); color: var(--text);
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
  .folders { margin-top: 44px; text-align: left; }
  h2 { font-size: 19px; letter-spacing: -.02em; margin: 0 0 6px; }
  .hint { font-size: 14px; margin: 0 0 16px; color: var(--faint); }
  .list { background: var(--card); border: 1px solid var(--edge); border-radius: 22px; overflow: hidden; }
  .list:empty { display: none; }
  .folder { display: flex; align-items: center; gap: 12px; padding: 14px 18px; }
  .folder + .folder { border-top: 1px solid var(--edge); }
  .folder div { flex: 1; min-width: 0; }
  .folder b { display: block; font-weight: 600; }
  .folder small { display: block; color: var(--faint); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { font: inherit; cursor: pointer; border: 0; }
  .primary { margin-top: 16px; background: var(--text); color: var(--bg); font-weight: 600; border-radius: 999px; padding: 12px 22px; }
  .primary:disabled { opacity: .5; cursor: default; }
  .quiet { background: none; color: var(--muted); font-size: 14px; padding: 6px 4px; }
  .quiet:hover { color: var(--text); }
  form { display: flex; gap: 10px; margin-top: 16px; }
  form .primary { margin-top: 0; }
  input { flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--card); border: 1px solid var(--edge);
    border-radius: 999px; padding: 11px 18px; outline: none; }
  input:focus { border-color: rgba(232,236,255,.24); }
  .error { color: #FF7A85; font-size: 14px; margin-top: 10px; min-height: 1em; }
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
  <section class="folders">
    <h2>Folders your agents can read</h2>
    <p class="hint">Agents with <b>Read your files</b> turned on can look inside these. Read only: Orbit never changes your files.</p>
    <div class="list" id="folders"></div>
    <button class="primary" id="pick" hidden>Share a folder…</button>
    <form id="typed" hidden><input id="path" placeholder="Full path, like /home/you/Documents" autocomplete="off"><button class="primary">Share</button></form>
    <div class="error" id="folderError"></div>
  </section>
</main>
<script>
  let shown = '';
  let shownFolders = '';

  async function local(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', 'x-orbit-local': '1' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  function showFolders(folders) {
    const key = JSON.stringify(folders);
    if (key === shownFolders) return;
    shownFolders = key;
    const list = document.getElementById('folders');
    list.replaceChildren(...folders.map((f) => {
      const row = document.createElement('div');
      row.className = 'folder';
      const text = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = f.name;
      const where = document.createElement('small');
      where.textContent = f.path;
      text.append(name, where);
      const remove = document.createElement('button');
      remove.className = 'quiet';
      remove.textContent = 'Stop sharing';
      remove.onclick = () => act(() => local('DELETE', '/local/folders/' + encodeURIComponent(f.id)));
      row.append(text, remove);
      return row;
    }));
  }

  async function act(change) {
    const error = document.getElementById('folderError');
    error.textContent = '';
    try {
      showFolders((await change()).folders);
    } catch (e) {
      error.textContent = e.message;
    }
  }

  document.getElementById('pick').onclick = async (e) => {
    e.target.disabled = true;
    await act(() => local('POST', '/local/folders/pick'));
    e.target.disabled = false;
  };
  document.getElementById('typed').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('path');
    act(async () => {
      const result = await local('POST', '/local/folders', { path: input.value });
      input.value = '';
      return result;
    });
  };

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
      document.getElementById('pick').hidden = !s.canPick;
      document.getElementById('typed').hidden = s.canPick;
      showFolders(s.folders);
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
