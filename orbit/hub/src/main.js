import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import * as autostart from './autostart.js';
import { configFile, dataDir, loadConfig, saveConfig } from './config.js';
import { ensureFirewall } from './firewall.js';
import { Folders } from './folders.js';
import { hubAddresses } from './network.js';
import { Providers } from './providers.js';
import { Google } from './google.js';
import { qrTerminal } from './qr.js';
import { Hub } from './server.js';
import { feedUrl } from './feed.js';
import { Store } from './store.js';

const config = loadConfig();
// Started from Windows sign-in: run quietly, no questions, no browser.
const background = process.argv.includes('--background') || Boolean(process.env.ORBIT_NO_BROWSER);
const interactive = process.stdin.isTTY && !background;
// On Windows the hub moves itself to the background, with no window, unless asked to keep one.
const keepWindow = process.argv.includes('--window') || Boolean(process.env.ORBIT_WINDOW);
const windows = autostart.supported();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const store = new Store(dataDir);
const providers = new Providers(config.providers, process.env, (updated) => {
  config.providers = updated;
  saveConfig(config);
});
// Folders agents may read. Shared on the PC only, from the hub's page; the hub's own data is never readable.
const folders = new Folders(config.folders, {
  protect: [dataDir],
  onChange: (updated) => {
    config.folders = updated;
    saveConfig(config);
  },
});
const google = new Google({
  config: config.google,
  onChange: (updated) => {
    config.google = updated;
    saveConfig(config);
  },
});
const hubDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * An update was just installed. Start Orbit.bat sees exit code 75, fetches anything new and starts the
 * hub again. Started any other way, the hub does that itself.
 */
function restartForUpdate(version) {
  console.log(`Treehouse ${version} is installed. Restarting...`);
  hub.close();
  if (process.env.ORBIT_SUPERVISED) process.exit(75);
  spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: hubDir, stdio: 'inherit', shell: true });
  spawn(process.execPath, process.argv.slice(1), { cwd: hubDir, stdio: 'inherit', detached: true }).unref();
  process.exit(0);
}

const hub = new Hub({
  store, providers, folders, prices: config.prices, name: config.name, onPairingCode: () => showPairing(), onRestart: restartForUpdate,
  feedUrl: feedUrl(hubDir, config), google, log: (line) => console.log(line),
  // Running without a window: whether it starts with Windows, and stopping it from the Treehouse page.
  background: windows ? {
    status: () => ({ autostart: autostart.isEnabled(), hidden: autostart.isHidden(), log: autostart.logPath() }),
    setAutostart: (on) => {
      if (on) autostart.enable();
      else autostart.disable();
      config.autostart = on;
      saveConfig(config);
    },
    stop: () => {
      console.log('Stopped from the Treehouse page.');
      hub.close();
      process.exit(0);
    },
  } : null,
});

/**
 * Listens on the hub's port. Started hidden right after a window handed over, the old hub may still be letting
 * go of it for a moment, so a busy port is tried again for a little while.
 */
async function listen(wanted) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await hub.listen(wanted);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      // Started by hand while Treehouse already runs in the background: open it, and leave that one running.
      if (!autostart.isHidden() && (await alreadyRunning(wanted))) {
        console.log('Treehouse is already running in the background. Opening it...');
        openInBrowser(`http://localhost:${wanted}`);
        await sleep(1500);
        closeWindow();
        process.exit(0);
      }
      if (attempt >= 15) throw err;
      await sleep(2000);
    }
  }
}

async function alreadyRunning(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/hub`, { signal: AbortSignal.timeout(2000) });
    return res.ok && (await res.json()).app === 'orbit-hub';
  } catch {
    return false;
  }
}

/** Started by Start Orbit.bat: closes its window too, rather than leaving "press any key" behind. */
function closeWindow() {
  if (!process.env.ORBIT_SUPERVISED) return;
  try {
    process.kill(process.ppid);
  } catch {
    // The window just stays until it's closed.
  }
}
const port = await listen(Number(process.env.PORT) || config.port);

// The launcher and the Treehouse shortcut, rewritten each start so they follow the hub. Starting with Windows
// switches from the old minimized window to the hidden launcher by itself.
if (windows) {
  autostart.prepare(port);
  if (autostart.isEnabled() || config.autostart) autostart.enable();
  const firstTime = !config.shortcuts;
  autostart.makeShortcuts({ desktop: firstTime }).then((made) => {
    if (made && firstTime) {
      config.shortcuts = true;
      saveConfig(config);
    }
  });
}
hub.startDiscovery(config.discoveryPort, port);

// The home network address first, and a Tailscale address for away from home if the PC has one.
// Checked again every minute: Tailscale often connects after the hub has started with Windows.
let { home: addresses, away } = hubAddresses(port);
hub.setAddresses(addresses, away);
setInterval(() => {
  const now = hubAddresses(port);
  if (now.away.join() !== away.join()) console.log(`Away from home: ${now.away.join(', ') || 'Tailscale is off'}`);
  ({ home: addresses, away } = now);
  hub.setAddresses(addresses, away);
}, 60_000).unref();

const pairPage = `http://localhost:${port}/pair`;
const appPage = `http://localhost:${port}`;

function showPairing() {
  const code = hub.pairingCode;
  console.log('');
  console.log('  Pair your phone: open Treehouse, tap "Scan QR code", and scan this.');
  console.log('');
  console.log(qrTerminal(hub.pairingLink()));
  console.log('');
  console.log(`  Or type   ${addresses[0] ?? `localhost:${port}`}   and the code   ${code.slice(0, 3)} ${code.slice(3)}`);
  console.log(`  A larger QR code is at ${pairPage}, where you can also share folders with your agents.`);
  console.log('');
}

function openInBrowser(url) {
  const command =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
  } catch {
    // No browser available; the address is printed anyway.
  }
}

console.log(`Treehouse hub "${config.name}" is running.`);
const keyed = providers.list().filter((p) => p.takesKey && p.configured).map((p) => p.label);
console.log(`  Model keys:  ${keyed.length ? keyed.join(', ') : 'none yet. Add one in the app: Settings, then AI models.'}`);
const shared = folders.list().map((f) => f.name);
console.log(`  Folders:     ${shared.length ? shared.join(', ') : `none shared. Share one at ${pairPage}`}`);
console.log(`  Away:        ${away.length ? `${away.join(', ')} (Tailscale)` : 'not set up. Install Tailscale on this PC and your phone to use Treehouse anywhere.'}`);
console.log(`  Updates:     ${hub.feed.url ? 'checked in your Google Drive every few hours, and ' : ''}saved in ${hub.updates.dir}`);
console.log(`  Desktop app: ${appPage}  (in Edge or Chrome, use "Install Treehouse" to keep it as an app)`);
console.log(`  Data:        ${dataDir}`);

await ensureFirewall({ port, discoveryPort: config.discoveryPort, dataDir, log: (line) => console.log(line) });

showPairing();
hub.feed.start();
if (!background && store.state.devices.length === 0) openInBrowser(pairPage);

// First run on Windows: offer to start with the computer, so the hub is always there.
if (interactive && autostart.supported() && config.autostart === undefined) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await prompt.question('Start Treehouse automatically when you sign in to Windows? (Y/n) ')).trim().toLowerCase();
  prompt.close();
  config.autostart = answer !== 'n' && answer !== 'no';
  saveConfig(config);
  if (config.autostart) {
    autostart.enable();
    console.log('Done. It will start in the background when you sign in. Change this on the Treehouse page, Settings, This PC.');
  } else {
    console.log('OK. You can turn it on later on the Treehouse page, Settings, This PC.');
  }
}

/**
 * Hands over to a copy of the hub with no window, through the launcher, then closes this window. Nothing is
 * lost: the new copy reads the same data. If Windows won't run the launcher, this window keeps the hub.
 */
async function moveToBackground() {
  console.log('');
  console.log('Treehouse runs in the background from now on, so this window will close by itself.');
  console.log('Open Treehouse any time from its shortcut on your desktop or in the Start menu.');
  await sleep(interactive ? 8000 : 2000);
  if (!fs.existsSync(autostart.launcherPath())) {
    console.log(`Keep this window open while you use Treehouse. Settings live in ${configFile}.`);
    return;
  }
  hub.close();
  await sleep(500);
  if (!(await autostart.startHidden())) {
    console.log('Windows would not start Treehouse in the background. Double-click Start Orbit.bat to start it again.');
    process.exit(1);
  }
  closeWindow();
  process.exit(0);
}

if (windows && !autostart.isHidden() && !keepWindow) await moveToBackground();
else console.log(`${!windows ? 'Treehouse is running.' : autostart.isHidden() ? 'Treehouse is running in the background.' : 'Keep this window open while you use Treehouse.'} Settings live in ${configFile}.`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    hub.close();
    process.exit(0);
  });
}
