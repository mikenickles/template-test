import zlib from 'node:zlib';

/**
 * A small zip reader and writer, so the hub can unpack its own updates without another dependency.
 * Reads stored and deflated entries (what every zip tool produces); no encryption, no zip64.
 */

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

export function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

export class ZipError extends Error {
  name = 'ZipError';
}

/** Most an update may unpack to, so a hostile zip can't fill the disk. */
export const MAX_UNPACKED = 200 * 1024 * 1024;

/**
 * The entries of a zip: [{ name, read() }]. `read()` returns the file's bytes, checked against the
 * zip's own checksum. Folders are left out.
 */
export function readZip(buffer) {
  // The end-of-central-directory record is within the last 64 KB.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65_535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("That isn't a zip file.");
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) throw new ZipError('The zip file is damaged.');
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const crc = buffer.readUInt32LE(at + 16);
    const packed = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new ZipError('The zip file is encrypted.');
    total += size;
    if (total > MAX_UNPACKED) throw new ZipError('The zip file unpacks to more than the hub accepts.');
    entries.push({
      name,
      size,
      read() {
        if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new ZipError('The zip file is damaged.');
        const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
        const raw = buffer.subarray(start, start + packed);
        let bytes;
        if (method === 0) bytes = raw;
        else if (method === 8) {
          try {
            bytes = zlib.inflateRawSync(raw, { maxOutputLength: size + 1 });
          } catch {
            throw new ZipError(`${name} in the zip file is damaged.`);
          }
        } else throw new ZipError(`The zip file uses a compression method (${method}) the hub can't read.`);
        if (bytes.length !== size || crc32(bytes) !== crc) throw new ZipError(`${name} in the zip file is damaged.`);
        return bytes;
      },
    });
  }
  return entries;
}

/** Builds a zip from { name: Buffer | string }. Used to package updates, and in tests. */
export function writeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const packed = zlib.deflateRawSync(data);
    const [method, body] = packed.length < data.length ? [8, packed] : [0, data];
    const nameBytes = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // names are UTF-8
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    chunks.push(header, nameBytes, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}
