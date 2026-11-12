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
await page.locator(".drawer-panel .nav-item", { hasText: "Home" }).waitFor();
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
