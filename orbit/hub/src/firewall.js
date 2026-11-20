import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Windows Firewall blocks other devices from reaching a new server by default, which is the most
 * common reason a phone can't connect. On first run the hub adds two inbound rules for itself.
 * Adding rules needs administrator rights, so Windows shows its permission prompt once.
 */

export const RULES = ['Orbit hub', 'Orbit hub find'];

/** PowerShell takes -EncodedCommand as base64 of UTF-16LE text, which avoids every quoting pitfall. */
export const encodeCommand = (script) => Buffer.from(script, 'utf16le').toString('base64');

export function ruleScript(port, discoveryPort) {
  return [
    `New-NetFirewallRule -DisplayName '${RULES[0]}' -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow -Profile Any | Out-Null`,
    `New-NetFirewallRule -DisplayName '${RULES[1]}' -Direction Inbound -Protocol UDP -LocalPort ${discoveryPort} -Action Allow -Profile Any | Out-Null`,
  ].join('; ');
}

/** The command a person can paste into an administrator PowerShell if they'd rather do it by hand. */
export const manualCommand = (port, discoveryPort) => ruleScript(port, discoveryPort).replaceAll(' | Out-Null', '');

function powershell(script) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeCommand(script)],
      { windowsHide: true },
      (err, stdout) => resolve({ ok: !err, out: String(stdout ?? '').trim() }),
    );
  });
}

async function rulesPresent() {
  const { ok, out } = await powershell(
    `@(Get-NetFirewallRule -DisplayName '${RULES[0]}','${RULES[1]}' -ErrorAction SilentlyContinue).Count`,
  );
  return ok && Number(out) >= RULES.length;
}

/**
 * Makes sure the firewall lets phones in. Returns what happened: "not-windows", "present", "added",
 * "declined" (the prompt was refused) or "declined-before" (refused on an earlier run; not asked again
 * unless [force]).
 */
export async function ensureFirewall({ port, discoveryPort, dataDir, log, force = false }) {
  if (process.platform !== 'win32') return 'not-windows';
  if (await rulesPresent()) return 'present';

  const declined = path.join(dataDir, 'firewall-declined');
  const howTo = () => {
    log('  To allow it later, run "npm run firewall" in the hub folder, or paste this into an');
    log('  administrator PowerShell:');
    log(`    ${manualCommand(port, discoveryPort)}`);
  };
  if (!force && fs.existsSync(declined)) {
    log('Windows Firewall may block your phone (permission was declined earlier).');
    howTo();
    return 'declined-before';
  }

  log('Allowing Orbit through Windows Firewall so your phone can reach it.');
  log('Windows will ask for permission once. Click Yes.');
  const elevated = encodeCommand(ruleScript(port, discoveryPort));
  await powershell(
    `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${elevated}'`,
  );
  if (await rulesPresent()) {
    fs.rmSync(declined, { force: true });
    log('Firewall: done. Your phone can reach the hub.');
    return 'added';
  }
  fs.writeFileSync(declined, '');
  log("Firewall: permission wasn't given, so your phone may not be able to connect.");
  howTo();
  return 'declined';
}

// `npm run firewall`: ask again, even if permission was declined before.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { loadConfig, dataDir } = await import('./config.js');
  const config = loadConfig();
  const result = await ensureFirewall({ port: config.port, discoveryPort: config.discoveryPort, dataDir, log: console.log, force: true });
  if (result === 'present') console.log('Windows Firewall already allows Orbit.');
  if (result === 'not-windows') console.log('This is only needed on Windows.');
}
