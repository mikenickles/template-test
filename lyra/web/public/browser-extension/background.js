// Lyra's link to this browser: open, read and use pages in Lyra's own window.
// It talks only to Lyra's Windows app on this computer (127.0.0.1), and can only do the
// few things listed in run(): it never runs code it's sent, never reads what's typed into
// fields, and never types into password or card fields (those stay with you and your
// password manager). (0.2) It can click, type and pick options; Lyra asks you first, on a
// card in the app, before anything that sends, buys, books, posts or deletes.
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
  if (cmd === "click" || cmd === "type" || cmd === "choose" || cmd === "submit") {
    const tab = await currentTab();
    if (!tab) throw new Error("Lyra's window isn't open. Open a page first.");
    const before = tab.url;
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: act, args: [{ op: cmd, ...args }] });
    const out = r && r.result;
    if (!out || out.error) throw new Error((out && out.error) || "Couldn't do that on the page.");
    await settle(tab.id, before);
    return read(tab.id);
  }
  if (cmd === "back") {
    const tab = await currentTab();
    if (!tab) throw new Error("Lyra's window isn't open. Open a page first.");
    await chrome.tabs.goBack(tab.id).catch(() => {});
    await settle(tab.id, tab.url);
    return read(tab.id);
  }
  if (cmd === "reload") {
    setTimeout(() => chrome.runtime.reload(), 200);
    return { reloading: true };
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

/** After a click: wait for a new page if one starts loading (or a moment for the page to update). */
function settle(tabId, before) {
  return new Promise((resolve) => {
    let loading = false;
    const finish = () => {
      chrome.tabs.onUpdated.removeListener(watch);
      clearTimeout(quiet);
      clearTimeout(cap);
      setTimeout(resolve, 600);
    };
    const watch = (id, change) => {
      if (id !== tabId) return;
      if (change.status === "loading" || (change.url && change.url !== before)) loading = true;
      if (change.status === "complete" && loading) finish();
    };
    chrome.tabs.onUpdated.addListener(watch);
    // nothing started loading: the page changed in place (or not at all)
    const quiet = setTimeout(() => !loading && finish(), 1200);
    const cap = setTimeout(finish, 20_000);
  });
}

/** Runs in the page: one step on what extract() numbered. Never types into password or card fields. */
function act(step) {
  const el = document.querySelector(`[data-lyra-ref="${Number(step.ref)}"]`);
  if (!el) return { error: "That isn't on the page anymore. Read the page again." };
  const hint = `${el.getAttribute("autocomplete") || ""} ${el.name || ""} ${el.id || ""}`;
  const secret = el.type === "password" || /cc-|card|cvc|cvv|csc|security.?code|one-time-code/i.test(hint);
  el.scrollIntoView({ block: "center" });
  if (step.op === "click") {
    el.click();
    return { ok: true };
  }
  if (step.op === "type") {
    if (secret) return { error: "That's a password or card field. Lyra never types there." };
    if (!("value" in el)) return { error: "That isn't a field to type in." };
    el.focus();
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, String(step.text ?? ""));
    else el.value = String(step.text ?? "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (step.enter) {
      const f = el.form;
      if (f) f.requestSubmit ? f.requestSubmit() : f.submit();
      else {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }
    }
    return { ok: true };
  }
  if (step.op === "submit") {
    const f = el.form || el.closest("form");
    if (!f) return { error: "That field isn't in a form." };
    f.requestSubmit ? f.requestSubmit() : f.submit();
    return { ok: true };
  }
  if (step.op === "choose") {
    if (!el.options) return { error: "That isn't a drop-down." };
    const want = String(step.option ?? "").trim().toLowerCase();
    const all = Array.from(el.options);
    const o = all.find((x) => x.text.trim().toLowerCase() === want) || all.find((x) => x.text.toLowerCase().includes(want));
    if (!o) return { error: `There's no option "${step.option}".` };
    el.value = o.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
  return { error: "Lyra's extension can't do that." };
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
  // (0.2) what on the page can be used, each numbered so Lyra can say which one
  for (const old of document.querySelectorAll("[data-lyra-ref]")) old.removeAttribute("data-lyra-ref");
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  };
  const words = (s) => String(s || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const labelOf = (el, tag, type) =>
    words(
      el.getAttribute("aria-label") ||
        (tag === "input" && ["submit", "button", "reset"].includes(type) ? el.value : "") ||
        (el.labels && el.labels[0] && el.labels[0].innerText) ||
        (tag === "input" || tag === "textarea" || tag === "select" ? "" : el.innerText) ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        el.getAttribute("alt") ||
        el.getAttribute("name"),
    );
  const formOf = (el) => {
    const f = el.form || el.closest("form");
    if (!f) return undefined;
    const method = (f.getAttribute("method") || "get").toLowerCase() === "post" ? "post" : "get";
    const typed = f.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea");
    const search =
      f.getAttribute("role") === "search" ||
      !!f.querySelector("input[type=search]") ||
      /search|query/i.test(`${f.getAttribute("action") || ""} ${f.id || ""} ${f.className || ""}`) ||
      (method === "get" && typed.length === 1 && !f.querySelector("input[type=password]"));
    return { method, search };
  };
  const controls = [];
  let n = 0;
  let linkCount = 0;
  for (const el of document.querySelectorAll("a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox], [role=tab], [role=menuitem]")) {
    if (controls.length >= 150) break;
    if (el.disabled || !visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    const role = el.getAttribute("role");
    let kind;
    if (tag === "a" || role === "link") kind = "link";
    else if (tag === "select") kind = "select";
    else if (tag === "textarea") kind = "field";
    else if (tag === "input") {
      if (type === "hidden" || type === "file") continue;
      if (["submit", "button", "reset", "image"].includes(type)) kind = "button";
      else if (type === "checkbox" || type === "radio") kind = "check";
      else kind = "field";
    } else if (role === "checkbox") kind = "check";
    else kind = "button";
    // long pages are mostly links: keep room for the form
    if (kind === "link" && ++linkCount > 70) continue;
    const c = { ref: ++n, kind, label: labelOf(el, tag, type) };
    el.setAttribute("data-lyra-ref", String(c.ref));
    if (tag === "input" || tag === "textarea") c.type = tag === "textarea" ? "text" : type || "text";
    if (kind === "link" && el.href) c.href = String(el.href).slice(0, 300);
    const f = formOf(el);
    if (f) c.form = f;
    const hint = `${el.getAttribute("autocomplete") || ""} ${el.name || ""} ${el.id || ""}`;
    if (kind === "field" && (type === "password" || /cc-|card|cvc|cvv|csc|security.?code|one-time-code/i.test(hint))) c.secret = true;
    if (kind === "select") c.options = Array.from(el.options).slice(0, 30).map((o) => o.text.trim().slice(0, 40));
    controls.push(c);
  }
  return { title: document.title.slice(0, 200), url: location.href, text, links, controls };
}

chrome.alarms.create("lyra", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
shown(false);
connect();
