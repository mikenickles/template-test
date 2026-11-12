/**
 * Getting photos and files ready to send: photos are resized (long edge 1568px,
 * what vision models use anyway) so they're quick to send and cheap in tokens,
 * and get a small thumbnail for the chat. PDFs and text files go as they are.
 */
import { attachmentKind, type Attachment, type AttachmentNote } from "../../core/attachments";

export interface Draft extends Attachment {
  id: string;
  kind: AttachmentNote["kind"];
  size: number;
}

const LONG_EDGE = 1568;
const THUMB_EDGE = 320;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function draw(img: ImageBitmap, edge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, edge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d")!;
  // photos with transparency (screenshots, stickers) get a white background in JPEG
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't prepare that photo."))), "image/jpeg", quality));
}

const blobBase64 = async (b: Blob) => toBase64(new Uint8Array(await b.arrayBuffer()));

/** A picked, pasted, dropped or shared file, ready to attach. Throws a message for the user. */
export async function prepare(file: Blob, name: string, mediaType = file.type): Promise<Draft> {
  const type = mediaType || "application/octet-stream";
  const isImage = type.startsWith("image/");
  const kind = isImage ? "image" : attachmentKind({ mediaType: type, name });
  if (!kind) throw new Error(`Lyra can't read ${name}. Photos, PDFs and text files work.`);
  const id = crypto.randomUUID();
  if (kind !== "image") {
    const limit = kind === "pdf" ? 8 : 0.2;
    if (file.size > limit * 1024 * 1024) throw new Error(`${name} is too big (${kind === "pdf" ? "PDFs up to 8 MB" : "text files up to 200 KB"}).`);
    return { id, name, mediaType: kind === "pdf" ? "application/pdf" : "text/plain", data: await blobBase64(file), kind, size: file.size };
  }
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Lyra couldn't open ${name}. Try a JPEG or PNG (some phone formats like HEIC don't work yet).`);
  }
  try {
    const main = await draw(img, LONG_EDGE, 0.85);
    const thumb = await draw(img, THUMB_EDGE, 0.6);
    return {
      id,
      name: name.replace(/\.(png|webp|gif|heic|heif|bmp)$/i, ".jpg"),
      mediaType: "image/jpeg",
      data: await blobBase64(main),
      thumb: `data:image/jpeg;base64,${await blobBase64(thumb)}`,
      kind,
      size: main.size,
    };
  } finally {
    img.close();
  }
}

/** Something shared from another app arrives as base64. */
export function prepareShared(f: { name: string; mediaType: string; data: string }): Promise<Draft> {
  return prepare(new Blob([fromBase64(f.data) as BlobPart], { type: f.mediaType }), f.name, f.mediaType);
}

export const strip = (d: Draft): Attachment => ({ name: d.name, mediaType: d.mediaType, data: d.data, ...(d.thumb ? { thumb: d.thumb } : {}) });
export const noteOf = (d: Draft): AttachmentNote => ({ name: d.name, kind: d.kind, size: d.size, ...(d.thumb ? { thumb: d.thumb } : {}) });

// ---- things waiting to go into the message box (shared from another app) ----

export interface Incoming {
  text?: string;
  files: { name: string; mediaType: string; data: string }[];
  skipped?: number;
}
let waiting: Incoming | null = null;
const subs = new Set<() => void>();
export function deliver(item: Incoming): void {
  waiting = item;
  subs.forEach((f) => f());
}
export function takeIncoming(): Incoming | null {
  const w = waiting;
  waiting = null;
  return w;
}
export function onIncoming(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
