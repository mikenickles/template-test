// Lyra's link to this browser (step 1: open and read pages, in Lyra's own window).
// It talks only to Lyra's Windows app on this computer (127.0.0.1), and can only do the
// few things listed in run(): it never runs code it's sent, and never reads what's typed
// into fields (passwords stay with the browser and your password manager).
const PORT = 47615;
const WEB = /^https?:\/\//i;
let ws = null;
let beat = null;

function send(m) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function shown(on) {
  chrome.storage.session.set({ connected: on }).catch(() => {});
  chrome.action.setBadgeText({ text: on ? "" : "off" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: "#9a9a9a" }).catch(() => {});
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${PORT}/lyra`);
  } catch {
    return;
  }
  ws.onopen = () => {
    send({ type: "hello", version: chrome.runtime.getManifest().version, agent: navigator.userAgent });
    shown(true);
    clearInterval(beat);
    // a message every 20 seconds keeps the browser from putting this to sleep
    beat = setInterval(() => send({ type: "ping" }), 20_000);
  };
  ws.onclose = () => {
    clearInterval(beat);
    ws = null;
    shown(false);
    setTimeout(connect, 5000);
  };
  ws.onerror = () => {};
  ws.onmessage = async (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type !== "do") return;
    try {
      send({ type: "done", id: m.id, ok: true, result: await run(m.cmd, m.args || {}) });
    } catch (err) {
      send({ type: "done", id: m.id, ok: false, error: String((err && err.message) || err).slice(0, 300) });
    }
  };
}

async function run(cmd, args) {
  if (cmd === "open") {
    const url = String(args.url || "");
    if (!WEB.test(url)) throw new Error("Only web pages (http or https).");
    const tabId = await lyraTab(url);
    await loaded(tabId);
    return read(tabId);
  }
  if (cmd === "read") {
    const tab = await currentTab();
    if (!tab) throw new Error("Lyra's window isn't open. Open a page first.");
    return read(tab.id);
  }
  if (cmd === "close") {
    const id = (await chrome.storage.session.get("win")).win;
    if (id) await chrome.windows.remove(id).catch(() => {});
    await chrome.storage.session.remove("win");
    return { closed: true };
  }
  throw new Error(`Lyra's extension can't do "${cmd}".`);
}

/** Lyra's own window: made once, then its tab is reused. Your own tabs are never touched. */
async function currentTab() {
  const id = (await chrome.storage.session.get("win")).win;
  if (!id) return null;
  try {
    const w = await chrome.windows.get(id, { populate: true });
    return w.tabs && w.tabs[0] ? w.tabs[0] : null;
  } catch {
    return null;
  }
}

async function lyraTab(url) {
  const tab = await currentTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { url });
    return tab.id;
  }
  const w = await chrome.windows.create({ url, focused: false, width: 1100, height: 820 });
  await chrome.storage.session.set({ win: w.id });
  return w.tabs[0].id;
}

/** Resolves once the page has loaded (or after 20 seconds), plus a moment for its scripts. */
function loaded(tabId) {
  return new Promise((resolve) => {
    let started = false;
    const done = () => {
      chrome.tabs.onUpdated.removeListener(watch);
      clearTimeout(timer);
      setTimeout(resolve, 700);
    };
    const watch = (id, change) => {
      if (id !== tabId) return;
      if (change.status === "loading") started = true;
      if (change.status === "complete" && started) done();
    };
    const timer = setTimeout(done, 20_000);
    chrome.tabs.onUpdated.addListener(watch);
  });
}

async function read(tabId) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: extract });
  if (!r || !r.result) throw new Error("Couldn't read that page.");
  return r.result;
}

/** Runs in the page: its title, address, visible text and links. Typed-in values aren't part of innerText. */
function extract() {
  const clean = (s) => s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const main = document.querySelector("main, article, [role=main]");
  const root = main && main.innerText.length > 500 ? main : document.body;
  const text = clean((root && root.innerText) || "").slice(0, 40000);
  const links = [];
  const seen = new Set();
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.href;
    const t = (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
    if (!t || !/^https?:/.test(href) || seen.has(href)) continue;
    seen.add(href);
    links.push({ text: t.slice(0, 80), href: href.slice(0, 500) });
    if (links.length >= 60) break;
  }
  return { title: document.title.slice(0, 200), url: location.href, text, links };
}

chrome.alarms.create("lyra", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
shown(false);
connect();
