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

await page.getByRole("link", { name: "Settings" }).click();
await page.getByText("Google on this computer").waitFor();
check(true, "Settings shows the desktop Google setup");
await page.getByText("Turn on sync").waitFor();
await page.screenshot({ path: join(shots, "desktop-1-settings.png") });
await page.getByLabel("What should Lyra call you?").fill("Mike");
await page.getByRole("button", { name: "Save" }).first().click();
await page.getByText("Saved", { exact: true }).first().waitFor();
await page.locator("#key-anthropic").fill("sk-ant-test-desktop");
await page.locator(".key", { has: page.locator("#key-anthropic") }).getByRole("button", { name: "Save" }).click();
await page.getByText("Key saved").waitFor({ timeout: 8000 }).catch(async (e) => {
  console.log("toast:", await page.locator(".toast").textContent().catch(() => "(none)"));
  await page.screenshot({ path: join(shots, "desktop-debug.png") });
  console.log("save buttons:", await page.locator(".key", { has: page.locator("#key-anthropic") }).locator("button").allTextContents());
  throw e;
});
// saving a key switches to Claude; go back to the practice model for the chat
await page.locator("label.item", { hasText: "Practice" }).click();
await page.getByRole("button", { name: "Use Practice" }).click();
await page.getByText("Lyra now uses Practice").waitFor();
await page.goto("app://lyra/index.html#/");
await page.getByPlaceholder("Message Lyra").fill("Hello from the laptop");
await page.getByRole("button", { name: "Send" }).click();
await page.locator(".bubble", { hasText: "Hello from the laptop" }).waitFor();
await page.waitForTimeout(800); // let it save
await page.screenshot({ path: join(shots, "desktop-2-chat.png") });
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
await page.getByText("Hi Mike").or(page.locator(".bubble")).first().waitFor();
check(errors.length === 0, `no page errors ${errors.join("; ")}`);
await app.close();
console.log("\nDesktop shell OK");
