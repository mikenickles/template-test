/**
 * Place reminders ("remind me to grab milk when I get to Costco") and leave-now nudges.
 *
 * A place reminder is stored here and synced like everything else; the phone turns the pending
 * ones into Android geofences, which go off with Lyra closed and show the reminder themselves.
 * Leave-now works out, on the phone, when to leave for the next events that have a place:
 * where you are, the event's place, and the driving time (OpenStreetMap routing, no traffic).
 */
import type { DB } from "./db.ts";

export interface SavedPlace {
  name: string;
  lat: number;
  lng: number;
  label?: string;
}

export interface PlaceReminder {
  id: number;
  text: string;
  place: string;
  lat: number;
  lng: number;
  radius: number;
  on_event: "arrive" | "leave";
  status: "pending" | "done" | "cancelled";
  channel_id: number | null;
  created_at: string;
  fired_at: string | null;
}

export const PLACE_MIGRATION = `CREATE TABLE place_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  place TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius REAL NOT NULL DEFAULT 150,
  on_event TEXT NOT NULL DEFAULT 'arrive' CHECK (on_event IN ('arrive','leave')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  channel_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  fired_at TEXT
);`;

const one = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Saved places ("Home", "Work", "Rowan's school"), by name. */
export function savedPlaces(raw: string | undefined): SavedPlace[] {
  try {
    const list = JSON.parse(raw ?? "[]") as SavedPlace[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  } catch {
    return [];
  }
}

/** A saved place that matches what the user said ("home", "the office" for "Work" won't: names must match). */
export function matchPlace(list: SavedPlace[], name: string): SavedPlace | undefined {
  const n = name.trim().toLowerCase().replace(/^(my|the)\s+/, "");
  return list.find((p) => p.name.toLowerCase() === n) ?? list.find((p) => p.name.toLowerCase().replace(/^(my|the)\s+/, "") === n);
}

export function addPlaceReminder(db: DB, r: { text: unknown; place: string; lat: number; lng: number; on: "arrive" | "leave"; channelId: number | null; radius?: number }): PlaceReminder {
  const text = one(r.text, 200);
  if (!text) throw new Error("Say what to remind them of.");
  if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng) || Math.abs(r.lat) > 90 || Math.abs(r.lng) > 180) throw new Error("That place has no usable location.");
  const open = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM place_reminders WHERE status = 'pending'")!.n;
  if (open >= 90) throw new Error("There are too many place reminders waiting (Android allows about 100). Cancel some first.");
  const row = db.run<{ id: number }>(
    "INSERT INTO place_reminders (text, place, lat, lng, radius, on_event, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [text, one(r.place, 80), r.lat, r.lng, Math.max(100, Math.min(1000, r.radius ?? 150)), r.on, r.channelId],
  )!;
  return db.get<PlaceReminder>("SELECT * FROM place_reminders WHERE id = ?", [row.id])!;
}

export function pendingPlaceReminders(db: DB): PlaceReminder[] {
  return db.all<PlaceReminder>("SELECT * FROM place_reminders WHERE status = 'pending' ORDER BY id");
}

/** Went off on the phone: done, once. Returns the ones that were still pending. */
export function firePlaceReminders(db: DB, ids: number[]): PlaceReminder[] {
  const out: PlaceReminder[] = [];
  for (const id of ids) {
    const r = db.get<PlaceReminder>("SELECT * FROM place_reminders WHERE id = ? AND status = 'pending'", [id]);
    if (!r) continue;
    db.run("UPDATE place_reminders SET status = 'done', fired_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [id]);
    out.push(r);
  }
  return out;
}

export function cancelPlaceReminder(db: DB, id: number): PlaceReminder {
  const r = db.get<PlaceReminder>("SELECT * FROM place_reminders WHERE id = ? AND status = 'pending'", [id]);
  if (!r) throw new Error(`There's no place reminder #p${id} waiting.`);
  db.run("UPDATE place_reminders SET status = 'cancelled' WHERE id = ?", [id]);
  return r;
}

/** For Lyra's instructions: one line each. */
export function describePlaceReminders(list: PlaceReminder[]): string {
  return list.map((r) => `- #p${r.id} ${r.on_event === "leave" ? "when leaving" : "on arriving at"} ${r.place}: ${r.text}`).join("\n");
}

// ---------- leave now ----------

export interface Trip {
  /** the calendar event's id */
  id: string;
  title: string;
  /** where, as written in the event */
  place: string;
  /** when it starts */
  start: string;
}

/** Events with a place in the next few hours (not all-day, not online-only, not cancelled). */
export function tripsFrom(events: { id: string; status?: string; summary?: string; location?: string; start?: { date?: string; dateTime?: string } }[], now: Date, hours = 6): Trip[] {
  const until = now.getTime() + hours * 3600_000;
  return events
    .filter((e) => e.status !== "cancelled" && e.start?.dateTime && e.location?.trim())
    .filter((e) => !/^(https?:\/\/|zoom|google meet|teams|microsoft teams|online|virtual|phone|call)\b/i.test(e.location!.trim()))
    .map((e) => ({ id: e.id, title: one(e.summary || "Event", 80), place: one(e.location, 200), start: new Date(e.start!.dateTime!).toISOString() }))
    .filter((t) => {
      const at = new Date(t.start).getTime();
      return at > now.getTime() && at <= until;
    });
}

/**
 * When to leave: the drive, plus a margin (10 minutes, or 15 for anything over half an hour).
 * Null when it's too close to bother, or the place is right where you are.
 */
export function leaveAt(start: string, driveSeconds: number): Date | null {
  if (!Number.isFinite(driveSeconds) || driveSeconds < 5 * 60) return null;
  const margin = driveSeconds > 30 * 60 ? 15 * 60 : 10 * 60;
  return new Date(new Date(start).getTime() - (driveSeconds + margin) * 1000);
}

/** OpenStreetMap's driving time between two points (OSRM's public server; no traffic). */
export async function driveSeconds(from: { lat: number; lng: number }, to: { lat: number; lng: number }, fetchFn: typeof fetch): Promise<number | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  try {
    const r = await fetchFn(url);
    if (!r.ok) return null;
    const j = (await r.json()) as { code?: string; routes?: { duration?: number }[] };
    const d = j.routes?.[0]?.duration;
    return j.code === "Ok" && typeof d === "number" ? d : null;
  } catch {
    return null;
  }
}

/** A link that opens directions there in Google Maps (the app if it's installed). */
export function directionsLink(to: { lat: number; lng: number } | string): string {
  const dest = typeof to === "string" ? encodeURIComponent(to) : `${to.lat},${to.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}
