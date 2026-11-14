// Phase 16: inbox triage, done when the user asks (or as a routine they set up).
// Lyra reads the mail with its read-only Gmail tools and shows the result as a card:
// what needs the user, what can wait, and newsletters / promotions.
export interface TriageItem {
  /** Gmail thread id (for "Open in Gmail") */
  thread: string;
  from: string;
  subject: string;
  /** one short line: why it's here, what it wants */
  why: string;
}

export interface Triage {
  /** "Last 24 hours", "This week" */
  range: string;
  /** one or two sentences: the gist */
  summary: string;
  needs: TriageItem[];
  later: TriageItem[];
  fyi: TriageItem[];
}

const one = (s: unknown, max: number) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function items(v: unknown, max: number): TriageItem[] {
  const out: TriageItem[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const thread = one(r.thread_id ?? r.thread, 32);
    if (!/^[0-9a-f]{6,32}$/i.test(thread)) continue; // only real Gmail threads, so the buttons work
    const from = one(r.from, 80);
    const subject = one(r.subject, 140) || "(no subject)";
    if (!from) continue;
    out.push({ thread, from, subject, why: one(r.why, 160) });
    if (out.length >= max) break;
  }
  return out;
}

/** Checks what the model put on the card. */
export function checkTriage(input: Record<string, unknown>): Triage {
  const t: Triage = {
    range: one(input.range, 40) || "Recent mail",
    summary: one(input.summary, 300),
    needs: items(input.needs_you, 15),
    later: items(input.can_wait, 20),
    fyi: items(input.newsletters, 40),
  };
  if (!t.needs.length && !t.later.length && !t.fyi.length && !t.summary) throw new Error("The triage is empty. Search the mail first, or say there's nothing new.");
  return t;
}

const ITEM = {
  type: "object",
  properties: {
    thread_id: { type: "string", description: "The thread id from search_mail." },
    from: { type: "string", description: "Sender's name (or address)." },
    subject: { type: "string" },
    why: { type: "string", description: "One short line: what it is or what it wants from the user." },
  },
  required: ["thread_id", "from", "subject"],
};

/** The tool schema (chat tool show_triage, and the triage field on a routine's post). */
export const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    range: { type: "string", description: "What you went through: 'Last 24 hours', 'This week'." },
    summary: { type: "string", description: "One or two sentences: the gist, the one thing that matters most." },
    needs_you: { type: "array", items: ITEM, description: "Real people waiting on a reply or a decision, deadlines, bills, anything urgent." },
    can_wait: { type: "array", items: ITEM, description: "Worth reading, no action soon." },
    newsletters: { type: "array", items: ITEM, description: "Newsletters, promotions, notifications, receipts." },
  },
  required: ["range", "needs_you", "can_wait", "newsletters"],
};

export const TRIAGE_GUIDE = `To triage, search the inbox for the period asked (default: since yesterday; Gmail: in:inbox newer_than:1d, or newer_than:7d for a week), read only the threads you can't judge from sender and subject, and sort every email into needs_you (a real person waiting on a reply or a decision, a deadline, a bill, something urgent), can_wait, or newsletters (promotions, newsletters, notifications, receipts). Keep each "why" to a few words.`;
