/**
 * Live voice with OpenAI's GPT-Live (a real-time speech model, billed per minute).
 * GPT-Live does the listening and talking. When the user asks for something that
 * needs Lyra's tools or memory, it "delegates": Lyra's normal engine does the work
 * with the chat model and hands the answer back to be spoken.
 *
 * This file is the call's logic, independent of microphones and WebRTC, so it can
 * be tested: it turns Live's events into a transcript, runs delegations, and
 * tracks the minutes used.
 */

export const LIVE_MODEL = "gpt-live-1";
/** OpenAI's list price for GPT-Live audio, dollars per minute (billed per second). */
export const LIVE_PRICE_PER_MINUTE = 0.05;
export const LIVE_VOICES = ["marin", "cedar", "coral", "sage", "ash", "verse", "alloy", "echo", "shimmer", "ballad"] as const;
export type LiveVoice = (typeof LIVE_VOICES)[number];

export interface LiveSessionInput {
  userName: string;
  /** Lyra's character (the soul text) */
  soul: string;
  /** main memory, as markdown */
  memory: string;
  /** set in a channel */
  channel?: { name: string; about: string; notebook: string };
  voice: LiveVoice;
  /** recent chat, oldest first, so the call picks up where the chat left off */
  history: { role: "user" | "assistant"; text: string }[];
  now?: Date;
  timeZone?: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** What GPT-Live is told about who it is and when to hand work to Lyra's engine. */
export function liveInstructions(p: LiveSessionInput): string {
  const user = p.userName === "you" ? "the user" : p.userName;
  const now = (p.now ?? new Date()).toLocaleString("en-US", { timeZone: p.timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `You are Lyra, ${user}'s personal chief of staff, on a voice call with them. It is ${now}.

# Who you are
${clip(p.soul.trim(), 3500)}

# Speaking
- This is spoken, not written. Short, natural sentences. No lists, no markdown, no reading out symbols or web addresses.
- Lead with the answer. One or two sentences is usually right; stop and let ${user} respond.
- Warm and relaxed, like a friend who is glad to help. If ${user} interrupts, stop and listen.
- Say times and amounts the way people say them ("ten thirty", "about forty dollars").

# Getting things done
You can talk, but your tools live in Lyra's main engine. Delegate whenever ${user} asks for something that needs:
- their mail, calendar or files, or anything on the web
- saving, changing or checking something in memory, tasks, routines or channels
- facts you aren't sure of
When you delegate, say a few words so they know ("One sec, checking your calendar."). When the result comes back, say it briefly in your own words. Never claim to have done something unless a delegation result says it was done. If a result says something couldn't be done, say so plainly.
Don't delegate small talk or things already in the memory below.

# What you know about ${user}
${clip(p.memory.trim(), 4000) || "(nothing saved yet)"}
${p.channel ? `\n# This call is in the "${p.channel.name}" channel\n${p.channel.about}\n${clip(p.channel.notebook.trim(), 2500)}\n` : ""}`;
}

/** The session part of POST /v1/live/sessions. */
export function liveSession(p: LiveSessionInput) {
  return {
    model: LIVE_MODEL,
    instructions: liveInstructions(p),
    audio: { output: { voice: p.voice } },
    // tasks GPT-Live hands off come to this app, which runs them with Lyra's engine
    delegation: { type: "client" as const },
    input: p.history
      .filter((m) => m.text.trim())
      .slice(-24)
      .map((m) =>
        m.role === "user"
          ? { type: "message" as const, role: "user" as const, content: [{ type: "input_text" as const, text: clip(m.text, 1200) }] }
          : { type: "message" as const, role: "assistant" as const, content: [{ type: "output_text" as const, text: clip(m.text, 1200) }] },
      ),
  };
}

export interface LiveTurn {
  role: "user" | "assistant";
  text: string;
}

export type LiveStatus = "connecting" | "listening" | "speaking" | "working" | "ended";

export interface LiveHooks {
  /** send a client event to GPT-Live */
  send(event: Record<string, unknown>): void;
  /** do delegated work with Lyra's engine: what the user asked, in their words; returns what to say back */
  delegate(request: string): Promise<string>;
  /** a finished exchange of plain conversation, to keep in the chat */
  exchange(user: string, assistant: string): void;
  /** anything changed: status, captions, time */
  changed(): void;
}

/** One voice call: feed it GPT-Live's events; it keeps the captions, the clock and the delegations. */
export class LiveCall {
  status: LiveStatus = "connecting";
  /** what's being said right now, for captions */
  heard = "";
  said = "";
  /** audio seconds billed so far, as GPT-Live reports them */
  seconds = 0;
  error: string | null = null;
  private pendingUser = "";
  private pendingAssistant = "";
  private last: "user" | "assistant" | null = null;
  /** the current exchange was answered by the engine, which saved it to the chat itself */
  private engineAnswered = false;
  private working = 0;

  constructor(private hooks: LiveHooks) {}

  get cost(): number {
    return (this.seconds / 60) * LIVE_PRICE_PER_MINUTE;
  }

  handle(ev: { type?: string; [k: string]: unknown }): void {
    switch (ev.type) {
      case "session.started":
        this.status = "listening";
        break;
      case "session.input_transcript.delta": {
        // the user starts a new turn: the last exchange is complete
        if (this.last === "assistant") this.flush();
        this.last = "user";
        this.pendingUser += String(ev.delta ?? "");
        this.heard = this.pendingUser.trim();
        this.said = "";
        if (!this.working) this.status = "listening";
        break;
      }
      case "session.output_transcript.delta":
        this.last = "assistant";
        this.pendingAssistant += String(ev.delta ?? "");
        this.said = this.pendingAssistant.trim();
        if (!this.working) this.status = "speaking";
        break;
      case "session.delegation.created": {
        const d = ev.delegation as { id?: string; target?: string } | undefined;
        if (d?.id && d.target === "client") void this.runDelegation(d.id);
        break;
      }
      case "session.usage.updated": {
        const s = Number((ev.usage as { seconds?: number } | undefined)?.seconds);
        // cumulative for the session: keep the latest, never add
        if (Number.isFinite(s) && s > this.seconds) this.seconds = s;
        break;
      }
      case "error":
        this.error = String((ev.error as { message?: string } | undefined)?.message ?? "The voice call hit a problem.");
        break;
      case "session.closed":
        this.end();
        return;
      default:
        return;
    }
    this.hooks.changed();
  }

  private async runDelegation(id: string): Promise<void> {
    const request = this.pendingUser.trim();
    this.working++;
    this.status = "working";
    this.engineAnswered = true;
    this.hooks.changed();
    let result: string;
    try {
      result = request ? await this.hooks.delegate(request) : "I didn't catch what to do. Ask them to say it again.";
    } catch (e) {
      result = `That didn't work: ${(e as Error).message}`;
    }
    this.working--;
    if ((this.status as LiveStatus) === "ended") return;
    // the answer goes back as context for that delegation; GPT-Live says it in its own words (500 tokens at most)
    this.hooks.send({ type: "session.instructions.append", delegation_id: id, content: `Result from Lyra's engine, to tell the user briefly:\n${clip(result, 1500)}` });
    if (!this.working) this.status = "listening";
    this.hooks.changed();
  }

  /** Close out the current exchange: plain conversation is kept in the chat; engine-answered turns already are. */
  private flush(): void {
    const user = this.pendingUser.trim();
    const assistant = this.pendingAssistant.trim();
    if (!this.engineAnswered && user && assistant) this.hooks.exchange(user, assistant);
    this.pendingUser = "";
    this.pendingAssistant = "";
    this.engineAnswered = false;
  }

  end(): void {
    if (this.status === "ended") return;
    this.flush();
    this.status = "ended";
    this.hooks.changed();
  }
}

/** "2:05" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
