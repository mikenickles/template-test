import { execFile } from 'node:child_process';
import { startScheduler } from './agent/runner.ts';
import { DATA_DIR, DEMO, lanAddresses, PORT } from './config.ts';
import { openDb } from './db.ts';
import { startDemo } from './demo.ts';
import { createServer } from './server.ts';
import { getSettings } from './settings.ts';
import { setFetch } from './tools/execute.ts';

openDb();

let fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);
if (DEMO) {
  fetchImpl = startDemo();
  setFetch(fetchImpl);
}

const address = `http://127.0.0.1:${PORT}`;

function openBrowser(url: string): void {
  if (process.argv.includes('--no-open') || process.env.ARLO_NO_OPEN) return;
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  execFile(cmd as string, args as string[], { windowsHide: true }, () => {});
}

const server = createServer({ port: PORT, fetch: fetchImpl, onRemoteAccessChange: rebind });

function listen(first: boolean): void {
  const remote = getSettings().remoteAccess;
  // Without phone access the hub is reachable from this computer only.
  server.listen(PORT, remote ? '0.0.0.0' : '127.0.0.1', () => {
    if (!first) return;
    console.log(`\n  ${getSettings().agentName} is awake${DEMO ? ' (demo mode: pretend accounts, no keys needed)' : ''}\n`);
    console.log(`  On this computer   ${address}`);
    if (remote) for (const ip of lanAddresses()) console.log(`  From your phone    http://${ip}:${PORT}`);
    else console.log('  From your phone    off (turn it on in the menu, under Phone)');
    console.log(`  Private data       ${DATA_DIR}\n`);
    openBrowser(address);
  });
}

function rebind(): void {
  server.close(() => listen(false));
  server.closeAllConnections();
}

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  Arlo is already running at ${address}\n`);
    openBrowser(address);
    process.exit(0);
  }
  throw err;
});

listen(true);
startScheduler();
