/**
 * Scanning a paper: a photo of a flyer, permission slip, receipt, invitation or schedule
 * becomes a card of what's on it that needs doing (dates, deadlines, to-dos, amounts), each
 * with a button. The user's tap does it (a reminder, a task), so nothing waits on a second "yes".
 */

export type ScanKind = "date" | "deadline" | "todo" | "amount";

export interface ScanItem {
  kind: ScanKind;
  /** what it is, as the user would want to read it: "Field trip permission slip and $12" */
  text: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DD HH:MM", the user's local time */
  when?: string;
  /** what was done with it: "remind" or "task" */
  done?: "remind" | "task";
}

export interface Scan {
  title: string;
  items: ScanItem[];
}

const KINDS: ScanKind[] = ["date", "deadline", "todo", "amount"];
const one = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const WHEN = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;

/** A scan card from the model, cleaned. Throws when there's nothing on it. */
export function checkScan(input: Record<string, unknown>): Scan {
  const items = (Array.isArray(input.items) ? input.items : [])
    .slice(0, 12)
    .map((raw) => {
      const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const kind = KINDS.includes(r.kind as ScanKind) ? (r.kind as ScanKind) : "todo";
      const when = one(r.when, 16);
      return { kind, text: one(r.text, 120), ...(WHEN.test(when) ? { when } : {}) };
    })
    .filter((i) => i.text);
  if (!items.length) throw new Error("Nothing to show: add at least one date, deadline, to-do or amount from the paper.");
  return { title: one(input.title, 60) || "From the paper", items };
}

/** What a button does for this item: remind (it has a date) or add to the list. */
export function actionFor(i: ScanItem): "remind" | "task" | null {
  if (i.when && (i.kind === "date" || i.kind === "deadline")) return "remind";
  if (i.kind === "todo" || i.kind === "deadline") return "task";
  if (i.kind === "amount") return i.when ? "remind" : null;
  return null;
}

/**
 * When to remind, as local "YYYY-MM-DD HH:MM": a deadline the day before at 9 (time to act),
 * an event with a time an hour before, an all-day date that morning at 8.
 */
export function remindAt(i: ScanItem): string | null {
  if (!i.when) return null;
  const [date, time] = i.when.split(" ");
  const d = new Date(`${date}T12:00:00Z`);
  const day = (n: number) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  if (i.kind === "deadline" || i.kind === "amount") return `${day(-1)} 09:00`;
  if (time) {
    const [h, m] = time.split(":").map(Number);
    const mins = h * 60 + m - 60;
    return mins >= 0 ? `${date} ${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}` : `${day(-1)} 20:00`;
  }
  return `${date} 08:00`;
}

/** The tool Lyra uses to show it. */
export const SCAN_TOOL = {
  name: "show_scan",
  description:
    "When the user sends a photo or file of a paper (a flyer, permission slip, receipt, invitation, schedule, bill, letter), show what on it needs doing as a card with buttons: each date, deadline, to-do and amount, one per item. The user taps to get a reminder or add it to their list. Then say the gist in a sentence; don't repeat the list.",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What the paper is, in a few words: 'Room 12 field trip slip'." },
      items: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: KINDS, description: "date: something happens then. deadline: something must be done by then. todo: something to do, no date. amount: money to pay." },
            text: { type: "string", description: "What it is, short and specific, with any amount: 'Permission slip and $12 due'." },
            when: { type: "string", description: "YYYY-MM-DD, or YYYY-MM-DD HH:MM when there's a time, in the user's local time. Leave out when there's no date." },
          },
          required: ["kind", "text"],
        },
      },
    },
    required: ["items"],
  },
};
