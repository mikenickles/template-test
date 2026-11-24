import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './config.js';
import { encodeCommand } from './firewall.js';

/**
 * Treehouse on Windows runs in the background, with no window to keep open:
 *
 * - A small launcher script (Treehouse.vbs, in the hub's data folder) starts "Start Orbit.bat" hidden, unless
 *   the hub is already running. With /open it then opens Treehouse in the browser. Its output goes to hub.log.
 * - A "Treehouse" shortcut in the Start menu (and once on the desktop) runs it with /open: one click to start
 *   the hub if needed and open the app.
 * - Starting with Windows puts a copy of the launcher in the Startup folder. No administrator rights needed.
 *
 * Everything here is written by the hub itself, so updates keep it current; "Start Orbit.bat" never changes.
 */

const hubDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startup = () => path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
/** The minimized-window launcher earlier versions put in the Startup folder. */
const legacyLauncher = () => path.join(startup(), 'Orbit hub.cmd');
const startupLauncher = () => path.join(startup(), 'Treehouse.vbs');

export const launcherPath = () => path.join(dataDir, 'Treehouse.vbs');
export const logPath = () => path.join(dataDir, 'hub.log');
const iconPath = () => path.join(dataDir, 'treehouse.ico');

export const supported = () => process.platform === 'win32' && Boolean(process.env.APPDATA);

export const isEnabled = () => supported() && (fs.existsSync(startupLauncher()) || fs.existsSync(legacyLauncher()));

/** Set by the launcher, so the hub knows it already runs without a window. */
export const isHidden = () => Boolean(process.env.ORBIT_HIDDEN);

const vbsString = (text) => `"${String(text).replaceAll('"', '""')}"`;

/**
 * The launcher. Window style 0 runs the start script with no window; its input comes from nul so the
 * script's closing "press any key" never waits.
 */
export function launcherScript({ dir = hubDir, port = 8787, log = logPath() } = {}) {
  const bat = path.join(dir, 'Start Orbit.bat');
  const command = `cmd /c ""${bat}" --background < nul > "${log}" 2>&1"`;
  return [
    "' Starts Treehouse with no window, unless it is already running. With /open, then opens it in the browser.",
    "' Written by the Treehouse hub; it is rewritten whenever the hub starts.",
    'Option Explicit',
    'Dim shell, openApp, up, tries',
    'Set shell = CreateObject("WScript.Shell")',
    'openApp = False',
    'If WScript.Arguments.Count > 0 Then',
    '  If LCase(WScript.Arguments(0)) = "/open" Then openApp = True',
    'End If',
    'up = Running()',
    'If Not up Then',
    `  shell.CurrentDirectory = ${vbsString(dir)}`,
    '  shell.Environment("Process")("ORBIT_HIDDEN") = "1"',
    `  shell.Run ${vbsString(command)}, 0, False`,
    'End If',
    'If openApp Then',
    '  tries = 0',
    '  Do While Not up And tries < 120',
    '    WScript.Sleep 1000',
    '    up = Running()',
    '    tries = tries + 1',
    '  Loop',
    `  shell.Run ${vbsString(`http://localhost:${port}/`)}, 1, False`,
    'End If',
    '',
    'Function Running()',
    '  Dim request',
    '  Running = False',
    '  On Error Resume Next',
    '  Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")',
    '  request.setTimeouts 1000, 1000, 2000, 2000',
    `  request.open "GET", ${vbsString(`http://127.0.0.1:${port}/`)}, False`,
    '  request.send',
    '  If Err.Number = 0 Then Running = (request.status > 0)',
    '  On Error GoTo 0',
    'End Function',
    '',
  ].join('\r\n');
}

/** Windows Script Host reads UTF-16 with a byte order mark, so folders with any name work. */
const writeScript = (file, text) => fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));

/** An .ico holding the app icon as PNG, which Windows reads for shortcuts. */
export function iconFile(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // an icon
  header.writeUInt16LE(1, 4); // one image
  const size = png.readUInt32BE(16); // the PNG's width
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

/** Writes the launcher and icon. Called whenever the hub starts on Windows. */
export function prepare(port) {
  fs.mkdirSync(dataDir, { recursive: true });
  writeScript(launcherPath(), launcherScript({ port }));
  try {
    fs.writeFileSync(iconPath(), iconFile(fs.readFileSync(path.join(hubDir, 'web', 'icons', 'icon-192.png'))));
  } catch {
    // The shortcut just gets the default icon.
  }
}

export function enable() {
  fs.mkdirSync(startup(), { recursive: true });
  fs.copyFileSync(launcherPath(), startupLauncher());
  fs.rmSync(legacyLauncher(), { force: true });
}

export function disable() {
  fs.rmSync(startupLauncher(), { force: true });
  fs.rmSync(legacyLauncher(), { force: true });
}

/**
 * The "Treehouse" shortcut in the Start menu, and on the desktop when [desktop]. Made with PowerShell, which
 * every Windows has; paths travel as environment variables, so no quoting can break.
 */
export function makeShortcuts({ desktop = false } = {}) {
  const script = [
    '$shell = New-Object -ComObject WScript.Shell',
    "$places = @([Environment]::GetFolderPath('Programs'))",
    "if ($env:TH_DESKTOP -eq '1') { $places += [Environment]::GetFolderPath('Desktop') }",
    'foreach ($place in $places) {',
    "  $link = $shell.CreateShortcut((Join-Path $place 'Treehouse.lnk'))",
    "  $link.TargetPath = Join-Path $env:WINDIR 'System32\\wscript.exe'",
    '  $link.Arguments = \'"\' + $env:TH_LAUNCHER + \'" /open\'',
    '  $link.WorkingDirectory = $env:TH_DATA',
    "  if (Test-Path $env:TH_ICON) { $link.IconLocation = $env:TH_ICON + ',0' }",
    "  $link.Description = 'Open Treehouse'",
    '  $link.Save()',
    '}',
  ].join('\n');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeCommand(script)],
      { windowsHide: true, timeout: 30_000, env: { ...process.env, TH_LAUNCHER: launcherPath(), TH_ICON: iconPath(), TH_DATA: dataDir, TH_DESKTOP: desktop ? '1' : '0' } },
      (err) => resolve(!err),
    );
  });
}

/** Starts the hub again with no window, through the launcher. False if Windows wouldn't run it. */
export function startHidden() {
  return new Promise((resolve) => {
    try {
      const child = spawn(path.join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'wscript.exe'), [launcherPath()], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

// `npm run autostart:on` / `npm run autostart:off`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!supported()) {
    console.log('Starting with the computer is only set up automatically on Windows.');
  } else if (process.argv[2] === 'off') {
    disable();
    console.log('Treehouse will no longer start when you sign in.');
  } else {
    if (!fs.existsSync(launcherPath())) prepare(8787);
    enable();
    console.log('Treehouse will start in the background, with no window, whenever you sign in to Windows.');
  }
}
