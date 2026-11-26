/** Messages: history, pins, ratings, notes, cards' buttons, search, the agenda. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { googleGet } from "../connectors/google-http.ts";
import * as A from "../actions.ts";
import * as S from "../skills.ts";
import * as AC from "../activity.ts";
import * as SC from "../scan.ts";
import { latestIds, searchMessages, todayView, unreadCounts, type SearchHit, type Today } from "../today.ts";
import { getMessage, deleteMessage, pinnedMessages, listMessages, updateMessageMeta, type StoredMessage } from "../db.ts";
import { createReminder, localToDate, type Reminder } from "../reminders.ts";
import * as T from "../tasks.ts";
import { type Agenda } from "./shared.ts";
import { part } from "./part.ts";

export const messages = part({
  /** The Today view: what needs the user, what Lyra said lately, what's coming up. */
  today(): Today {
    return todayView(this.db, { timeZone: this.p.timeZone });
  },

  searchMessages(q: string): SearchHit[] {
    return searchMessages(this.db, q);
  },

  unread(seen: Record<string, number>): Record<string, number> {
    return unreadCounts(this.db, seen);
  },

  latestMessageIds(): Record<string, number> {
    return latestIds(this.db);
  },

  /**
   * A button on a scan card: remind about that item, or put it on the list. The user's own tap,
   * on exactly the words they see, so it's done right away. "all" does every item at once.
   */
  async scanAction(messageId: number, which: number | "all"): Promise<StoredMessage> {
    const m = getMessage(this.db, messageId);
    const card = m?.meta.scan;
    if (!m || !card) throw new Error("That card is gone.");
    const items = card.items.map((i) => ({ ...i }));
    const idx = which === "all" ? items.map((_, i) => i) : [which];
    let did = 0;
    for (const i of idx) {
      const it = items[i];
      if (!it || it.done) continue;
      const act = SC.actionFor(it);
      if (act === "remind") {
        const at = SC.remindAt(it);
        const when = at ? localToDate(at, this.p.timeZone) : null;
        // already past: a to-do instead
        if (when && when.getTime() > Date.now()) {
          createReminder(this.db, { kind: "remind", text: it.text, at: when, channelId: m.channel_id });
          it.done = "remind";
          did++;
          continue;
        }
      }
      if (act) {
        T.createTask(this.db, { title: it.text, brief: `From ${card.title}${it.when ? `, ${it.when}` : ""}.`, steps: [], channelId: m.channel_id, kind: "task" }, "you");
        it.done = "task";
        did++;
      }
    }
    if (!did && which !== "all") throw new Error("Nothing to do for that one.");
    updateMessageMeta(this.db, messageId, { ...m.meta, scan: { ...card, items } });
    this.listeners.forEach((l) => l({ type: "reminder" }));
    this.listeners.forEach((l) => l({ type: "message", channelId: m.channel_id }));
    await this.db.flush();
    return getMessage(this.db, messageId)!;
  },

  /** A tap on a reply's widget: tick or untick a checklist line, or note which choice was picked. */
  async widgetTap(messageId: number, index: number, on = true): Promise<StoredMessage> {
    const m = getMessage(this.db, messageId);
    const w = m?.meta.widget;
    if (!m || !w) throw new Error("That card is gone.");
    let next: typeof w;
    if (w.kind === "checklist") {
      if (!w.items[index]) throw new Error("That line is gone.");
      next = { ...w, items: w.items.map((it, i) => (i === index ? { text: it.text, ...(on ? { done: true } : {}) } : it)) };
    } else if (w.kind === "choices") {
      if (!w.options[index]) throw new Error("That option is gone.");
      next = { ...w, picked: index };
    } else return m;
    updateMessageMeta(this.db, messageId, { ...m.meta, widget: next });
    await this.db.flush();
    return getMessage(this.db, messageId)!;
  },

  /**
   * For the Today screen (0.48): what's left on the calendar today and tomorrow morning, and how
   * much Lyra has done since midnight. No AI: one calendar read, kept for five minutes.
   */
  async agenda(now = new Date()): Promise<Agenda> {
    const tz = this.p.timeZone;
    const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const today = dayOf(now);
    const midnight = localToDate(`${today} 00:00`, tz) ?? new Date(now.getTime() - 12 * 3600_000);
    const did = AC.listActivity(this.db, { limit: 60 }).filter((a) => new Date(a.at).getTime() >= midnight.getTime()).length;
    const calendar = this.connectors.status().some((c) => c.id === "calendar" && c.state === "connected");
    if (!calendar) return { calendar: false, events: [], did };
    const c = this.agendaCache;
    if (c && c.day === today && now.getTime() - c.at < 5 * 60_000) return { ...c.value, did };
    const g = googleGet("https://www.googleapis.com/calendar/v3", "Google Calendar", this.tokenFor("calendar"), this.fetch);
    const tomorrowNoon = new Date(midnight.getTime() + 36 * 3600_000);
    const r = await g.json<{ items?: { id: string; status?: string; summary?: string; location?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[] }>("/calendars/primary/events", {
      timeMin: now.toISOString(),
      timeMax: tomorrowNoon.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 12,
    });
    const events = (r.items ?? [])
      .filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
      .map((e) => {
        const allDay = !e.start?.dateTime;
        const start = allDay ? `${e.start!.date}T12:00:00Z` : e.start!.dateTime!;
        return { id: e.id, title: (e.summary ?? "").trim().slice(0, 80) || "(no title)", start, allDay, tomorrow: (allDay ? e.start!.date! : dayOf(new Date(start))) !== today, place: (e.location ?? "").trim().slice(0, 80) };
      })
      // an all-day event that began before today is still "today"
      .map((e) => (e.allDay && e.start.slice(0, 10) < today ? { ...e, tomorrow: false } : e))
      .slice(0, 5);
    const value: Agenda = { calendar: true, events, did };
    this.agendaCache = { at: now.getTime(), day: today, value };
    return value;
  },

  /** The newest message's id (0 with none). */
  lastMessageId(): number {
    return this.db.get<{ id: number | null }>("SELECT MAX(id) AS id FROM messages")?.id ?? 0;
  },

  // ---------- chat ----------

  /** A chat's messages: channelId null is the main chat. */
  messages(channelId: number | null = null, before?: number, limit = 60): StoredMessage[] {
    return listMessages(this.db, channelId, Math.min(limit, 200), before);
  },

  async deleteMessage(id: number): Promise<void> {
    deleteMessage(this.db, id);
    await this.db.flush();
  },

  async pinMessage(id: number, pinned: boolean): Promise<StoredMessage> {
    const m = getMessage(this.db, id);
    if (!m) throw new Error("That message no longer exists.");
    const meta = { ...m.meta };
    if (pinned) meta.pinned = true;
    else delete meta.pinned;
    updateMessageMeta(this.db, id, meta);
    await this.db.flush();
    return { ...m, meta };
  },

  /** Thumbs up or down on one of Lyra's replies (null takes it back). Lyra learns from these. */
  async rateReply(id: number, rating: "up" | "down" | null, why?: string): Promise<StoredMessage> {
    const m = getMessage(this.db, id);
    if (!m) throw new Error("That message no longer exists.");
    if (m.role !== "assistant") throw new Error("Only Tomo's replies can be rated.");
    const meta = { ...m.meta };
    const reason = why?.replace(/\s+/g, " ").trim().slice(0, 200);
    if (rating) meta.feedback = { rating, ...(rating === "down" && reason ? { why: reason } : {}), at: new Date().toISOString() };
    else delete meta.feedback;
    updateMessageMeta(this.db, id, meta);
    await this.db.flush();
    return { ...m, meta };
  },

  pinned(channelId: number | null): StoredMessage[] {
    return pinnedMessages(this.db, channelId);
  },

  /** Undo a note shown under a chat message, or answer a held suggestion. */
  async note(messageId: number, index: number, action: "undo" | "accept" | "dismiss"): Promise<StoredMessage> {
    const msg = getMessage(this.db, messageId);
    const note = msg?.meta.memory?.[index];
    if (!msg || !note) throw new Error("That note is gone.");
    const book = await this.bookFor(note.notebook);
    if (!book.section(note.section)) throw new Error("That note is gone.");

    if (action === "undo" && !note.undone) {
      if (note.kind === "saved") {
        const r = await book.forget(note.section, note.text);
        if ("error" in r) throw new Error("That line was already changed.");
      } else if (note.kind === "removed") await book.remember(note.section, note.text);
      else throw new Error("Nothing to undo.");
      note.undone = true;
    } else if ((action === "accept" || action === "dismiss") && note.kind === "suggested" && note.suggestionId) {
      const r = await book.resolveSuggestion(note.suggestionId, action === "accept");
      note.kind = action === "accept" ? "saved" : "dismissed";
      note.text = r.text;
      if (r.snapshotId) note.snapshotId = r.snapshotId;
    } else throw new Error("Unknown action.");

    updateMessageMeta(this.db, msg.id, msg.meta);
    return getMessage(this.db, msg.id)!;
  },
});
