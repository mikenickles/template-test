// End-to-end check on a phone-sized screen, using the practice model (no API key).
// Run: npm run build && npm run smoke [-- <screenshot folder>]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
// Playwright is a dev-only tool here; it is not one of Lyra's dependencies.
const { chromium, devices } = require("playwright");
const Database = require("better-sqlite3");

const root = resolve(import.meta.dirname, "..");
const shots = resolve(process.argv[2] ?? join(root, "smoke-shots"));
mkdirSync(shots, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), "lyra-smoke-"));
const port = 4399;
const base = `http://localhost:${port}`;

const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  cwd: root,
  env: { ...process.env, LYRA_DATA_DIR: dataDir, LYRA_PORT: String(port), LYRA_PROVIDER: "fake", LYRA_USER_NAME: "Sam", LYRA_HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((ok, fail) => {
  server.stdout.on("data", (d) => String(d).includes("Lyra is running") && ok());
  server.on("exit", (c) => fail(new Error(`server exited ${c}`)));
  setTimeout(() => fail(new Error("server did not start")), 20_000);
});

const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const shot = async (name) => {
      await page.waitForTimeout(350); // let entrance animations finish
      await page.screenshot({ path: join(shots, `${scheme}-${name}.png`) });
    };

    await page.goto(base);
    if (scheme === "light") {
      await page.getByText("I'm Lyra.").waitFor();
      check(true, "empty chat shows the greeting");
      await shot("1-empty");

      const box = page.getByPlaceholder("Message Lyra");
      await box.fill("Remember that Rowan's party is Sat Nov 14, 10:30 AM to 2 PM");
      await page.getByRole("button", { name: "Send" }).click();
      await page.getByText("Saved to open loops").waitFor();
      check(true, "remember shows a memory note with Undo");
      await box.fill("When is it?");
      await page.getByRole("button", { name: "Send" }).click();
      await page.getByText("practice model").waitFor();
      check(true, "practice model replies");

      // A held suggestion, as if Lyra had read an email this turn.
      const db = new Database(join(dataDir, "lyra.db"));
      const sid = db.prepare("INSERT INTO memory_suggestions (section, text) VALUES (?, ?) RETURNING id").get("Open loops", "School trip form due Friday 5 PM").id;
      db.prepare("INSERT INTO messages (role, content) VALUES ('user', ?)").run("Anything from school?");
      db.prepare("INSERT INTO messages (role, content, meta) VALUES ('assistant', ?, ?)").run(
        "Oak School wants the trip form signed by Friday at 5 PM.\n\n- **Where:** the form is attached to their email.\n- **Cost:** $12, cash or check.",
        JSON.stringify({ memory: [{ kind: "suggested", section: "Open loops", text: "School trip form due Friday 5 PM", suggestionId: sid }] }),
      );
      db.close();
      await page.reload();
      await page.getByText("Save to open loops?").waitFor();
      await shot("2-chat");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.locator(".note", { hasText: "School trip form" }).waitFor();
      check(true, "approving a held suggestion saves it");
      await page.getByRole("button", { name: "Undo" }).first().click();
      await page.getByText("Undone").waitFor();
      check(true, "undo from chat works");
    } else {
      await page.getByText("Save to open loops").first().waitFor({ state: "attached" }).catch(() => {});
      await page.waitForTimeout(300);
      await shot("2-chat");
    }

    await page.getByRole("link", { name: "What Lyra can access" }).click();
    await page.getByText("What Lyra has access to").waitFor();
    check((await page.getByText("Not set up yet").count()) === 1, `${scheme}: access page shows Mail not set up`);
    await shot("3-access");

    await page.getByRole("link", { name: /Memory/ }).click();
    await page.getByRole("heading", { name: "Memory" }).waitFor();
    check((await page.getByText("School trip form due Friday 5 PM").count()) === 1, `${scheme}: memory page lists saved facts`);
    await shot("4-memory");

    await page.goto(`${base}/#/settings`);
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await shot("5-settings");

    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!wide, `${scheme}: no sideways scrolling`);
    check(errors.length === 0, `${scheme}: no page errors ${errors.join("; ")}`);
    await ctx.close();
  }

  const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await desk.goto(base);
  await desk.getByText("Oak School").waitFor();
  await desk.screenshot({ path: join(shots, "desktop-chat.png") });
  console.log(`\nAll good. Screenshots in ${shots}`);
} finally {
  await browser.close();
  server.kill();
}
