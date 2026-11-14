import { z } from 'zod';
import { accessToken, api } from './oauth.ts';
import { clip, defineTool } from './types.ts';

const BASE = 'https://www.googleapis.com/drive/v3';

interface File { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; owners?: { displayName?: string }[] }

/** Google's own formats are exported as text; plain files are read as they are. */
const EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const view = (f: File) => ({
  id: f.id,
  name: f.name,
  kind: f.mimeType.replace('application/vnd.google-apps.', 'Google ').replace('application/', ''),
  modified: f.modifiedTime,
  owner: f.owners?.[0]?.displayName,
  link: f.webViewLink,
});

const search = defineTool({
  name: 'drive_search',
  description: 'Find files in the user\'s Google Drive by words in their name or contents. Newest first.',
  schema: z.object({ query: z.string().min(1).max(200), max: z.number().int().min(1).max(25).default(10) }),
  risk: 'read',
  needs: 'google',
  untrusted: true,
  label: (i) => `Searching Drive for “${clip(i.query, 50)}”`,
  run: async (i, ctx) => {
    const term = i.query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const params = new URLSearchParams({
      q: `(name contains '${term}' or fullText contains '${term}') and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))',
      orderBy: 'modifiedTime desc',
      pageSize: String(i.max),
    });
    const res = await api<{ files?: File[] }>('google', ctx.fetch, `${BASE}/files?${params}`, { signal: ctx.signal });
    return { files: (res.files ?? []).map(view) };
  },
});

const read = defineTool({
  name: 'drive_read',
  description: 'Read the text of a Drive file by id. Works for Google Docs, Sheets (as CSV), Slides and plain text files.',
  schema: z.object({ file_id: z.string() }),
  risk: 'read',
  needs: 'google',
  untrusted: true,
  label: () => 'Reading a file from Drive',
  run: async (i, ctx) => {
    const id = encodeURIComponent(i.file_id);
    const meta = await api<File>('google', ctx.fetch, `${BASE}/files/${id}?fields=id,name,mimeType,modifiedTime,webViewLink`, { signal: ctx.signal });
    const exportAs = EXPORT[meta.mimeType];
    const readable = exportAs || meta.mimeType.startsWith('text/') || meta.mimeType === 'application/json';
    if (!readable) {
      return { ...view(meta), text: null, note: 'This kind of file cannot be read as text. Share the link with the user instead.' };
    }
    const url = exportAs ? `${BASE}/files/${id}/export?mimeType=${encodeURIComponent(exportAs)}` : `${BASE}/files/${id}?alt=media`;
    const text = await api<string>('google', ctx.fetch, url, { signal: ctx.signal, raw: true });
    return { ...view(meta), text: clip(text, 40000) };
  },
});

const createDoc = defineTool({
  name: 'drive_create_doc',
  description: 'Create a new Google Doc in the user\'s Drive from plain text and return its link.',
  schema: z.object({ title: z.string().min(1).max(200), content: z.string().max(100000) }),
  risk: 'act',
  needs: 'google',
  guarded: true,
  label: (i) => `Creating “${clip(i.title, 40)}” in Drive`,
  card: (i) => ({ title: 'Create this document?', rows: [{ label: 'Title', value: i.title }], body: clip(i.content, 600), confirmLabel: 'Create', done: `Created “${clip(i.title, 40)}”` }),
  run: async (i, ctx) => {
    const boundary = `arlo${Date.now().toString(36)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: i.title, mimeType: 'application/vnd.google-apps.document' }) +
      `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${i.content}\r\n--${boundary}--`;
    const token = await accessToken('google', ctx.fetch);
    const res = await ctx.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      signal: ctx.signal,
      headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Drive said ${res.status}: ${clip(await res.text(), 200)}`);
    const file = (await res.json()) as { id: string; name: string; webViewLink?: string };
    return { created: true, id: file.id, name: file.name, link: file.webViewLink };
  },
});

export const driveTools = [search, read, createDoc];
