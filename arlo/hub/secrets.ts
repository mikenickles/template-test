import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ensureDataDir } from './config.ts';
import { db } from './db.ts';

/**
 * API keys and OAuth tokens are encrypted at rest with AES-256-GCM. The master
 * key is wrapped with Windows DPAPI (bound to your Windows account) so a copied
 * data folder is useless on another machine or under another login. On other
 * systems the key is a file only you can read.
 */

let master: Buffer | null = null;

function dpapi(mode: 'Protect' | 'Unprotect', data: Buffer): Buffer {
  const script =
    'Add-Type -AssemblyName System.Security;' +
    '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());' +
    `$o=[System.Security.Cryptography.ProtectedData]::${mode}($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);` +
    '[Console]::Out.Write([Convert]::ToBase64String($o))';
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: data.toString('base64'),
    encoding: 'utf8',
    windowsHide: true,
  });
  return Buffer.from(out.trim(), 'base64');
}

function loadMaster(): Buffer {
  if (master) return master;
  if (process.env.ARLO_TEST_KEY) {
    master = crypto.createHash('sha256').update(process.env.ARLO_TEST_KEY).digest();
    return master;
  }
  ensureDataDir();
  const file = path.join(DATA_DIR, 'master.key');
  if (fs.existsSync(file)) {
    const [scheme, body] = fs.readFileSync(file, 'utf8').trim().split(':');
    const raw = Buffer.from(body ?? '', 'base64');
    master = scheme === 'dpapi' ? dpapi('Unprotect', raw) : raw;
    if (master.length !== 32) throw new Error(`Arlo's key file is damaged: ${file}`);
    return master;
  }
  master = crypto.randomBytes(32);
  let stored = `raw:${master.toString('base64')}`;
  if (process.platform === 'win32') {
    try {
      stored = `dpapi:${dpapi('Protect', master).toString('base64')}`;
    } catch (err) {
      console.warn('Could not use Windows data protection; storing the key as a private file instead.', err);
    }
  }
  fs.writeFileSync(file, stored, { mode: 0o600 });
  return master;
}

export function setSecret(key: string, value: string): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadMaster(), iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const blob = Buffer.concat([iv, cipher.getAuthTag(), body]);
  db().prepare('insert into secrets(key, value) values(?, ?) on conflict(key) do update set value = excluded.value').run(key, blob);
}

export function getSecret(key: string): string | null {
  const row = db().prepare('select value from secrets where key = ?').get(key) as { value: Uint8Array } | undefined;
  if (!row) return null;
  const blob = Buffer.from(row.value);
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadMaster(), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}

export function hasSecret(key: string): boolean {
  return db().prepare('select 1 from secrets where key = ?').get(key) !== undefined;
}

export function deleteSecret(key: string): void {
  db().prepare('delete from secrets where key = ?').run(key);
}

/** Remove every secret whose key starts with the prefix (e.g. all Google tokens). */
export function deleteSecretsWithPrefix(prefix: string): void {
  db().prepare("delete from secrets where key like ? escape '\\'").run(prefix.replace(/[\\%_]/g, '\\$&') + '%');
}
