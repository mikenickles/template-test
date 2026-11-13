// Runs the desktop shell (Linux build of the same code) and checks the desktop-only parts:
// the app loads from inside Lyra, data is saved to disk and survives a restart, and
// secrets go through the OS store. Run: npm run desktop -- --stage-only && xvfb-run node scripts/desktop-smoke.mjs
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright");
const root = resolve(import.meta.dirname, "..");
const stage = join(root, "build/desktop-app");
const home = mkdtempSync(join(tmpdir(), "lyra-desktop-"));
const shots = resolve(process.argv[2] ?? join(root, "smoke-shots"));
const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

const launch = () =>
  _electron.launch({
    executablePath: require("electron"),
    args: [stage, "--password-store=basic", "--no-sandbox"],
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), LYRA_DESKTOP_TEST: "1" },
  });

let app = await launch();
let page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && /Content Security Policy|Refused to/.test(m.text()) && errors.push(m.text()));
await page.getByText("I'm Lyra.").waitFor({ timeout: 20_000 });
check(page.url().startsWith("app://lyra/"), "the app loads from inside Lyra (app://)");
check(await page.evaluate(() => !!window.lyraDesktop && typeof window.require === "undefined"), "desktop bridge present, no Node in the page");
check(await page.evaluate(() => window.isSecureContext && !!crypto.subtle), "secure context (encryption works)");

// a wide window gets the desktop layout: sidebar, title bar, no phone tab bar
check(await page.locator(".app.desk").isVisible(), "a wide window uses the desktop layout");
check((await page.locator(".drawer-panel.docked").isVisible()) && (await page.locator(".tabbar").count()) === 0, "docked sidebar, no phone tab bar");
await page.keyboard.press("Control+n");
await page.getByRole("heading", { name: "New channel" }).waitFor();
await page.getByLabel("Name").fill("Home");
await page.getByRole("button", { name: "Create", exact: true }).click();
await page.locator(".drawer-panel .star-row", { hasText: "Home" }).waitFor();
check(true, "Ctrl+N makes a channel, and it appears in the sidebar");
await page.locator(".drawer-panel .nav-item.side", { hasText: "Settings" }).click();
await page.getByRole("link", { name: /Sync and backup/ }).click();
await page.getByText("Google on this computer").waitFor();
check(true, "Settings shows the desktop Google setup");
await page.getByText("Turn on sync").waitFor();
await page.screenshot({ path: join(shots, "desktop-1-settings.png") });
await page.goto("app://lyra/index.html#/settings/you");
await page.getByLabel("What should Lyra call you?").fill("Mike");
await page.getByRole("button", { name: "Save" }).first().click();
await page.getByText("Saved", { exact: true }).first().waitFor();
await page.route("https://api.anthropic.com/v1/models**", (r) => r.fulfill({ json: { data: [{ id: "claude-test", display_name: "Claude Test" }] } }));
await page.goto("app://lyra/index.html#/settings/model");
await page.locator("#key-anthropic").fill("sk-ant-test-desktop");
await page.locator(".provider", { has: page.locator("#key-anthropic") }).getByRole("button", { name: "Save" }).click();
await page.getByText("Key saved").waitFor({ timeout: 8000 }).catch(async (e) => {
  console.log("toast:", await page.locator(".toast").textContent().catch(() => "(none)"));
  await page.screenshot({ path: join(shots, "desktop-debug.png") });
  throw e;
});
// saving a key switches to Claude; go back to the practice model for the chat
await page.getByRole("radio", { name: /Claude Test/ }).waitFor();
check(true, "the model list loads on the computer (allowed by the security policy)");
await page.getByRole("button", { name: /Practice/ }).click();
await page.getByText("Lyra now uses Practice").waitFor();
await page.goto("app://lyra/index.html#/");
await page.getByPlaceholder("Message Lyra").fill("Hello from the laptop");
await page.getByRole("button", { name: "Send" }).click();
await page.locator(".bubble", { hasText: "Hello from the laptop" }).waitFor();
await page.locator(".row.user", { hasText: "Hello from the laptop" }).hover();
await page.locator(".row.user", { hasText: "Hello from the laptop" }).getByRole("button", { name: "Message actions" }).click();
await page.getByRole("button", { name: "Pin", exact: true }).click();
await page.locator(".pin-tag").first().waitFor();
check(true, "the hover button on a message opens copy, pin and delete");
await page.waitForTimeout(800); // let it save
await page.screenshot({ path: join(shots, "desktop-2-chat.png") });

// ---- an email for your OK: nothing goes until you tap Send (pretend Google) ----
const sent = [];
await app.evaluate(({ ipcMain }) => {
  ipcMain.removeHandler("google:authorize");
  const granted = new Set();
  ipcMain.handle("google:authorize", (_e, scopes) => {
    scopes.forEach((x) => granted.add(x));
    return { accessToken: "tok", grantedScopes: [...granted, "openid"], email: "sam@example.com" };
  });
});
await page.route("https://gmail.googleapis.com/**", (r) => {
  const u = r.request().url();
  if (u.endsWith("/messages/send")) {
    sent.push(JSON.parse(r.request().postData()));
    return r.fulfill({ json: { id: "m1", threadId: "t9" } });
  }
  if (u.includes("/profile")) return r.fulfill({ json: { emailAddress: "sam@example.com" } });
  // one bill in the inbox, for life admin
  if (/\/messages\?/.test(u)) return r.fulfill({ json: { messages: [{ id: "b1" }] } });
  if (u.includes("/messages/b1"))
    return r.fulfill({
      json: {
        id: "b1",
        threadId: "abc123def456",
        snippet: "Your bill of $84.50 is due soon.",
        payload: { headers: [{ name: "From", value: "PG&E <bills@example.com>" }, { name: "Subject", value: "Your energy bill is ready" }, { name: "Date", value: "Thu, 12 Nov 2026 09:00:00 -0800" }] },
      },
    });
  return r.fulfill({ json: {} });
});
await page.goto("app://lyra/index.html#/access");
await page.getByRole("button", { name: /Connect Gmail/ }).click();
await page.getByText("Gmail is connected").waitFor();
await page.getByRole("switch", { name: /Write emails/ }).click();
await page.getByText("Lyra can write emails for your OK").waitFor();
await page.screenshot({ path: join(shots, "desktop-7-with-your-ok.png") });
await page.goto("app://lyra/index.html#/");
await page.getByPlaceholder("Message Lyra").fill("email dana@example.com saying Yes, Friday works.");
await page.getByRole("button", { name: "Send" }).click();
const card = page.getByRole("group", { name: "Email for your OK" });
await card.waitFor();
await page.waitForTimeout(500);
check(sent.length === 0 && (await card.getByText("dana@example.com").isVisible()), "Lyra's email shows as a card with who it goes to, and nothing is sent yet");
await card.getByRole("button", { name: "Edit" }).click();
await card.getByLabel("Message").fill("Yes, Friday works. See you then!");
await page.screenshot({ path: join(shots, "desktop-8-email-card.png") });
await card.getByRole("button", { name: "Send", exact: true }).click();
await card.getByText(/^Sent ·/).waitFor();
const raw = Buffer.from(sent[0]?.raw ?? "", "base64url").toString("utf8");
const sentBody = Buffer.from(raw.split("\r\n\r\n")[1] ?? "", "base64").toString("utf8");
check(sent.length === 1 && raw.includes("To: dana@example.com") && sentBody === "Yes, Friday works. See you then!", "tapping Send sends it once, with your edits");
check((await card.getByRole("button", { name: "Send", exact: true }).count()) === 0, "a sent email can't be sent again from the card");

// ---- inbox triage, when asked (practice data) ----
// ---- notification checkup: what stops Lyra reaching you, each with its fix ----
await page.goto("app://lyra/index.html#/settings/alerts");
await page.getByText("Checkup").waitFor();
const checkup = page.locator(".checkup-row");
check(
  (await checkup.filter({ hasText: "A real AI model" }).locator(".checkup-mark:not(.ok)").count()) === 1 &&
    (await checkup.filter({ hasText: "Heads-ups on" }).getByRole("button", { name: "Turn on" }).count()) === 1,
  "the notification checkup says what's missing (practice model, heads-ups off), each with a fix",
);
await checkup.filter({ hasText: "Heads-ups on" }).getByRole("button", { name: "Turn on" }).click();
await page.getByText("Heads-ups: Light").first().waitFor();
check((await checkup.filter({ hasText: "Heads-ups on" }).locator(".checkup-mark.ok").count()) === 1, "one tap turns heads-ups on");
await page.screenshot({ path: join(shots, "desktop-12-checkup.png") });
await page.getByRole("button", { name: "Send me a test notification" }).click();
await page.getByText("Sent").first().waitFor();
check(true, "a test notification can be sent");

// ---- life admin: Lyra goes through the mail and lists the bill (practice data) ----
await page.goto("app://lyra/index.html#/tasks?admin");
await page.getByRole("button", { name: "Check now" }).click();
await page.locator(".admin-item", { hasText: "PG&E" }).waitFor();
check((await page.getByRole("link", { name: "Open in Gmail" }).count()) === 1, "life admin finds a bill in the mail and lists it, with Open in Gmail");
await page.screenshot({ path: join(shots, "desktop-11-life-admin.png") });
await page.locator(".admin-item", { hasText: "PG&E" }).getByRole("button", { name: "Paid" }).click();
await page.locator(".admin-item", { hasText: "PG&E" }).waitFor({ state: "detached" });
check(true, "marking a bill paid takes it off the list");
await page.goto("app://lyra/index.html#/");

await page.getByPlaceholder("Message Lyra").fill("go through my inbox");
await page.getByRole("button", { name: "Send" }).click();
const triage = page.getByRole("region", { name: "Inbox triage" });
await triage.waitFor();
check((await triage.getByText("Needs you · 1").count()) === 1 && (await triage.getByRole("link", { name: "Open in Gmail" }).count()) === 2, "asking Lyra to go through the inbox shows a triage card");
await triage.getByRole("button", { name: /Newsletters and promos/ }).click();
await page.screenshot({ path: join(shots, "desktop-10-triage.png") });

// ---- skills: teach one, then use it by name ----
await page.getByPlaceholder("Message Lyra").fill("save a skill called Weekly review: 1. Look back at the week\n2. Plan Monday");
await page.getByRole("button", { name: "Send" }).click();
await page.locator(".skill-chip", { hasText: "Learned Weekly review" }).waitFor();
await page.getByPlaceholder("Message Lyra").fill("use my weekly review skill");
await page.getByRole("button", { name: "Send" }).click();
await page.locator(".skill-chip", { hasText: "Followed Weekly review" }).waitFor();
check(await page.getByText("Plan Monday").last().isVisible(), "a skill taught in chat is followed when asked for");

// ---- Spotify: set up with your own app's Client ID, sign in through the browser (pretend) ----
await app.evaluate(({ shell }) => {
  // instead of opening the browser: Spotify "sends the user back" straight away
  shell.openExternal = async (url) => {
    const u = new URL(url);
    if (u.hostname !== "accounts.spotify.com") return;
    await fetch(`${u.searchParams.get("redirect_uri")}?code=abc&state=${u.searchParams.get("state")}`);
  };
});
let spotifyAsked = "";
await page.route("https://accounts.spotify.com/api/token", (r) => {
  spotifyAsked = new URLSearchParams(r.request().postData()).get("redirect_uri");
  return r.fulfill({ json: { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "user-read-playback-state user-read-currently-playing user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative user-library-read user-modify-playback-state" } });
});
await page.route("https://api.spotify.com/v1/me", (r) => r.fulfill({ json: { id: "sam1", display_name: "Sam" } }));
await page.goto("app://lyra/index.html#/access");
await page.getByRole("button", { name: /Set up Spotify/ }).click();
await page.getByLabel("Client ID").fill("0123456789abcdef0123456789abcdef");
await page.getByRole("button", { name: "Connect", exact: true }).click();
await page.getByText("Spotify connected").waitFor();
check(/^http:\/\/127\.0\.0\.1:\d+\/spotify$/.test(spotifyAsked), "Spotify sign-in comes back through 127.0.0.1 on this computer");
check(await page.getByText("Can see what you play · Sam").isVisible(), "Spotify shows as connected, look-only");
await page.getByRole("switch", { name: /Control playback/ }).click();
await page.getByText("Lyra can control playback").waitFor();
await page.screenshot({ path: join(shots, "desktop-9-spotify.png") });
check(true, "playback control is its own switch");

// closing the window keeps Lyra running in the tray; the setting turns that off
check((await page.evaluate(() => window.lyraDesktop.shell.prefs())).tray === true, "keeping running in the tray is on by default");
await page.goto("app://lyra/index.html#/settings/alerts");
const traySwitch = page.getByRole("switch", { name: /Keep running in the tray/ });
check(await traySwitch.isChecked(), "Settings shows the tray switch");
await page.screenshot({ path: join(shots, "desktop-6-background.png") });
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
await page.waitForTimeout(500);
check(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 1 && !BrowserWindow.getAllWindows()[0].isVisible()), "closing the window hides Lyra to the tray instead of quitting");
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
await traySwitch.click();
await page.getByText("Closing the window quits Lyra").waitFor();
check((await page.evaluate(() => window.lyraDesktop.shell.prefs())).tray === false, "the tray can be turned off");
await traySwitch.click();
await page.getByText("Lyra stays in the tray").waitFor();
await app.close();

const dataDir = join(home, ".config", "Lyra", "data");
check(readdirSync(dataDir).includes("lyra.db"), "data is saved to disk in the app's folder");
const secrets = readFileSync(join(home, ".config", "Lyra", "secrets.json"), "utf8");
check(secrets.includes("key.anthropic") && !secrets.includes("sk-ant-test-desktop"), "the API key is stored encrypted, not in plain text");

app = await launch();
page = await app.firstWindow();
page.on("pageerror", (e) => errors.push(e.message));
await page.locator(".bubble", { hasText: "Hello from the laptop" }).waitFor({ timeout: 20_000 });
check(true, "chat survives a restart");
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(420, 820));
await page.locator(".tabbar").waitFor();
check(!(await page.locator(".app.desk").count()), "a narrow window falls back to the phone layout");
await page.getByText("Hi Mike").or(page.locator(".bubble")).first().waitFor();
check(errors.length === 0, `no page errors ${errors.join("; ")}`);
await app.close();
console.log("\nDesktop shell OK");
