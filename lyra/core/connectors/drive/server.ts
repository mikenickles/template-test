/**
 * Lyra's Google Drive connector: an in-app MCP server that can only find and
 * read files. Google grants only drive.readonly, and there is no tool that
 * creates, changes, shares or deletes anything.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TokenSource } from "../google.ts";
import { googleGet } from "../google-http.ts";

const API = "https://www.googleapis.com/drive/v3";
const MAX_CHARS = 20_000;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  owners?: { displayName?: string; me?: boolean }[];
}

const KIND: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.folder": "folder",
  "application/pdf": "PDF",
};

/** Google's own formats are exported as text; plain files are downloaded. */
const EXPORT: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export function isTextual(mime: string): boolean {
  return mime.startsWith("text/") || ["application/json", "application/xml", "application/x-yaml", "application/csv"].includes(mime);
}

/** Drive search syntax needs quotes and backslashes escaped. */
export function driveQuery(words: string): string {
  const w = words.trim().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return w ? `(name contains '${w}' or fullText contains '${w}') and trashed = false` : "trashed = false";
}

export function describeFile(f: DriveFile): string {
  const kind = KIND[f.mimeType] ?? (f.mimeType.split("/")[1] || f.mimeType);
  const owner = f.owners?.[0];
  const bits = [`- ${f.name} (${kind})`, `id: ${f.id}`];
  if (f.modifiedTime) bits.push(`changed ${f.modifiedTime.slice(0, 10)}`);
  if (owner && !owner.me && owner.displayName) bits.push(`owner: ${owner.displayName}`);
  return bits.join(" · ");
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const FIELDS = "files(id,name,mimeType,modifiedTime,size,owners(displayName,me))";

export function createDriveServer(tokens: TokenSource, fetchFn: typeof fetch = fetch): McpServer {
  const g = googleGet(API, "Google Drive", tokens, fetchFn);
  const server = new McpServer({ name: "lyra-drive", version: "0.1.0" });

  server.registerTool(
    "search_files",
    {
      title: "Search files",
      description: "Find files in the user's Google Drive by words in their name or contents. With no words, lists the most recently changed files.",
      inputSchema: {
        query: z.string().describe("Words to look for. Empty for recent files."),
        max_results: z.number().int().min(1).max(25).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, max_results }) => {
      const r = await g.json<{ files?: DriveFile[] }>("/files", {
        q: driveQuery(query),
        pageSize: max_results ?? 10,
        orderBy: query.trim() ? undefined : "modifiedTime desc",
        fields: FIELDS,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const files = r.files ?? [];
      if (!files.length) return text(query.trim() ? `No files match "${query}".` : "Drive is empty.");
      return text(`${files.length} file(s):\n${files.map(describeFile).join("\n")}`);
    },
  );

  server.registerTool(
    "read_file",
    {
      title: "Read a file",
      description: "Read a file's text: Google Docs, Sheets (as CSV), Slides, and plain text files. Use an id from search_files.",
      inputSchema: { file_id: z.string().regex(/^[\w-]+$/, "a Drive file id") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ file_id }) => {
      const f = await g.json<DriveFile>(`/files/${file_id}`, { fields: "id,name,mimeType,modifiedTime,size,owners(displayName,me)", supportsAllDrives: true });
      let body: string;
      if (EXPORT[f.mimeType]) body = await g.text(`/files/${file_id}/export`, { mimeType: EXPORT[f.mimeType] });
      else if (isTextual(f.mimeType)) body = await g.text(`/files/${file_id}`, { alt: "media", supportsAllDrives: true });
      else return text(`${describeFile(f)}\nI can't read this kind of file (${KIND[f.mimeType] ?? f.mimeType}) yet, only its name and details.`);
      const trimmed = body.replace(/\r\n/g, "\n").trim();
      const cut = trimmed.length > MAX_CHARS ? `${trimmed.slice(0, MAX_CHARS)}\n[…cut, ${trimmed.length - MAX_CHARS} more characters]` : trimmed;
      return text(`${describeFile(f)}\n\n${cut || "(empty)"}`);
    },
  );

  return server;
}
