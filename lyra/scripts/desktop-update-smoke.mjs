// The Windows app updating itself from a pretend Drive: finds a newer app pack in
// "Lyra Updates", installs it, runs it after a restart, and rolls back a pack that
// never finished starting. Run: npm run desktop -- --stage-only && xvfb-run -a node scripts/desktop-update-smoke.mjs
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright");
const root = resolve(import.meta.dirname, "..");
const stage = join(root, "build/desktop-app");
const home = mkdtempSync(join(tmpdir(), "lyra-update-"));
const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

// a pack of the current build, labelled as a much newer version
const dist = join(stage, "dist");
const files = {};
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else files[`dist/${relative(dist, p).split("\\").join("/")}`] = readFileSync(p).toString("base64");
  }
};
walk(dist);
const NEW = "9.9.9";
const pack = gzipSync(Buffer.from(JSON.stringify({ format: "lyra-pack", version: NEW, minShell: 1, files })));

async function fakeGoogle(route) {
  const url = new URL(route.request().url());
  const q = url.searchParams.get("q") ?? "";
  if (url.searchParams.get("alt") === "media") return route.fulfill({ body: pack, contentType: "application/octet-stream" });
  if (q.includes("Lyra Updates")) return route.fulfill({ json: { files: [{ id: "folder1" }] } });
  if (q.includes("'folder1' in parents")) return route.fulfill({ json: { files: [{ id: "pack1", name: `Lyra-app-${NEW}.lyrapack`, size: String(pack.length) }] } });
  return route.fulfill({ json: { files: [] } });
}

const launch = async () => {
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [stage, "--password-store=basic", "--no-sandbox"],
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), LYRA_DESKTOP_TEST: "1" },
  });
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("google:authorize");
    ipcMain.handle("google:authorize", (_e, scopes) => ({ accessToken: "tok", grantedScopes: [...scopes, "openid", "email"], email: "me@example.com" }));
  });
  const page = await app.firstWindow();
  await page.route("https://www.googleapis.com/**", fakeGoogle);
  return { app, page };
};
const running = (page) => page.evaluate(() => window.lyraDesktop.updates.info().then((i) => i.runningVersion));

let { app, page } = await launch();
await page.getByText("I'm Lyra.").waitFor({ timeout: 20_000 });
const before = await running(page);
await page.goto("app://lyra/index.html#/access");
await page.locator(".lp-svc", { hasText: "Files" }).click();
await page.getByText("Google Drive is connected").waitFor();
await page.goto("app://lyra/index.html#/settings/about");
await page.locator("section", { hasText: "Updates" }).getByRole("button", { name: "Check" }).click();
await page.getByText(`Lyra ${NEW} is in your Drive.`).waitFor();
check(true, "finds a newer version in the Lyra Updates folder");
await page.locator("section", { hasText: "Updates" }).getByRole("button", { name: "Update" }).click();
await page.getByText(`${NEW} is ready. Restart Lyra to use it.`).waitFor({ timeout: 20_000 });
check(true, "downloads and installs it, ready on restart");
await app.close();

({ app, page } = await launch());
await page.getByText("I'm Lyra.").waitFor({ timeout: 20_000 });
check((await running(page)) === NEW && before !== NEW, `after a restart it runs the new version (${before} → ${NEW})`);
await page.waitForTimeout(500); // the app reports it started fine
const current = join(home, ".config", "Lyra", "app-packs", "current.json");
check(!JSON.parse(readFileSync(current, "utf8")).trial, "a pack that starts fine is kept");
await app.close();

// a pack that crashed before saying it started: the next start goes back to the built-in code
writeFileSync(current, JSON.stringify({ version: NEW, minShell: 1, trial: true, tried: true }));
({ app, page } = await launch());
await page.getByText("I'm Lyra.").waitFor({ timeout: 20_000 });
check((await running(page)) === before, "a pack that never finished starting is rolled back");
await app.close();
console.log("\nDesktop updates OK");
