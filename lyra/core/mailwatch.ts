/**
 * Mail watch: every few minutes, a plain Gmail search (no AI) for new mail from the people
 * who matter (anyone with a People card, or what Gmail marks Important). Only when something
 * new turns up does Lyra read it and decide whether to tell the user, with the next steps as
 * buttons on the notification. Newsletters, promotions and automated mail never get that far.
 */
import type { Person } from "./people.ts";

export interface MailItem {
  id: string;
  thread: string;
  from: string;
  subject: string;
}

/** The emails search_mail found, read from its text (one block per message). */
export function parseMailList(text: string): MailItem[] {
  const out: MailItem[] = [];
  for (const block of text.split(/\n(?=- id: )/)) {
    const ids = block.match(/- id: ([0-9a-f]+) \| thread: ([0-9a-f]+)/i);
    if (!ids) continue;
    const field = (k: string) => block.match(new RegExp(`\\n\\s*${k}: ([^\\n]*)`))?.[1]?.trim() ?? "";
    out.push({ id: ids[1], thread: ids[2], from: field("from"), subject: field("subject") });
  }
  return out;
}

/** "Rebecca Hickey <rhickey@school.org>" → "Rebecca Hickey" (or the address, if there's no name). */
export function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  return (name || from.replace(/[<>]/g, "").trim()).slice(0, 40);
}

/** Gmail search for new mail worth a look: from someone with a People card, or marked Important. */
export function watchQuery(people: Pick<Person, "emails">[]): string {
  const emails = [...new Set(people.flatMap((p) => p.emails).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@()"]+@[^\s@()"]+\.[a-z]{2,}$/i.test(e)))].slice(0, 40);
  const who = ["is:important", ...emails.map((e) => `from:${e}`)].join(" OR ");
  return `in:inbox newer_than:2d -category:promotions -category:social -category:forums -category:updates (${who})`;
}

/** Ids not seen before, and the seen list to keep (newest last, at most 300). */
export function fresh(items: MailItem[], seen: string[]): { fresh: MailItem[]; seen: string[] } {
  const known = new Set(seen);
  const found = items.filter((i) => !known.has(i.id));
  return { fresh: found, seen: [...seen, ...found.map((i) => i.id)].slice(-300) };
}

/** What Lyra does with the new mail: read it, and speak up only if it needs the user. */
export function mailWatchInstructions(items: MailItem[], userName: string): string {
  const user = userName === "you" ? "the user" : userName;
  return `New mail just arrived for ${user} from people who matter to them. You're looking at it the moment it lands, like a chief of staff who glanced at the inbox.

The new messages (read the ones that might matter with read_thread, using the thread id):
${items.map((i) => `- thread ${i.thread}: from ${i.from || "(unknown)"}, "${i.subject || "(no subject)"}"`).join("\n")}

Post only if one of them needs ${user}: a question waiting on their answer, a change of plans, a deadline, something to sign or pay, news they'd want now. Otherwise call nothing_new: an FYI, a thank-you or a newsletter isn't worth interrupting them for.

If you post, write it like a text from you: who it's from and what they need, in a sentence or two, with any date or amount exactly as written. Then give the next steps as options they can tap, written as they'd say them: "Draft a reply", "Remind me tonight", "Add it to my calendar". The first option should be the most likely one. Never more than three.`;
}
