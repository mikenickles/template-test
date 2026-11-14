import { z } from 'zod';
import { api } from './oauth.ts';
import { clip, defineTool } from './types.ts';
import type { ToolContext } from './types.ts';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface Header { name: string; value: string }
interface Payload { mimeType?: string; filename?: string; headers?: Header[]; body?: { data?: string; size?: number }; parts?: Payload[] }
interface Message { id: string; threadId: string; labelIds?: string[]; snippet?: string; payload?: Payload }

const gmail = <T>(ctx: ToolContext, path: string, init?: { method?: string; body?: unknown }) =>
  api<T>('google', ctx.fetch, BASE + path, { ...init, signal: ctx.signal });

const header = (m: Message, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|blockquote)>/gi, '\n\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The readable text of a message: plain text if there is any, otherwise the HTML with its tags removed. */
export function bodyText(payload: Payload | undefined): string {
  if (!payload) return '';
  const found: { plain?: string; html?: string } = {};
  const walk = (p: Payload) => {
    if (p.filename) return; // an attachment
    const text = p.body?.data ? Buffer.from(p.body.data, 'base64url').toString('utf8') : '';
    if (p.mimeType === 'text/plain' && text && !found.plain) found.plain = text;
    if (p.mimeType === 'text/html' && text && !found.html) found.html = text;
    p.parts?.forEach(walk);
  };
  walk(payload);
  return (found.plain ?? (found.html ? htmlToText(found.html) : '')).trim();
}

function attachments(payload: Payload | undefined): string[] {
  const names: string[] = [];
  const walk = (p: Payload) => {
    if (p.filename) names.push(p.filename);
    p.parts?.forEach(walk);
  };
  if (payload) walk(payload);
  return names;
}

const summary = (m: Message) => ({
  id: m.id,
  thread_id: m.threadId,
  from: header(m, 'From'),
  to: header(m, 'To'),
  subject: header(m, 'Subject'),
  date: header(m, 'Date'),
  unread: m.labelIds?.includes('UNREAD') ?? false,
  snippet: m.snippet ?? '',
});

const full = (m: Message, bodyLimit: number) => ({
  ...summary(m),
  cc: header(m, 'Cc') || undefined,
  attachments: attachments(m.payload),
  body: clip(bodyText(m.payload), bodyLimit),
});

interface Outgoing {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

/** An RFC 5322 message, base64url-encoded the way the Gmail API wants it. */
export function buildRaw(mail: Outgoing): string {
  // Header values never carry line breaks, so nothing typed into a field can add a header.
  const flat = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();
  const word = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`);
  const lines = [
    `To: ${mail.to.map(flat).join(', ')}`,
    mail.cc?.length ? `Cc: ${mail.cc.map(flat).join(', ')}` : '',
    mail.bcc?.length ? `Bcc: ${mail.bcc.map(flat).join(', ')}` : '',
    `Subject: ${word(flat(mail.subject))}`,
    mail.inReplyTo ? `In-Reply-To: ${flat(mail.inReplyTo)}` : '',
    mail.references ? `References: ${flat(mail.references)}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  const body = Buffer.from(mail.body, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return Buffer.from(`${lines.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
}

const compose = z.object({
  to: z.array(z.email()).min(1).max(20),
  cc: z.array(z.email()).max(20).optional(),
  bcc: z.array(z.email()).max(20).optional(),
  subject: z.string().max(300).default('').describe('Leave empty when replying to keep the original subject.'),
  body: z.string().min(1).max(20000).describe('Plain text.'),
  reply_to_message_id: z.string().optional().describe('Id of the message being replied to, to keep it in the same thread.'),
});
type Compose = z.infer<typeof compose>;

async function prepare(i: Compose, ctx: ToolContext): Promise<{ raw: string; threadId?: string }> {
  let subject = i.subject;
  let threadId: string | undefined;
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (i.reply_to_message_id) {
    const original = await gmail<Message>(
      ctx,
      `/messages/${encodeURIComponent(i.reply_to_message_id)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`,
    );
    threadId = original.threadId;
    inReplyTo = header(original, 'Message-ID');
    references = [header(original, 'References'), inReplyTo].filter(Boolean).join(' ');
    const was = header(original, 'Subject');
    if (!subject) subject = /^re:/i.test(was) ? was : `Re: ${was}`;
  }
  return { raw: buildRaw({ to: i.to, cc: i.cc, bcc: i.bcc, subject, body: i.body, inReplyTo, references }), threadId };
}

const mailRows = (i: Compose) => [
  { label: 'To', value: i.to.join(', ') },
  ...(i.cc?.length ? [{ label: 'Cc', value: i.cc.join(', ') }] : []),
  ...(i.bcc?.length ? [{ label: 'Bcc', value: i.bcc.join(', ') }] : []),
  { label: 'Subject', value: i.subject || (i.reply_to_message_id ? '(reply, same subject)' : '(no subject)') },
];

const search = defineTool({
  name: 'gmail_search',
  description:
    'Search the user\'s Gmail. Uses Gmail search syntax, e.g. "is:unread newer_than:2d", "from:sam@example.com", ' +
    '"subject:invoice has:attachment". Returns the newest matches with sender, subject, date and a snippet.',
  schema: z.object({ query: z.string().describe('Gmail search query. Use "in:inbox" for the inbox.'), max: z.number().int().min(1).max(25).default(10) }),
  risk: 'read',
  needs: 'google',
  untrusted: true,
  label: () => 'Searching your email',
  run: async (i, ctx) => {
    const list = await gmail<{ messages?: { id: string }[]; resultSizeEstimate?: number }>(
      ctx, `/messages?maxResults=${i.max}&q=${encodeURIComponent(i.query)}`,
    );
    const fields = '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date';
    const messages = await Promise.all(
      (list.messages ?? []).map((m) => gmail<Message>(ctx, `/messages/${m.id}?format=metadata${fields}`)),
    );
    return { count: messages.length, messages: messages.map(summary) };
  },
});

const read = defineTool({
  name: 'gmail_read',
  description: 'Read one email in full by id, or the whole conversation it belongs to.',
  schema: z.object({ id: z.string(), whole_thread: z.boolean().default(false) }),
  risk: 'read',
  needs: 'google',
  untrusted: true,
  label: () => 'Reading an email',
  run: async (i, ctx) => {
    const message = await gmail<Message>(ctx, `/messages/${encodeURIComponent(i.id)}?format=full`);
    if (!i.whole_thread) return full(message, 20000);
    const thread = await gmail<{ messages?: Message[] }>(ctx, `/threads/${message.threadId}?format=full`);
    return { messages: (thread.messages ?? []).map((m) => full(m, 6000)) };
  },
});

const draft = defineTool({
  name: 'gmail_draft',
  description: 'Save an email as a draft in Gmail without sending it. Good when the wording or recipient should be checked first.',
  schema: compose,
  risk: 'act',
  needs: 'google',
  guarded: true,
  label: () => 'Writing a draft',
  card: (i) => ({ title: 'Save this draft?', rows: mailRows(i), body: clip(i.body, 1500), confirmLabel: 'Save draft', done: 'Draft saved' }),
  run: async (i, ctx) => {
    const { raw, threadId } = await prepare(i, ctx);
    const res = await gmail<{ id: string }>(ctx, '/drafts', { method: 'POST', body: { message: { raw, threadId } } });
    return { draft_id: res.id, saved: true };
  },
});

const send = defineTool({
  name: 'gmail_send',
  description: 'Send an email from the user\'s Gmail. The user is always shown the exact email and must approve it before it goes.',
  schema: compose,
  risk: 'confirm',
  needs: 'google',
  label: () => 'Sending an email',
  card: (i) => ({
    title: 'Send this email?',
    rows: mailRows(i),
    body: clip(i.body, 1500),
    warning: 'Once sent, it can\'t be taken back.',
    confirmLabel: 'Send',
    done: `Email sent to ${i.to[0]}${i.to.length > 1 ? ` and ${i.to.length - 1} more` : ''}`,
  }),
  run: async (i, ctx) => {
    const { raw, threadId } = await prepare(i, ctx);
    const res = await gmail<{ id: string }>(ctx, '/messages/send', { method: 'POST', body: { raw, threadId } });
    return { sent: true, id: res.id };
  },
});

const ACTIONS = {
  archive: { removeLabelIds: ['INBOX'] },
  mark_read: { removeLabelIds: ['UNREAD'] },
  mark_unread: { addLabelIds: ['UNREAD'] },
  star: { addLabelIds: ['STARRED'] },
  unstar: { removeLabelIds: ['STARRED'] },
} as const;
const ACTION_WORDS = { archive: 'Archive', mark_read: 'Mark as read', mark_unread: 'Mark as unread', star: 'Star', unstar: 'Unstar' } as const;

const tidy = defineTool({
  name: 'gmail_tidy',
  description: 'Archive, star, or mark emails read/unread. All of these are easy to undo.',
  schema: z.object({
    ids: z.array(z.string()).min(1).max(100),
    action: z.enum(['archive', 'mark_read', 'mark_unread', 'star', 'unstar']),
  }),
  risk: 'act',
  needs: 'google',
  guarded: true,
  label: (i) => `${ACTION_WORDS[i.action]}: ${i.ids.length} email${i.ids.length === 1 ? '' : 's'}`,
  card: (i) => ({
    title: `${ACTION_WORDS[i.action]} ${i.ids.length} email${i.ids.length === 1 ? '' : 's'}?`,
    rows: [],
    confirmLabel: ACTION_WORDS[i.action],
    done: `${ACTION_WORDS[i.action]}: ${i.ids.length} email${i.ids.length === 1 ? '' : 's'}`,
  }),
  run: async (i, ctx) => {
    await gmail(ctx, '/messages/batchModify', { method: 'POST', body: { ids: i.ids, ...ACTIONS[i.action] } });
    return { done: true, count: i.ids.length };
  },
});

const trash = defineTool({
  name: 'gmail_trash',
  description: 'Move emails to the Trash (Gmail empties it after 30 days). Always needs the user\'s approval.',
  schema: z.object({ ids: z.array(z.string()).min(1).max(50), what: z.string().max(200).describe('Plain description of what is being deleted, shown to the user.') }),
  risk: 'confirm',
  needs: 'google',
  label: (i) => `Moving ${i.ids.length} email${i.ids.length === 1 ? '' : 's'} to Trash`,
  card: (i) => ({
    title: `Move ${i.ids.length} email${i.ids.length === 1 ? '' : 's'} to Trash?`,
    rows: [{ label: 'What', value: i.what }],
    warning: 'Gmail deletes Trash for good after 30 days.',
    confirmLabel: 'Move to Trash',
    done: `Moved ${i.ids.length} email${i.ids.length === 1 ? '' : 's'} to Trash`,
  }),
  run: async (i, ctx) => {
    for (const id of i.ids) await gmail(ctx, `/messages/${encodeURIComponent(id)}/trash`, { method: 'POST' });
    return { trashed: i.ids.length };
  },
});

export const gmailTools = [search, read, draft, send, tidy, trash];

export async function gmailAddress(accessToken: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const res = await fetchImpl(`${BASE}/profile`, { headers: { authorization: `Bearer ${accessToken}` } });
  return res.ok ? ((await res.json()) as { emailAddress?: string }).emailAddress : undefined;
}
