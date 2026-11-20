import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import * as autostart from './autostart.js';
import { configFile, dataDir, loadConfig, saveConfig } from './config.js';
import { ensureFirewall } from './firewall.js';
import { Folders } from './folders.js';
import { hubAddresses } from './network.js';
import { Providers } from './providers.js';
import { qrTerminal } from './qr.js';
import { Hub } from './server.js';
import { Store } from './store.js';

const config = loadConfig();
// Started from Windows sign-in: run quietly, no questions, no browser.
const background = process.argv.includes('--background') || Boolean(process.env.ORBIT_NO_BROWSER);
const interactive = process.stdin.isTTY && !background;

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
const hub = new Hub({ store, providers, folders, prices: config.prices, name: config.name, onPairingCode: () => showPairing() });
const port = await hub.listen(Number(process.env.PORT) || config.port);
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

const pairPage = `http://localhost:${port}`;

function showPairing() {
  const code = hub.pairingCode;
  console.log('');
  console.log('  Pair your phone: open Orbit, tap "Scan QR code", and scan this.');
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

console.log(`Orbit hub "${config.name}" is running.`);
const keyed = providers.list().filter((p) => p.takesKey && p.configured).map((p) => p.label);
console.log(`  Model keys:  ${keyed.length ? keyed.join(', ') : 'none yet. Add one in the app: Settings, then Model providers.'}`);
const shared = folders.list().map((f) => f.name);
console.log(`  Folders:     ${shared.length ? shared.join(', ') : `none shared. Share one at ${pairPage}`}`);
console.log(`  Away:        ${away.length ? `${away.join(', ')} (Tailscale)` : 'not set up. Install Tailscale on this PC and your phone to use Orbit anywhere.'}`);
console.log(`  Data:        ${dataDir}`);

await ensureFirewall({ port, discoveryPort: config.discoveryPort, dataDir, log: (line) => console.log(line) });

showPairing();
if (!background && store.state.devices.length === 0) openInBrowser(pairPage);

// First run on Windows: offer to start with the computer, so the hub is always there.
if (interactive && autostart.supported() && config.autostart === undefined) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await prompt.question('Start the Orbit hub automatically when you sign in to Windows? (Y/n) ')).trim().toLowerCase();
  prompt.close();
  config.autostart = answer !== 'n' && answer !== 'no';
  saveConfig(config);
  if (config.autostart) {
    autostart.enable();
    console.log('Done. It will start minimized when you sign in. Turn this off with "npm run autostart:off".');
  } else {
    console.log('OK. You can turn it on later with "npm run autostart:on".');
  }
}

console.log(`Keep this window open while you use Orbit. Settings live in ${configFile}.`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    hub.close();
    process.exit(0);
  });
}
