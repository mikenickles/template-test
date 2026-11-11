export interface MemoryNote {
  kind: "saved" | "removed" | "suggested" | "dismissed";
  section: string;
  text: string;
  undone?: boolean;
  suggestionId?: number;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  meta: { memory?: MemoryNote[]; error?: boolean; tools?: { name: string; ok: boolean }[] };
}

export interface ProviderInfo {
  id: string;
  label: string;
  ready: boolean;
  defaultModel: string;
  hint?: string;
}

export interface ConnectorStatus {
  id: string;
  label: string;
  access: string;
  state: "connected" | "not_connected" | "not_configured" | "error";
  account?: string;
  detail?: string;
}

export interface AppState {
  name: string;
  userName: string;
  choice: { provider: string; model: string };
  providers: ProviderInfo[];
  connectors: ConnectorStatus[];
}

export interface MemoryView {
  content: string;
  sections: { name: string; items: string[] }[];
  history: { id: number; reason: string; created_at: string }[];
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  state: () => call<AppState>("GET", "/api/state"),
  messages: (before?: number) => call<{ messages: Message[] }>("GET", `/api/messages${before ? `?before=${before}` : ""}`),
  stop: () => call("POST", "/api/chat/stop"),
  memory: () => call<MemoryView>("GET", "/api/memory"),
  saveMemory: (content: string) => call<MemoryView>("PUT", "/api/memory", { content }),
  restoreMemory: (id: number) => call<MemoryView>("POST", "/api/memory/restore", { id }),
  note: (messageId: number, index: number, action: "undo" | "accept" | "dismiss") =>
    call<{ message: Message }>("POST", "/api/memory/note", { messageId, index, action }),
  settings: (provider: string, model: string) => call<AppState>("PUT", "/api/settings", { provider, model }),
  disconnectGmail: () => call<AppState>("POST", "/api/connectors/gmail/disconnect"),
};

export interface StreamHandlers {
  text(d: string): void;
  status(label: string): void;
  memory(note: MemoryNote): void;
  done(message: Message, user?: Message): void;
}

/** Send a message and read Lyra's reply as it streams in. */
export async function sendChat(text: string, h: StreamHandlers): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Couldn't reach Lyra.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let cut: number;
    while ((cut = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (!event || data === undefined) continue;
      const payload = JSON.parse(data);
      if (event === "text") h.text(payload.d);
      else if (event === "status") h.status(payload.label);
      else if (event === "memory") h.memory(payload);
      else if (event === "done") h.done(payload.message, payload.user);
    }
  }
}
