// Lyra for Windows (and other desktops): the same app as the phone, in a window.
// This file is the desktop "shell": it serves the built app, stores files on disk,
// keeps secrets with the OS (DPAPI on Windows), and signs in to Google.
const { app, BrowserWindow, Notification, dialog, ipcMain, nativeTheme, net, protocol, safeStorage, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_ID = "app.lyra.chief";
const BUNDLED_DIST = path.join(__dirname, "dist");
// This file and preload.cjs are the "shell". Updates from Drive replace only the app's
// code in dist (sandboxed web code); a change to the shell needs a full install, and
// raising this number makes older shells refuse packs that need the new one.
// 2: lets the app use the microphone for live voice.
const SHELL_VERSION = 2;
let DIST = BUNDLED_DIST;
let activeVersion = null;
const ICON = path.join(__dirname, "icon.png");

app.setAppUserModelId(APP_ID);
if (!app.requestSingleInstanceLock()) app.quit();

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
const dataDir = () => path.join(app.getPath("userData"), "data");
const backupDir = () => path.join(app.getPath("documents"), "Lyra Backups");

// ---------- files ----------

const safeName = (name) => {
  if (typeof name !== "string" || !/^[\w.\- ]{1,120}$/.test(name) || name.startsWith(".")) throw new Error("Bad file name");
  return name;
};

async function writeAtomic(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, file);
}

ipcMain.handle("files:read", async (_e, name) => {
  try {
    const buf = await fs.promises.readFile(path.join(dataDir(), safeName(name)));
    return /\.(md|json)$/.test(name) ? buf.toString("utf8") : new Uint8Array(buf);
  } catch {
    return null;
  }
});
ipcMain.handle("files:write", (_e, name, data) => writeAtomic(path.join(dataDir(), safeName(name)), typeof data === "string" ? data : Buffer.from(data)));
ipcMain.handle("files:remove", async (_e, name) => {
  await fs.promises.rm(path.join(dataDir(), safeName(name)), { force: true });
});

// ---------- secrets (encrypted by the OS for this Windows user) ----------

const secretsFile = () => path.join(app.getPath("userData"), "secrets.json");
let secretsCache = null;
function secrets() {
  if (!secretsCache) {
    try {
      secretsCache = JSON.parse(fs.readFileSync(secretsFile(), "utf8"));
    } catch {
      secretsCache = {};
    }
  }
  return secretsCache;
}
function getSecret(key) {
  const v = secrets()[key];
  if (!v) return null;
  try {
    return safeStorage.decryptString(Buffer.from(v, "base64"));
  } catch {
    return null;
  }
}
async function setSecret(key, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("This computer can't store secrets safely.");
  secrets()[key] = safeStorage.encryptString(value).toString("base64");
  await writeAtomic(secretsFile(), JSON.stringify(secretsCache));
}
async function removeSecret(key) {
  delete secrets()[key];
  await writeAtomic(secretsFile(), JSON.stringify(secretsCache));
}
const SECRET_KEY = /^[\w.\-]{1,60}$/;
ipcMain.handle("secrets:get", (_e, key) => (SECRET_KEY.test(key) ? getSecret(key) : null));
ipcMain.handle("secrets:set", (_e, key, value) => {
  if (!SECRET_KEY.test(key) || typeof value !== "string") throw new Error("Bad secret");
  return setSecret(key, value);
});
ipcMain.handle("secrets:remove", (_e, key) => (SECRET_KEY.test(key) ? removeSecret(key) : undefined));

// ---------- Google sign-in (OAuth for desktop apps: loopback + PKCE) ----------
// Uses a "Desktop app" OAuth client from your own Google Cloud project, entered in
// Settings. The refresh token is kept encrypted by the OS; Lyra gets short-lived tokens.

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function client() {
  const raw = getSecret("google.client");
  if (!raw) throw new Error("NO_CLIENT");
  return JSON.parse(raw);
}

async function token(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.error === "invalid_grant" ? "NEEDS_CONSENT" : `Google sign-in failed: ${j.error_description || j.error || r.status}`);
    throw err;
  }
  return j;
}

function emailFrom(idToken) {
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")).email;
  } catch {
    return undefined;
  }
}

/** A one-time listener on 127.0.0.1 that catches Google's redirect after you approve. */
function loopback(state) {
  return new Promise((ready, fail) => {
    let finish;
    const result = new Promise((resolve, reject) => (finish = { resolve, reject }));
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (!u.searchParams.has("code") && !u.searchParams.has("error")) {
        res.writeHead(404).end();
        return;
      }
      const ok = u.searchParams.get("state") === state && u.searchParams.has("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Lyra</title><body style="font:18px system-ui;padding:48px;background:#f3f1ea;color:#131416">` +
          (ok ? "<h2>You're signed in.</h2><p>You can close this tab and go back to Lyra.</p>" : "<h2>Sign-in didn't finish.</h2><p>Go back to Lyra and try again.</p>"),
      );
      clearTimeout(timer);
      server.close();
      if (ok) finish.resolve(u.searchParams.get("code"));
      else finish.reject(new Error(u.searchParams.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in didn't finish."));
    });
    const timer = setTimeout(() => {
      server.close();
      finish.reject(new Error("Google sign-in timed out. Try again."));
    }, 5 * 60_000);
    server.on("error", fail);
    server.listen(0, "127.0.0.1", () => ready({ redirectUri: `http://127.0.0.1:${server.address().port}`, code: result }));
  });
}

ipcMain.handle("google:authorize", async (_e, scopes, interactive) => {
  if (!Array.isArray(scopes) || !scopes.every((s) => typeof s === "string")) throw new Error("Bad scopes");
  let c;
  try {
    c = client();
  } catch {
    throw new Error(interactive ? "Set up Google for this computer first: Settings, Google on this computer." : "NEEDS_CONSENT");
  }
  const refresh = getSecret("google.refresh");
  const email = getSecret("google.email") || undefined;
  if (refresh) {
    try {
      const t = await token({ client_id: c.id, client_secret: c.secret, refresh_token: refresh, grant_type: "refresh_token" });
      const granted = String(t.scope || "").split(/\s+/).filter(Boolean);
      if (scopes.every((s) => granted.includes(s))) return { accessToken: t.access_token, grantedScopes: granted, email };
    } catch (e) {
      if (e.message !== "NEEDS_CONSENT") throw e;
    }
  }
  if (!interactive) throw new Error("NEEDS_CONSENT");

  // ask in the browser, adding to whatever was approved before
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const want = [...new Set(["openid", "email", ...scopes])];
  const { redirectUri, code } = await loopback(state);
  const q = new URLSearchParams({
    client_id: c.id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: want.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    ...(email ? { login_hint: email } : {}),
  });
  await shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  const authCode = await code;
  const t = await token({ client_id: c.id, client_secret: c.secret, code: authCode, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri });
  if (t.refresh_token) await setSecret("google.refresh", t.refresh_token);
  const who = (t.id_token && emailFrom(t.id_token)) || email;
  if (who) await setSecret("google.email", who);
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  return { accessToken: t.access_token, grantedScopes: String(t.scope || "").split(/\s+/).filter(Boolean), email: who };
});

ipcMain.handle("google:signOut", async () => {
  const refresh = getSecret("google.refresh");
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => {});
  await removeSecret("google.refresh");
  await removeSecret("google.email");
});

// ---------- backups on this computer ----------

// a rolling copy of every sync snapshot, in Documents\Lyra Backups (newest 20 kept)
ipcMain.handle("backup:keep", async (_e, name, bytes) => {
  const dir = backupDir();
  await writeAtomic(path.join(dir, safeName(name)), Buffer.from(bytes));
  const all = (await fs.promises.readdir(dir)).filter((f) => f.startsWith("Lyra auto ") && f.endsWith(".lyra")).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 20))) await fs.promises.rm(path.join(dir, old), { force: true });
  return dir;
});

// "Back up Lyra" in Settings: ask where to save
ipcMain.handle("backup:saveAs", async (_e, name, bytes) => {
  await fs.promises.mkdir(backupDir(), { recursive: true });
  const r = await dialog.showSaveDialog(win, {
    title: "Save your Lyra backup",
    defaultPath: path.join(backupDir(), safeName(name)),
    filters: [{ name: "Lyra backup", extensions: ["lyra"] }],
  });
  if (r.canceled || !r.filePath) return null;
  await writeAtomic(r.filePath, Buffer.from(bytes));
  return r.filePath;
});

ipcMain.handle("backup:openFolder", async () => {
  await fs.promises.mkdir(backupDir(), { recursive: true });
  await shell.openPath(backupDir());
});

// ---------- notifications ----------

ipcMain.handle("notify", (_e, title, body, hash) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300), icon: ICON });
  n.on("click", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send("open-hash", String(hash));
  });
  n.show();
});

ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch }));

// ---------- window ----------

function startMenuShortcut() {
  if (process.platform !== "win32" || !app.isPackaged) return;
  const link = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Lyra.lnk");
  const want = { target: process.execPath, appUserModelId: APP_ID, description: "Lyra, your chief of staff", icon: process.execPath, iconIndex: 0 };
  try {
    const have = fs.existsSync(link) ? shell.readShortcutLink(link) : null;
    if (!have || have.target !== process.execPath) shell.writeShortcutLink(link, have ? "replace" : "create", want);
  } catch {
    // not fatal: Lyra still runs from its folder
  }
}

// Lyra draws its own title bar; Windows keeps its minimize, maximize and close buttons, in Lyra's colors.
const themeColors = () =>
  nativeTheme.shouldUseDarkColors ? { bg: "#0d0f13", symbol: "#eceef1" } : { bg: "#f3f1ea", symbol: "#131416" };
const overlay = () => ({ color: themeColors().bg, symbolColor: themeColors().symbol, height: 52 });

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 400,
    minHeight: 560,
    title: "Lyra",
    icon: ICON,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: overlay(),
    backgroundColor: themeColors().bg,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.setMenu(null);
  nativeTheme.on("updated", () => {
    if (!win) return;
    win.setBackgroundColor(themeColors().bg);
    if (process.platform !== "darwin") win.setTitleBarOverlay?.(overlay());
  });
  // links (sources, emails) open in your browser, never inside Lyra
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://lyra/")) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  void win.loadURL("app://lyra/index.html");
  win.on("closed", () => (win = null));
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

// What the page may load and talk to: its own files, and HTTPS (the model APIs, Google).
// http is allowed only for a model server you run yourself (Ollama, LM Studio).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

// ---------- updates: app packs from your Drive ----------

const packsDir = () => path.join(app.getPath("userData"), "app-packs");
const currentFile = () => path.join(packsDir(), "current.json");
const cmpVersions = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  return 0;
};

/** The newest installed pack this shell can run, or null for the code that came with the app. */
function choosePack() {
  try {
    const cur = JSON.parse(fs.readFileSync(currentFile(), "utf8"));
    if (cur.trial && cur.tried) {
      // last start on this pack never reached "ok": go back to the built-in code
      fs.rmSync(currentFile(), { force: true });
      return null;
    }
    if (cmpVersions(cur.version, app.getVersion()) <= 0 || cur.minShell > SHELL_VERSION) return null;
    const dir = path.join(packsDir(), cur.version, "dist");
    if (!fs.existsSync(path.join(dir, "index.html"))) return null;
    if (cur.trial) fs.writeFileSync(currentFile(), JSON.stringify({ ...cur, tried: true }));
    return { version: cur.version, dir };
  } catch {
    return null;
  }
}

ipcMain.handle("updates:info", () => ({ shellVersion: SHELL_VERSION, bundledVersion: app.getVersion(), runningVersion: activeVersion ?? app.getVersion() }));

// the app started fine on a new pack: keep it
ipcMain.handle("updates:ok", () => {
  try {
    const cur = JSON.parse(fs.readFileSync(currentFile(), "utf8"));
    if (cur.trial) fs.writeFileSync(currentFile(), JSON.stringify({ version: cur.version, minShell: cur.minShell }));
  } catch {
    // no pack: nothing to confirm
  }
});

ipcMain.handle("updates:installPack", async (_e, bytes) => {
  const zlib = require("node:zlib");
  let pack;
  try {
    const raw = zlib.gunzipSync(Buffer.from(bytes), { maxOutputLength: 80 * 1024 * 1024 });
    pack = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("That update file is damaged.");
  }
  if (pack.format !== "lyra-pack" || !/^\d+\.\d+\.\d+$/.test(pack.version) || typeof pack.files !== "object") throw new Error("That isn't a Lyra update.");
  if (pack.minShell > SHELL_VERSION) return { installed: false, needsFullInstall: true, version: pack.version };
  const names = Object.keys(pack.files);
  if (!names.includes("dist/index.html") || !names.every((n) => /^dist\/[\w\-.\/]+$/.test(n) && !n.includes(".."))) throw new Error("That update has unexpected files.");
  const root = path.join(packsDir(), pack.version);
  const tmp = `${root}.tmp`;
  await fs.promises.rm(tmp, { recursive: true, force: true });
  for (const n of names) {
    const file = path.join(tmp, n);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, Buffer.from(pack.files[n], "base64"));
  }
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.rename(tmp, root);
  await writeAtomic(currentFile(), JSON.stringify({ version: pack.version, minShell: pack.minShell, trial: true }));
  // drop older packs
  for (const d of await fs.promises.readdir(packsDir())) {
    if (/^\d+\.\d+\.\d+$/.test(d) && d !== pack.version) await fs.promises.rm(path.join(packsDir(), d), { recursive: true, force: true });
  }
  return { installed: true, needsFullInstall: false, version: pack.version };
});

ipcMain.handle("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
});

app.whenReady().then(() => {
  const pack = choosePack();
  if (pack) {
    DIST = pack.dir;
    activeVersion = pack.version;
  }
  // only for automated tests on Linux machines with no keyring; Windows always has DPAPI
  if (process.platform === "linux" && process.env.LYRA_DESKTOP_TEST === "1") safeStorage.setUsePlainTextEncryption?.(true);
  // the built app, served from inside Lyra (no web server, nothing exposed)
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return new Response("Not found", { status: 404 });
    const target = fs.existsSync(file) ? file : path.join(DIST, "index.html");
    const r = await net.fetch(pathToFileURL(target).toString());
    if (!target.endsWith(".html")) return r;
    const headers = new Headers(r.headers);
    headers.set("Content-Security-Policy", CSP);
    return new Response(r.body, { status: r.status, headers });
  });
  startMenuShortcut();
  createWindow();
  // only what Lyra uses: notifications, the clipboard, and the microphone for live voice (never the camera)
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb, details) =>
    cb(perm === "notifications" || perm === "clipboard-sanitized-write" || (perm === "media" && (details.mediaTypes ?? []).every((t) => t === "audio"))),
  );
});

app.on("window-all-closed", () => app.quit());
