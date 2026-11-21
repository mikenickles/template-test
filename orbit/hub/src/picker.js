import { execFile } from 'node:child_process';
import { encodeCommand } from './firewall.js';

/** Windows' own folder chooser, kept on top of the browser that asked for it. Prints the chosen path. */
export const PICKER_SCRIPT = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$dialog.Description = 'Choose a folder your Treehouse agents can read'",
  '$dialog.ShowNewFolderButton = $false',
  'if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
  '$owner.Dispose()',
].join('\n');

export const canPickFolder = () => process.platform === 'win32';

/** Asks the person at the PC to choose a folder. Resolves with its path, or null if they cancel. */
export function pickFolder() {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-EncodedCommand', encodeCommand(PICKER_SCRIPT)],
      { windowsHide: true, timeout: 10 * 60_000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim() || null)),
    );
  });
}
