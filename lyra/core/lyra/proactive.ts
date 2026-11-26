/** Tomo speaking first: mail watch, heads-ups, check-ins, reminders, birthdays. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { awaySince, type AwayItem } from "../away.ts";
import { googleGet } from "../connectors/google-http.ts";
import * as A from "../actions.ts";
import * as P from "../people.ts";
import * as D from "../docs.ts";
import * as S from "../skills.ts";
import * as LA from "../lifeadmin.ts";
import * as MW from "../mailwatch.ts";
import { neutralize } from "../untrusted.ts";
import { getChannel, getMessage, getSetting, addMessage, setSetting, updateMessageMeta, type Channel } from "../db.ts";
import { cancelReminder, describeDue, dueReminders, finishReminder, pendingReminders, type Reminder } from "../reminders.ts";
import { localDay } from "../usage.ts";
import * as T from "../tasks.ts";
import * as R from "../routines.ts";
import { type Proactive, HEADS_UP_EVERY, MAIL_WATCH_EVERY, CHECK_IN_EVERY, RETRY_MS, inQuietHours, checkInInstructions, headsUpInstructions } from "./shared.ts";
import { part } from "./part.ts";

export const proactive = part({
  /**
   * Every few minutes: is there new mail from someone who matters? A plain search, no AI.
   * Only something new gets read, and Lyra posts (with buttons) only if it needs the user.
   * Returns true when a look started.
   */
  tickMailWatch(now = new Date()): boolean {
    const p = this.proactive;
    if (p.level === "off" || !p.mailWatch || !this.gmailOn || this.mailWatching) return false;
    if (!this.p.provider && this.choice().provider === "fake") return false;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    // in quiet hours it doesn't look, so what arrives overnight is still new in the morning
    if (inQuietHours(local, p)) return false;
    const last = getSetting(this.db, "mailWatchAt");
    if (last && now.getTime() - new Date(last).getTime() < MAIL_WATCH_EVERY) return false;
    setSetting(this.db, "mailWatchAt", now.toISOString());
    this.mailWatching = true;
    void this.watchMail()
      .catch((e) => console.error("[lyra] mail watch", e))
      .finally(() => (this.mailWatching = false));
    return true;
  },

  async watchMail(): Promise<void> {
    const r = await this.connectors.call("gmail__search_mail", { query: MW.watchQuery(P.listPeople(this.db)), max_results: 15 });
    if (r.isError) return;
    const items = MW.parseMailList(r.content);
    const before = getSetting(this.db, "mailWatchSeen");
    let seen: string[] = [];
    try {
      seen = JSON.parse(before ?? "[]") as string[];
    } catch {
      seen = [];
    }
    const f = MW.fresh(items, seen);
    // the first look only learns what's already there: no alert for old mail
    if (JSON.stringify(f.seen) !== JSON.stringify(seen)) setSetting(this.db, "mailWatchSeen", JSON.stringify(f.seen));
    if (before === undefined || !f.fresh.length) return;
    // (a heads-up check running now would read the same mail: let it, and skip this round's AI step)
    if (this.routinesRunner.headsUpRunning) return;
    await new Promise<void>((settled) =>
      this.routinesRunner.headsUp(
        {
          name: "Mail watch",
          instructions: MW.mailWatchInstructions(f.fresh, this.userName),
          last_run_at: null,
          last_summary: getSetting(this.db, "headsUpLast") ?? "",
          post_mode: "news",
          channel_id: null,
        },
        (messageId, text) => {
          settled();
          if (messageId === null) return;
          // so the next heads-up doesn't say it again
          setSetting(this.db, "headsUpLast", `${text}\n\n${getSetting(this.db, "headsUpLast") ?? ""}`.slice(0, 800));
          const options = getMessage(this.db, messageId)?.meta.suggestions ?? [];
          const who = f.fresh.length === 1 ? MW.senderName(f.fresh[0].from) : "";
          this.listeners.forEach((l) =>
            l({ type: "message", channelId: null, notify: { title: who ? `Mail from ${neutralize(who)}` : "New mail", body: text.split("\n")[0].slice(0, 160), options } }),
          );
        },
      ),
    );
  },

  // ---------- check-ins: when nothing needs you, Lyra asks for work ----------

  /**
   * Once a day (Light) or every 8 hours (Active), in the daytime and never in quiet hours:
   * if nothing is waiting on the user, they aren't mid-conversation, and they've answered
   * the last check-in, Lyra offers to take something on or asks to get to know them.
   */
  tickCheckIn(now = new Date()): boolean {
    const p = this.proactive;
    if (p.level === "off" || !p.checkIns) return false;
    if (!this.p.provider && this.choice().provider === "fake") return false;
    if (this.busy || this.routinesRunner.headsUpRunning) return false;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (inQuietHours(local, p) || local < "09:00" || local >= "20:00") return false;
    const lastAt = getSetting(this.db, "checkInAt");
    if (lastAt && now.getTime() - new Date(lastAt).getTime() < CHECK_IN_EVERY[p.level]) return false;
    // something fresh already needs them, or Lyra is busy on their behalf: no need to ask for more.
    // (Only the last two days count: a task or a card left sitting for a week shouldn't silence Lyra for good.)
    const fresh = new Date(now.getTime() - 48 * 3600_000).toISOString();
    const waiting =
      this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE status = 'ready' AND updated_at >= ?", [fresh])!.n +
      this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM actions WHERE status = 'proposed' AND created_at >= ?", [fresh])!.n;
    if (waiting > 0) return false;
    if (this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE status = 'working'")!.n > 0) return false;
    // not in the middle of talking
    const lastUser = this.db.get<{ at: string | null }>("SELECT MAX(created_at) AS at FROM messages WHERE role = 'user'")!.at;
    if (lastUser && now.getTime() - new Date(lastUser).getTime() < 2 * 3600_000) return false;
    // the last one is still unanswered: don't stack them (give up waiting after 3 days)
    const lastId = Number(getSetting(this.db, "checkInMessage") ?? 0);
    if (lastId && lastAt && now.getTime() - new Date(lastAt).getTime() < 3 * 86_400_000) {
      const answered = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND channel_id IS NULL AND id > ?", [lastId])!.n > 0;
      if (!answered) return false;
    }
    setSetting(this.db, "checkInAt", now.toISOString());
    let recent: string[] = [];
    try {
      recent = JSON.parse(getSetting(this.db, "checkInRecent") || "[]");
    } catch {
      recent = [];
    }
    this.routinesRunner.headsUp(
      {
        name: "Check-in",
        instructions: checkInInstructions(this.userName, recent, this.actionsAllowed()),
        last_run_at: lastAt || null,
        last_summary: "",
        post_mode: "news",
        channel_id: null,
      },
      (messageId, text, failed) => {
        if (failed) setSetting(this.db, "checkInAt", new Date(now.getTime() - CHECK_IN_EVERY[p.level] + RETRY_MS).toISOString());
        if (messageId === null) return;
        setSetting(this.db, "checkInMessage", String(messageId));
        setSetting(this.db, "checkInRecent", JSON.stringify([text.replace(/\s+/g, " ").slice(0, 200), ...recent].slice(0, 6)));
        const options = getMessage(this.db, messageId)?.meta.suggestions ?? [];
        this.listeners.forEach((l) => l({ type: "message", channelId: null, notify: { title: "Tomo", body: text.split("\n")[0].slice(0, 160), options } }));
      },
      "checkIn",
    );
    return true;
  },

  // ---------- heads-ups ----------

  /**
   * Every so often (Settings: Light every 4 hours, Active every hour, never in quiet hours)
   * Lyra checks mail, calendar, tasks and loose ends, and posts only if something needs the user.
   * Returns true when a check started.
   */
  tickHeadsUp(now = new Date()): boolean {
    const p = this.proactive;
    if (p.level === "off") return false;
    // the practice model can't really check anything
    if (!this.p.provider && this.choice().provider === "fake") return false;
    if (this.busy || this.routinesRunner.headsUpRunning) return false;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (inQuietHours(local, p)) return false;
    const lastAt = getSetting(this.db, "headsUpAt");
    if (lastAt && now.getTime() - new Date(lastAt).getTime() < HEADS_UP_EVERY[p.level]) return false;
    setSetting(this.db, "headsUpAt", now.toISOString());
    const sources = this.connectors.status().filter((c) => c.state === "connected").map((c) => c.id);
    // (0.53) a look without AI first: if the inbox, the next hours of the calendar, tasks, memory and
    // bills are just as they were at the last check (same day), there's nothing new to say: no model call
    this.routinesRunner.headsUpRunning = true;
    const look = this.headsUpPrint(now)
      .then((print) => {
        this.routinesRunner.headsUpRunning = false;
        if (print && print === getSetting(this.db, "headsUpPrint")) {
          setSetting(this.db, "headsUpSkipped", String(Number(getSetting(this.db, "headsUpSkipped") ?? 0) + 1));
          void this.db.flush();
          return;
        }
        this.runHeadsUp(now, lastAt, sources, p, print);
      })
      .catch(() => {
        this.routinesRunner.headsUpRunning = false;
        this.runHeadsUp(now, lastAt, sources, p, null);
      });
    this.routinesRunner.track(look);
    return true;
  },

  runHeadsUp(now: Date, lastAt: string | undefined, sources: string[], p: Proactive, print: string | null): void {
    this.routinesRunner.headsUp(
      {
        name: "Heads-up check",
        instructions: headsUpInstructions(sources, this.userName, p.level),
        last_run_at: lastAt || null,
        last_summary: getSetting(this.db, "headsUpLast") ?? "",
        post_mode: "news",
        channel_id: null,
      },
      (messageId, text, failed) => {
        // couldn't check (no network, the model was down): try again in a few minutes, not in hours
        if (failed) setSetting(this.db, "headsUpAt", new Date(now.getTime() - HEADS_UP_EVERY[p.level] + RETRY_MS).toISOString());
        // what this check saw, so the next one can tell whether anything changed (not after a failed one)
        else if (print) setSetting(this.db, "headsUpPrint", print);
        if (messageId === null) return;
        setSetting(this.db, "headsUpLast", text.slice(0, 800));
        const options = getMessage(this.db, messageId)?.meta.suggestions ?? [];
        this.listeners.forEach((l) => l({ type: "message", channelId: null, notify: { title: "Heads-up from Tomo", body: text.split("\n")[0].slice(0, 160), options } }));
      },
    );
  },

  /**
   * (0.53) What a heads-up check would look at, as one short fingerprint, read without AI: the day,
   * the inbox's recent mail (ids), the calendar for the next 16 hours (ids, times, edits), open tasks,
   * memory, and open life admin items. null when it can't be read (then the check just runs).
   */
  async headsUpPrint(now: Date): Promise<string | null> {
    const parts: string[] = [LA.localDay(now, this.p.timeZone)];
    const on = (id: string) => this.connectors.status().some((c) => c.id === id && c.state === "connected");
    if (on("gmail")) {
      const r = await googleGet("https://gmail.googleapis.com/gmail/v1/users/me", "Gmail", this.tokenFor("gmail"), this.fetch).json<{ messages?: { id: string }[] }>("/messages", {
        q: "in:inbox newer_than:2d -category:promotions -category:social -category:updates -category:forums",
        maxResults: 25,
      });
      parts.push(`m:${(r.messages ?? []).map((m) => m.id).join(",")}`);
    }
    if (on("calendar")) {
      const r = await googleGet("https://www.googleapis.com/calendar/v3", "Google Calendar", this.tokenFor("calendar"), this.fetch).json<{
        items?: { id: string; updated?: string; start?: { date?: string; dateTime?: string } }[];
      }>("/calendars/primary/events", { timeMin: now.toISOString(), timeMax: new Date(now.getTime() + 16 * 3600_000).toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 25 });
      parts.push(`c:${(r.items ?? []).map((e) => `${e.id}@${e.start?.dateTime ?? e.start?.date ?? ""}~${e.updated ?? ""}`).join(",")}`);
    }
    parts.push(`t:${this.db.all<{ id: number; status: string; updated_at: string }>("SELECT id, status, updated_at FROM tasks WHERE status <> 'done' ORDER BY id").map((t) => `${t.id}${t.status}${t.updated_at}`).join(",")}`);
    parts.push(`n:${this.memory.read()}`);
    parts.push(`a:${this.db.all<{ id: number; status: string; due_on: string | null }>("SELECT id, status, due_on FROM admin_items WHERE status = 'open' ORDER BY id").map((a) => `${a.id}${a.due_on ?? ""}`).join(",")}`);
    // a short digest, so the setting stays small
    const bytes = new TextEncoder().encode(parts.join("|"));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  },

  // ---------- reminders and follow-ups ----------

  /** What Lyra did on its own since then: routine posts, heads-ups, reminders, tasks now ready. */
  away(since: string): { items: AwayItem[]; more: number } {
    return awaySince(this.db, since);
  },

  reminders(): Reminder[] {
    return pendingReminders(this.db);
  },

  async cancelReminder(id: number): Promise<void> {
    cancelReminder(this.db, id);
    this.listeners.forEach((l) => l({ type: "reminder" }));
    await this.db.flush();
  },

  /**
   * On the routine tick: tidy the list, give any heads-ups due today (no model call), and
   * once a day go through the inbox, in the daytime, when Gmail is connected.
   */
  /**
   * Birthdays on people cards: a heads-up a few days ahead and one on the day, written by code
   * (no model call). Looked at once a day, from 8:00, outside quiet hours, unless heads-ups are off.
   */
  tickBirthdays(now = new Date()): void {
    if (this.proactive.level === "off") return;
    const today = LA.localDay(now, this.p.timeZone);
    if (getSetting(this.db, "birthdaysAt") === today) return;
    const local = now.toLocaleTimeString("en-GB", { timeZone: this.p.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (local < "08:00" || local >= "21:00" || inQuietHours(local, this.proactive)) return;
    setSetting(this.db, "birthdaysAt", today);
    let seen: Record<string, string> = {};
    try {
      seen = JSON.parse(getSetting(this.db, "birthdaySeen") ?? "{}");
    } catch {
      // start over
    }
    const n = P.birthdayNotices(P.listPeople(this.db), today, seen);
    if (!n) return;
    setSetting(this.db, "birthdaySeen", JSON.stringify(n.seen));
    if (!n.text) return;
    const options = n.soon ? ["Remind me that morning"] : [];
    addMessage(this.db, "assistant", n.text, { headsUp: true, ...(options.length ? { suggestions: options } : {}) }, null);
    this.listeners.forEach((l) => l({ type: "message", channelId: null, notify: { title: "Birthday", body: n.text.split("\n")[0].slice(0, 160), options } }));
    void this.db.flush();
  },

  tickReminders(now: Date): void {
    const due = dueReminders(this.db, now);
    if (!due.length) return;
    for (const r of due) {
      // marked first, so a second tick can't post it twice
      finishReminder(this.db, r.id, null);
      const late = now.getTime() - new Date(r.due_at).getTime() > 10 * 60_000 ? ` (was due ${describeDue(new Date(r.due_at), this.p.timeZone, now)})` : "";
      const channelId = r.channel_id && getChannel(this.db, r.channel_id) ? r.channel_id : null;
      const announce = (messageId: number, title: string, body: string) => {
        this.db.run("UPDATE reminders SET message_id = ? WHERE id = ?", [messageId, r.id]);
        const m = getMessage(this.db, messageId);
        if (m) updateMessageMeta(this.db, messageId, { ...m.meta, reminder: { id: r.id, kind: r.kind } });
        // A reminder: a phone that knew about it showed its own notification at the time. A follow-up's
        // result is news nobody has seen yet.
        this.listeners.forEach((l) =>
          l({ type: "message", channelId, notify: { title, body: body.split("\n")[0].slice(0, 160), ...(r.kind === "remind" ? { scheduled: true, since: r.created_at, reminderId: r.id } : {}) } }),
        );
        void this.db.flush();
      };
      if (r.kind === "remind") {
        const msg = addMessage(this.db, "assistant", `Reminder: ${r.text}${late}`, {}, channelId);
        announce(msg.id, "Reminder", r.text);
      } else {
        this.routinesRunner.followUp({ text: r.text, createdAt: r.created_at, channelId }, (messageId, text) => {
          const id = messageId ?? addMessage(this.db, "assistant", `I said I'd check on this: ${r.text}\n\nI couldn't just now${text ? ` (${text})` : ""}. Want me to try again later?`, {}, channelId).id;
          announce(id, "Tomo followed up", text || r.text);
        });
      }
    }
    this.listeners.forEach((l) => l({ type: "reminder" }));
    void this.db.flush();
  },
});
