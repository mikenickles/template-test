/** Saved places, place reminders, trips and place triggers. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { googleGet } from "../connectors/google-http.ts";
import * as A from "../actions.ts";
import * as PL from "../places.ts";
import { getSetting, addMessage, setSetting } from "../db.ts";
import { type Reminder } from "../reminders.ts";
import * as R from "../routines.ts";
import { PLACE_TRIGGER_BASE } from "./shared.ts";
import { part } from "./part.ts";

export const places = part({
  // ---------- places ----------

  /** Saved places (Home, Work…), synced; set from Settings with "save where I am now". */
  places(): PL.SavedPlace[] {
    return PL.savedPlaces(getSetting(this.db, "places"));
  },

  async savePlace(name: string, at?: { lat: number; lng: number; label?: string }): Promise<PL.SavedPlace[]> {
    const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!n) throw new Error("Give the place a name.");
    let where = at;
    if (!where) {
      if (!this.p.places || (await this.p.places.access()) === "none") throw new Error("Allow location first, so Tomo can tell where you are.");
      where = await this.p.places.here();
    }
    const list = this.places().filter((p) => p.name.toLowerCase() !== n.toLowerCase());
    list.push({ name: n, lat: where.lat, lng: where.lng, ...(where.label ? { label: where.label } : {}) });
    setSetting(this.db, "places", JSON.stringify(list.slice(-20)));
    await this.db.flush();
    return this.places();
  },

  async forgetPlace(name: string): Promise<PL.SavedPlace[]> {
    setSetting(this.db, "places", JSON.stringify(this.places().filter((p) => p.name !== name)));
    await this.db.flush();
    return this.places();
  },

  /** A reminder for arriving at (or leaving) a place: a saved one, or one found by name near where you are. */
  async remindAtPlace(text: string, place: string, on: "arrive" | "leave", channelId: number | null): Promise<PL.PlaceReminder> {
    const saved = PL.matchPlace(this.places(), place);
    let where: { lat: number; lng: number; label: string } | undefined = saved && { lat: saved.lat, lng: saved.lng, label: saved.name };
    if (!where) {
      if (!this.p.places) throw new Error(`"${place}" isn't a saved place, and looking places up works on the phone. Save it there first (Settings, Notifications, Places), or ask on the phone.`);
      if ((await this.p.places.access()) === "none") throw new Error("Location isn't allowed on this phone. Ask the user to turn on place reminders in Settings, Notifications, Places.");
      const near = await this.p.places.here().catch(() => undefined);
      const found = await this.p.places.find(place, near);
      if (!found.length) throw new Error(`Couldn't find "${place}". Ask for an address, or the user can save it as a place in Settings.`);
      where = { lat: found[0].lat, lng: found[0].lng, label: found[0].label ? `${place} (${found[0].label.split(",").slice(0, 2).join(",")})` : place };
    }
    const r = PL.addPlaceReminder(this.db, { text, place: where.label, lat: where.lat, lng: where.lng, on, channelId });
    this.listeners.forEach((l) => l({ type: "reminder" }));
    await this.db.flush();
    return r;
  },

  placeReminders(): PL.PlaceReminder[] {
    return PL.pendingPlaceReminders(this.db);
  },

  async cancelPlaceReminder(id: number): Promise<void> {
    PL.cancelPlaceReminder(this.db, id);
    this.listeners.forEach((l) => l({ type: "reminder" }));
    await this.db.flush();
  },

  /** The phone's geofences went off (it already showed them): mark them done and say so in the chat. */
  async placeRemindersFired(ids: number[]): Promise<void> {
    const fired = PL.firePlaceReminders(this.db, ids);
    for (const r of fired) addMessage(this.db, "assistant", `Reminder${r.on_event === "leave" ? `, leaving ${r.place}` : ` at ${r.place}`}: ${r.text}`, { placeReminder: { id: r.id, place: r.place } }, r.channel_id);
    if (!fired.length) return;
    this.listeners.forEach((l) => l({ type: "reminder" }));
    this.listeners.forEach((l) => l({ type: "message", channelId: null }));
    await this.db.flush();
  },

  /** Events with a place in the next few hours, for leave-now (needs Calendar). */
  async upcomingTrips(now = new Date(), hours = 6): Promise<PL.Trip[]> {
    if (!this.connectors.status().some((c) => c.id === "calendar" && c.state === "connected")) return [];
    const g = googleGet("https://www.googleapis.com/calendar/v3", "Google Calendar", this.tokenFor("calendar"), this.fetch);
    const r = await g.json<{ items?: { id: string; status?: string; summary?: string; location?: string; start?: { date?: string; dateTime?: string } }[] }>("/calendars/primary/events", {
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + hours * 3600_000).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });
    return PL.tripsFrom(r.items ?? [], now, hours);
  },

  /** Place triggers as fences for the phone to watch (ids from 100000, so they never meet a place reminder's). */
  placeTriggers(): { id: number; text: string; place: string; lat: number; lng: number; radius: number; on: "arrive" | "leave" }[] {
    const saved = this.places();
    return this.triggered("place").flatMap(({ r, t }) => {
      const pt = t as Extract<R.Trigger, { kind: "place" }>;
      const p = PL.matchPlace(saved, pt.place);
      return p ? [{ id: PLACE_TRIGGER_BASE + r.id, text: `Tomo is on it: ${r.name}`, place: p.name, lat: p.lat, lng: p.lng, radius: 150, on: pt.on }] : [];
    });
  },

  /** The phone crossed a place trigger's fence: start those routines. */
  placeTriggersFired(ids: number[]): void {
    for (const id of ids) {
      const hit = this.triggered("place").find((x) => x.r.id === id - PLACE_TRIGGER_BASE);
      if (!hit) continue;
      const t = hit.t as Extract<R.Trigger, { kind: "place" }>;
      this.routinesRunner.runNow(hit.r.id, t.on === "leave" ? `The user just left ${t.place}.` : `The user just arrived at ${t.place}.`);
    }
  },
});
