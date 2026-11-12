/**
 * Encrypted backups: everything Lyra knows, locked with a passphrase, in one file
 * you can keep anywhere (Drive, email, a USB stick) and restore on another phone.
 *
 * File layout: MAGIC | salt (16) | iv (12) | AES-256-GCM ciphertext.
 * The key comes from the passphrase through PBKDF2-SHA-256. Without the
 * passphrase the file is noise; a wrong passphrase fails the GCM check.
 * API keys and Google sign-ins are never included.
 */

export const BACKUP_EXT = ".lyra";
const MAGIC = new TextEncoder().encode("LYRA-BACKUP-1\n");
const ITERATIONS = 310_000;
export const MIN_PASSPHRASE = 8;

export interface BackupPayload {
  format: "lyra-backup";
  version: 1;
  createdAt: string;
  /** the SQLite database (chats, tasks, routines, settings), base64 */
  db: string;
  /** notebooks and the soul, by file name */
  files: Record<string, string>;
}

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("This device can't encrypt backups.");
  return s;
};

async function keyFrom(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function squeeze(bytes: Uint8Array, mode: "gzip" | "gunzip"): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") throw new Error("This device can't pack backups.");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(mode === "gzip" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encryptBackup(payload: BackupPayload, passphrase: string): Promise<Uint8Array> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await squeeze(new TextEncoder().encode(JSON.stringify(payload)), "gzip");
  const sealed = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv, additionalData: MAGIC }, await keyFrom(passphrase, salt), packed as BufferSource),
  );
  const out = new Uint8Array(MAGIC.length + 28 + sealed.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + 16);
  out.set(sealed, MAGIC.length + 28);
  return out;
}

export async function decryptBackup(file: Uint8Array, passphrase: string): Promise<BackupPayload> {
  const head = file.subarray(0, MAGIC.length);
  if (file.length < MAGIC.length + 44 || !head.every((b, i) => b === MAGIC[i])) throw new Error("That file isn't a Lyra backup.");
  const salt = file.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = file.subarray(MAGIC.length + 16, MAGIC.length + 28);
  let packed: Uint8Array;
  try {
    packed = new Uint8Array(
      await subtle().decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: MAGIC }, await keyFrom(passphrase, salt), file.subarray(MAGIC.length + 28) as BufferSource),
    );
  } catch {
    throw new Error("That passphrase doesn't open this backup.");
  }
  const payload = JSON.parse(new TextDecoder().decode(await squeeze(packed, "gunzip"))) as BackupPayload;
  if (payload.format !== "lyra-backup" || payload.version !== 1 || typeof payload.db !== "string") throw new Error("This backup is from a newer Lyra. Update the app first.");
  return payload;
}

/** "Lyra backup 2026-11-12.lyra" */
export function backupName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `Lyra backup ${d}${BACKUP_EXT}`;
}
