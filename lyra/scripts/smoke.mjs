// End-to-end check of the app on a phone-sized screen, using the practice model.
// It runs the same build the Android app ships, in Chromium.
// Run: npm run build && npm run smoke [-- <screenshot folder>]
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
// Playwright is a dev-only tool here; it is not one of Lyra's dependencies.
const { chromium, devices } = require("playwright");

const root = resolve(import.meta.dirname, "..");
const shots = resolve(process.argv[2] ?? join(root, "smoke-shots"));
mkdirSync(shots, { recursive: true });
const port = 4399;
const base = `http://localhost:${port}`;

const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((ok, fail) => {
  server.stdout.on("data", (d) => String(d).includes(String(port)) && ok());
  server.on("exit", (c) => fail(new Error(`preview exited ${c}`)));
  setTimeout(() => fail(new Error("preview did not start")), 20_000);
});

const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], colorScheme: "light" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => {
    await page.waitForTimeout(400); // let entrance animations finish
    await page.screenshot({ path: join(shots, `${name}.png`) });
  };

  await page.goto(base);
  await page.getByText("I'm Lyra.").waitFor();
  check(true, "app starts on the welcome screen");
  await shot("light-1-welcome");

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("What should Lyra call you?").fill("Sam");
  await page.getByRole("button", { name: "Save" }).first().click();
  await page.getByText("Saved", { exact: true }).first().waitFor();
  check(true, "settings saves your name");
  await shot("light-5-settings");

  await page.getByRole("link", { name: "Back" }).click();
  await page.getByText("Hi Sam, I'm Lyra.").waitFor();
  check(true, "greeting uses your name");

  const box = page.getByPlaceholder("Message Lyra");
  await box.fill("Remember that Rowan's party is Sat Nov 14, 10:30 AM to 2 PM");
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator(".note", { hasText: "Rowan's party" }).waitFor();
  check(true, "remember shows a memory note");
  await box.fill("When is it?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("practice model").waitFor();
  check(true, "practice model replies");
  await shot("light-2-chat");

  await page.reload();
  await page.getByText("practice model").waitFor();
  check((await page.locator(".bubble").count()) === 2, "chat survives a restart (saved to storage)");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByText("Undone").waitFor();
  check(true, "undo from chat works");

  await page.getByRole("link", { name: "What Lyra can access" }).click();
  await page.getByText("What Lyra has access to").waitFor();
  check((await page.getByText("Needs the Android app").count()) === 1, "browser preview says Gmail needs the Android app");
  await shot("light-3-access");

  await page.getByRole("link", { name: /Memory/ }).click();
  await page.getByRole("heading", { name: "Memory" }).waitFor();
  await shot("light-4-memory");

  // ---- channels ----
  await page.goto(`${base}/#/`);
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  await shot("light-6-drawer-empty");
  await page.getByRole("link", { name: "New channel" }).click();
  await page.getByLabel("Name").fill("Rowan");
  await page.getByLabel("What's it for?").fill("Rowan's 7th birthday party");
  await page.getByRole("radio", { name: "Kids and growing things" }).click();
  await shot("light-7-new-channel");
  await page.getByRole("button", { name: "Create channel" }).click();
  await page.getByRole("heading", { name: "Rowan" }).waitFor();
  check(true, "creates a channel and opens its chat");
  await shot("light-8-channel-empty");

  await page.getByPlaceholder("Message Rowan").fill("The bounce house is booked for 10:30");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("practice model").waitFor();
  check((await page.locator(".bubble").count()) === 1, "channel chat starts empty and holds its own messages");
  await shot("light-9-channel-chat");

  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  check((await page.locator(".drawer-panel .nav-item", { hasText: "Rowan" }).count()) === 1, "drawer lists the channel");
  await page.getByRole("link", { name: "New channel" }).click();
  await page.getByLabel("Name").fill("Home");
  await page.getByRole("radio", { name: "Home" }).click();
  await page.getByRole("button", { name: "Create channel" }).click();
  await page.getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(`${base}/#/c/1`);
  await page.getByText("bounce house").waitFor();
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  await shot("light-10-drawer");
  await page.locator(".shell-scrim").click({ position: { x: 40, y: 400 } });
  await page.waitForSelector(".app:not(.drawer-open)");
  check(true, "tapping the chat closes the drawer");
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.getByRole("link", { name: /Everything/ }).click();
  await page.waitForTimeout(300);
  check((await page.locator(".bubble").count()) === 2, "main chat keeps its own history");

  await page.goto(`${base}/#/c/1/info`);
  await page.getByText("Lyra saves facts about Rowan here").waitFor();
  await shot("light-11-channel-info");
  check(true, "channel page shows its notebook");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${base}/#/c/1`);
  await page.getByText("bounce house").waitFor();
  await shot("dark-9-channel-chat");
  await page.getByRole("button", { name: "Channels" }).click();
  await page.locator(".app.drawer-open").waitFor();
  await page.waitForTimeout(350);
  await shot("dark-10-drawer");
  await page.emulateMedia({ colorScheme: "light" });

  page.once("dialog", (d) => d.accept());
  await page.goto(`${base}/#/c/1/info`);
  await page.getByRole("button", { name: "Delete channel" }).click();
  await page.getByText("Hi Sam, I'm Lyra.").or(page.locator(".bubble").first()).waitFor();
  await page.getByRole("button", { name: "Channels" }).click();
  check((await page.locator(".drawer-panel .nav-item", { hasText: "Rowan" }).count()) === 0, "deleting a channel removes it");
  await page.keyboard.press("Escape");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${base}/#/`);
  await page.getByText("practice model").waitFor();
  await shot("dark-2-chat");

  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!wide, "no sideways scrolling");
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);
  console.log(`\nAll good. Screenshots in ${shots}`);
} finally {
  await browser.close();
  server.kill();
}
