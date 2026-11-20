/** Turn Gmail API payloads into short, plain-text summaries a model can read. */

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

export function header(msg: GmailMessage, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findPart(part: GmailPart | undefined, mime: string): GmailPart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mime && part.body?.data && !part.filename) return part;
  for (const p of part.parts ?? []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return undefined;
}

export function attachmentNames(part: GmailPart | undefined): string[] {
  if (!part) return [];
  const own = part.filename ? [part.filename] : [];
  return own.concat(...(part.parts ?? []).map(attachmentNames));
}

/** Drop quoted earlier replies so a long thread doesn't repeat itself. */
export function stripQuoted(text: string): string {
  const lines = text.split("\n");
  const cut = lines.findIndex((l) => /^On .+wrote:\s*$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()));
  const kept = (cut > 0 ? lines.slice(0, cut) : lines).filter((l) => !l.startsWith(">"));
  return kept.join("\n").trim();
}

export function bodyText(msg: GmailMessage, maxChars = 6000): string {
  const plain = findPart(msg.payload, "text/plain");
  let text = plain?.body?.data ? decodeBase64Url(plain.body.data) : "";
  if (!text) {
    const html = findPart(msg.payload, "text/html");
    if (html?.body?.data) text = htmlToText(decodeBase64Url(html.body.data));
  }
  text = stripQuoted(text.replace(/\r\n/g, "\n")) || msg.snippet || "";
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…cut, ${text.length - maxChars} more characters]` : text;
}

export function summarizeListItem(msg: GmailMessage): string {
  const unread = msg.labelIds?.includes("UNREAD") ? " (unread)" : "";
  return [
    `- id: ${msg.id} | thread: ${msg.threadId}${unread}`,
    `  from: ${header(msg, "From")}`,
    `  date: ${header(msg, "Date")}`,
    `  subject: ${header(msg, "Subject") || "(no subject)"}`,
    `  preview: ${(msg.snippet ?? "").replace(/\s+/g, " ").slice(0, 200)}`,
  ].join("\n");
}

export function renderThreadMessage(msg: GmailMessage): string {
  const files = attachmentNames(msg.payload);
  const lines = [`From: ${header(msg, "From")}`, `To: ${header(msg, "To")}`];
  if (header(msg, "Cc")) lines.push(`Cc: ${header(msg, "Cc")}`);
  lines.push(`Date: ${header(msg, "Date")}`, `Subject: ${header(msg, "Subject")}`);
  if (files.length) lines.push(`Attachments: ${files.join(", ")}`);
  lines.push("", bodyText(msg));
  return lines.join("\n");
}
