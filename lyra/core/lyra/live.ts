/** Live voice calls. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as S from "../skills.ts";
import * as ST from "../style.ts";
import { getChannel, getSetting, addMessage, listMessages, updateMessageMeta, type Channel } from "../db.ts";
import { localDay, recordUsage } from "../usage.ts";
import { LIVE_MODEL, LIVE_VOICES, liveSession, type LiveVoice } from "../live.ts";
import { DEFAULT_SOUL } from "../soul.ts";
import * as T from "../tasks.ts";
import { part } from "./part.ts";

export const live = part({
  // ---------- live voice (GPT-Live) ----------

  get liveVoice(): LiveVoice {
    const v = getSetting(this.db, "liveVoice") as LiveVoice | undefined;
    return v && (LIVE_VOICES as readonly string[]).includes(v) ? v : "marin";
  },

  /**
   * Start a live voice session: sends the browser's WebRTC offer to OpenAI with the
   * saved key (which never leaves the engine) and returns the answer to connect with.
   */
  async startLive(offerSdp: string, channelId: number | null): Promise<{ id: string; sdp: string }> {
    if (!this.keys.openai) throw new Error("Live voice uses OpenAI's GPT-Live. Add an OpenAI API key in Settings, AI model.");
    const channel = channelId === null ? undefined : getChannel(this.db, channelId);
    const session = liveSession({
      userName: this.userName,
      soul: (this.customSoul?.trim() || DEFAULT_SOUL).replaceAll("{user}", this.userName === "you" ? "the user" : this.userName),
      memory: this.workspace.main.read(),
      channel: channel ? { name: channel.name, about: channel.about, notebook: (await this.workspace.notebook(channel.id)).read() } : undefined,
      voice: this.liveVoice,
      history: listMessages(this.db, channelId, 24)
        .filter((m) => !m.meta.error)
        .map((m) => ({ role: m.role, text: m.content })),
      timeZone: this.p.timeZone,
    });
    const r = await this.fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.keys.openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session, transport: { type: "webrtc", sdp: offerSdp } }),
    });
    const j = (await r.json().catch(() => ({}))) as { session?: { id: string }; transport?: { sdp: string }; error?: { message?: string } };
    if (!r.ok || !j.transport?.sdp) {
      if (r.status === 401) throw new Error("OpenAI refused the API key. Check it in Settings, AI model.");
      throw new Error(j.error?.message ? `OpenAI couldn't start the call: ${j.error.message}` : `OpenAI couldn't start the call (${r.status}).`);
    }
    return { id: j.session?.id ?? "", sdp: j.transport.sdp };
  },

  /** Something asked aloud that needs Lyra's tools: runs as a normal turn (saved to the chat) and returns what to say. */
  async liveDelegate(request: string, channelId: number | null): Promise<string> {
    const { message, user } = await this.chat(request, { text: () => {}, status: () => {}, memory: () => {} }, channelId);
    for (const m of [user, message]) updateMessageMeta(this.db, m.id, { ...m.meta, voice: true });
    this.listeners.forEach((l) => l({ type: "message", channelId }));
    const notes = (message.meta.memory ?? []).filter((n) => n.kind === "suggested").length;
    return message.content + (notes ? "\n(One thing is waiting in the chat for the user to confirm before it's saved.)" : "");
  },

  /** Plain conversation from a call, kept in the chat as text. */
  async liveExchange(user: string, assistant: string, channelId: number | null): Promise<void> {
    addMessage(this.db, "user", user.slice(0, 4000), { voice: true }, channelId);
    addMessage(this.db, "assistant", assistant.slice(0, 4000), { voice: true, provider: "openai", model: LIVE_MODEL }, channelId);
    this.listeners.forEach((l) => l({ type: "message", channelId }));
    await this.db.flush();
  },

  /** The call is over: record the minutes GPT-Live billed. */
  async liveEnded(seconds: number): Promise<void> {
    if (seconds > 0) recordUsage(this.db, { day: localDay(new Date(), this.p.timeZone), provider: "openai", model: LIVE_MODEL, source: "voice", input: seconds, output: 0 });
    await this.db.flush();
  },
});
