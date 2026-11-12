// Two copies of the desktop app sharing a pretend Google Drive: turns sync on in one,
// joins from the other, hands messages both ways, and resolves a conflict, all
// through the real screens (including the restart after loading new data).
// Run: npm run desktop -- --stage-only && xvfb-run -a node scripts/desktop-sync-smoke.mjs
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright");
const root = resolve(import.meta.dirname, "..");
const stage = join(root, "build/desktop-app");
const shots = resolve(process.argv[2] ?? join(root, "smoke-shots"));
const PASS = "correct horse battery";
const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

// ---- the pretend Drive (Lyra's hidden app folder) ----
const drive = new Map();
let nextId = 0;
function multipart(buf, type) {
  const boundary = Buffer.from(`--${type.match(/boundary=(.+)$/)[1]}`);
  const parts = [];
  let at = buf.indexOf(boundary);
  while (at !== -1) {
    const next = buf.indexOf(boundary, at + boundary.length);
    if (next === -1) break;
    const part = buf.subarray(at + boundary.length + 2, next - 2); // skip \r\n, drop trailing \r\n
    const split = part.indexOf("\r\n\r\n");
    parts.push(part.subarray(split + 4));
    at = next;
  }
  return parts;
}
async function fakeDrive(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "POST" && url.pathname === "/upload/drive/v3/files") {
    const [meta, bytes] = multipart(req.postDataBuffer(), req.headers()["content-type"]);
    const id = `f${++nextId}`;
    drive.set(id, { appProperties: JSON.parse(meta.toString("utf8")).appProperties, bytes: Buffer.from(bytes) });
    return route.fulfill({ json: { id } });
  }
  const m = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  if (m && req.method() === "DELETE") {
    drive.delete(m[1]);
    return route.fulfill({ status: 204, body: "" });
  }
  if (m && url.searchParams.get("alt") === "media") return route.fulfill({ body: drive.get(m[1]).bytes, contentType: "application/octet-stream" });
  if (url.pathname === "/drive/v3/files") return route.fulfill({ json: { files: [...drive].map(([id, f]) => ({ id, appProperties: f.appProperties })) } });
  return route.fulfill({ status: 404, body: "unexpected" });
}

async function device(name) {
  const home = mkdtempSync(join(tmpdir(), `lyra-${name}-`));
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [stage, "--password-store=basic", "--no-sandbox"],
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), LYRA_DESKTOP_TEST: "1" },
  });
  // Google sign-in: pretend the user approved (the real one opens the browser)
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("google:authorize");
    ipcMain.handle("google:authorize", (_e, scopes) => ({ accessToken: "tok", grantedScopes: [...scopes, "openid", "email"], email: "me@example.com" }));
  });
  const page = await app.firstWindow();
  await page.route("https://www.googleapis.com/**", fakeDrive);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept()); // "this replaces what's on this device"
  await page.getByText("I'm Lyra.").waitFor({ timeout: 20_000 });
  const say = async (text) => {
    await page.goto("app://lyra/index.html#/");
    await page.getByPlaceholder("Message Lyra").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".bubble", { hasText: text }).waitFor();
  };
  const settings = async () => {
    await page.goto("app://lyra/index.html#/settings/sync");
    await page.getByRole("heading", { name: "Sync and backup" }).waitFor();
  };
  const shows = async (text) => {
    await page.goto("app://lyra/index.html#/");
    await page.locator(".bubble", { hasText: text }).waitFor({ timeout: 20_000 });
  };
  const documents = await app.evaluate(({ app }) => app.getPath("documents"));
  return { app, page, errors, say, settings, shows, documents };
}

const snapshots = () => [...drive.values()].filter((f) => f.appProperties.kind !== "conflict");

const a = await device("a");
await a.say("Sent on computer A");
await a.settings();
await a.page.getByRole("button", { name: /Turn on sync/ }).click();
await a.page.getByRole("heading", { name: "Turn on sync" }).waitFor();
await a.page.getByLabel("This device's name").fill("Computer A");
await a.page.getByLabel("Sync passphrase").fill(PASS);
await a.page.getByLabel("Type it again").fill(PASS);
await a.page.screenshot({ path: join(shots, "desktop-3-sync-setup.png") });
await a.page.getByRole("button", { name: "Turn on", exact: true }).click();
await a.page.getByText("Sync is on", { exact: true }).waitFor();
check(snapshots().length === 1, "turning sync on uploads the first encrypted snapshot");
check(!snapshots()[0].bytes.includes(Buffer.from("Sent on computer A")), "the snapshot in Drive is unreadable without the passphrase");
await a.page.getByText("On · Computer A").waitFor();
await a.page.screenshot({ path: join(shots, "desktop-4-sync-on.png") });

const b = await device("b");
await b.settings();
await b.page.getByRole("button", { name: /Turn on sync/ }).click();
await b.page.getByRole("heading", { name: "Join sync" }).waitFor();
check(await b.page.getByText("already syncing from Computer A").isVisible(), "a second device is offered to join");
await b.page.getByLabel("This device's name").fill("Computer B");
await b.page.getByLabel("Sync passphrase").fill("not the passphrase");
await b.page.getByRole("button", { name: "Join", exact: true }).click();
await b.page.getByRole("alert").filter({ hasText: "passphrase" }).waitFor();
check(true, "joining with the wrong passphrase is refused");
await b.page.getByLabel("Sync passphrase").fill(PASS);
await b.page.getByRole("button", { name: "Join", exact: true }).click();
await b.shows("Sent on computer A");
check(true, "joining loads the other device's chats (after a restart)");

await b.say("Sent on computer B");
await b.page.waitForTimeout(6000); // uploads a few seconds after a change
check(snapshots().length === 2, "a change uploads by itself a few seconds later");
await a.settings();
await a.page.getByRole("button", { name: "Sync now" }).click();
await a.shows("Sent on computer B");
check(true, "the other device picks it up (Sync now, or within a minute)");

// both change while apart: A uploads first, B is asked
await a.say("A while apart");
await a.page.waitForTimeout(6000); // A's change is in Drive first
await b.say("B while apart"); // B changed too, without having loaded A's
await b.page.waitForTimeout(6000);
const asked = b.page.getByRole("alertdialog", { name: "Lyra changed on both devices" });
await asked.waitFor({ timeout: 20_000 });
await b.page.screenshot({ path: join(shots, "desktop-5-conflict.png") });
check(true, "when both changed, Lyra asks which to keep");
await b.page.getByRole("button", { name: "Use Computer A's" }).click();
await b.shows("A while apart");
check((await b.page.locator(".bubble", { hasText: "B while apart" }).count()) === 0, "picking the other device's version loads it");
check([...drive.values()].some((f) => f.appProperties.kind === "conflict"), "the side not kept is saved in Drive just in case");

const kept = (d) => (existsSync(join(d.documents, "Lyra Backups")) ? readdirSync(join(d.documents, "Lyra Backups")) : []).filter((f) => f.startsWith("Lyra auto "));
check(kept(a).length >= 2 && kept(b).length >= 2, `each computer keeps encrypted copies in Documents/Lyra Backups (${kept(a).length} and ${kept(b).length})`);
check(a.errors.length === 0 && b.errors.length === 0, `no page errors ${[...a.errors, ...b.errors].join("; ")}`);
await a.app.close();
await b.app.close();
console.log("\nSync between two desktops OK");
