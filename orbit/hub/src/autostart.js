import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Starting the hub when you sign in to Windows: a small launcher in your Startup folder runs
 * "Start Orbit.bat" in a minimized window. No administrator rights needed.
 */

const hubDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcher = () =>
  path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Orbit hub.cmd');

export const supported = () => process.platform === 'win32' && Boolean(process.env.APPDATA);

export const isEnabled = () => supported() && fs.existsSync(launcher());

export function launcherScript(dir = hubDir) {
  return ['@echo off', `start "Orbit hub" /min "${path.join(dir, 'Start Orbit.bat')}" --background`, ''].join('\r\n');
}

export function enable() {
  fs.mkdirSync(path.dirname(launcher()), { recursive: true });
  fs.writeFileSync(launcher(), launcherScript());
}

export function disable() {
  fs.rmSync(launcher(), { force: true });
}

// `npm run autostart:on` / `npm run autostart:off`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!supported()) {
    console.log('Starting with the computer is only set up automatically on Windows.');
  } else if (process.argv[2] === 'off') {
    disable();
    console.log('The Treehouse hub will no longer start when you sign in.');
  } else {
    enable();
    console.log('The Treehouse hub will start (minimized) whenever you sign in to Windows.');
  }
}
