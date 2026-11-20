import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from './store.js';
import { Providers } from './providers.js';
import { Hub } from './server.js';

const dataDir = process.env.ORBIT_HUB_DATA || path.join(os.homedir(), '.orbit-hub');
const configFile = path.join(dataDir, 'config.json');

const DEFAULT_CONFIG = {
  name: os.hostname(),
  port: 8787,
  discoveryPort: 8788,
  providers: {
    anthropic: { apiKey: '' },
    openai: { apiKey: '' },
    xai: { apiKey: '' },
    gemini: { apiKey: '' },
    openrouter: { apiKey: '' },
    ollama: { baseUrl: 'http://localhost:11434/v1' },
  },
};

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { mode: 0o600 });
}
const config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) };

const showCode = (code) => console.log(`\n  Pairing code:  ${code.slice(0, 3)} ${code.slice(3)}\n`);

const providers = new Providers(config.providers);
const hub = new Hub({ store: new Store(dataDir), providers, name: config.name, onPairingCode: showCode });
const port = await hub.listen(Number(process.env.PORT) || config.port);
hub.startDiscovery(config.discoveryPort, port);

// Only addresses a phone on the same network can reach: skip self-assigned (169.254.x) addresses and
// the virtual adapters that WSL, Hyper-V, Docker and VM software create.
const VIRTUAL = /vethernet|wsl|hyper-v|docker|virtualbox|vmware|vbox|loopback|tailscale|zerotier/i;
const addresses = Object.entries(os.networkInterfaces())
  .filter(([name]) => !VIRTUAL.test(name))
  .flatMap(([, nets]) => nets ?? [])
  .filter((n) => n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
  .map((n) => `${n.address}:${port}`);

console.log(`Orbit hub "${config.name}" is running.`);
console.log(`  Address:       ${addresses.join('  or  ') || `localhost:${port}`}`);
console.log(`  Config & data: ${dataDir}`);
const ready = providers.list().filter((p) => p.configured && p.id !== 'demo' && p.id !== 'ollama').map((p) => p.label);
console.log(`  Model keys:    ${ready.length ? ready.join(', ') : `none yet (add them to ${configFile})`}`);
showCode(hub.pairingCode);
console.log('Open Orbit on your phone and enter the address and code above.');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    hub.close();
    process.exit(0);
  });
}
