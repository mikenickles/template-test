// Settings, Notifications: place reminders and leave-now nudges. Both use where the phone is,
// so they're the phone's to turn on, and Android asks first.
import { useCallback, useEffect, useState } from "react";
import type { PlaceReminder, SavedPlace } from "../../../core/places";
import { api, LEAVE_NOW } from "../api";
import { places } from "../platform";
import { ask, askText } from "../ask";

type Access = Awaited<ReturnType<typeof places.access>>;

export function PlacesSection({ toast }: { toast: (m: string) => void }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [waiting, setWaiting] = useState<PlaceReminder[]>([]);
  const [leaveNow, setLeaveNow] = useState(() => {
    try {
      return localStorage.getItem(LEAVE_NOW) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    void places.access().then(setAccess, () => setAccess("unavailable"));
    void api.places().then(setSaved, () => {});
    void api.placeReminders().then(setWaiting, () => {});
  }, []);
  useEffect(load, [load]);
  if (!places.available || access === null) return null;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      load();
    }
  };

  const accessText =
    access === "always"
      ? "All the time: place reminders work with Lyra closed."
      : access === "while-open"
        ? "Only while Lyra is open. Place reminders need “Allow all the time”."
        : "Off. Turn it on for place reminders and leave-now nudges.";

  return (
    <section className="section">
      <h2 className="section-label">Places and travel</h2>
      <div className="group">
        <div className="item">
          <span className="body">
            <div className="title">Location</div>
            <div className="sub">{accessText}</div>
          </span>
          {access !== "always" && (
            <button className="btn quiet" disabled={busy} onClick={() => void run(async () => setAccess(await places.allow(true)))}>
              Allow
            </button>
          )}
        </div>
        <label className="item">
          <span className="body">
            <div className="title">Tell me when to leave</div>
            <div className="sub">
              For events on your calendar with a place, in the next few hours: a nudge when it's time to go, with directions. Driving time from OpenStreetMap, without traffic, so there's a few minutes' margin.
            </div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={leaveNow}
            disabled={busy || access === "none"}
            onChange={(e) => {
              const on = e.target.checked;
              setLeaveNow(on);
              void run(() => api.setLeaveNow(on), on ? "Lyra will tell you when to leave" : "Leave-now nudges off");
            }}
          />
        </label>
      </div>

      <h3 className="section-label sub-label">Saved places</h3>
      <div className="group">
        {saved.map((p) => (
          <div className="item" key={p.name}>
            <span className="body">
              <div className="title">{p.name}</div>
              {p.label && <div className="sub">{p.label}</div>}
            </span>
            <button className="btn text" disabled={busy} onClick={() => void ask(`Forget “${p.name}”?`).then<unknown>((ok) => ok && run(() => api.forgetPlace(p.name), "Forgotten"))}>
              Forget
            </button>
          </div>
        ))}
        <button
          className="item"
          disabled={busy || access === "none"}
          onClick={async () => {
            const name = await askText("Save where you are now as…", { placeholder: "Home, Work, Rowan's school" });
            if (name) void run(() => api.savePlace(name), `Saved ${name}`);
          }}
        >
          <span className="body">
            <div className="title">Save where I am now</div>
            <div className="sub">Then say “remind me to call Mom when I get home”. Other places are looked up by name, near you.</div>
          </span>
        </button>
      </div>

      {waiting.length > 0 && (
        <>
          <h3 className="section-label sub-label">Place reminders waiting</h3>
          <div className="group">
            {waiting.map((r) => (
              <div className="item" key={r.id}>
                <span className="body">
                  <div className="title">{r.text}</div>
                  <div className="sub">{r.on_event === "leave" ? `When you leave ${r.place}` : `When you get to ${r.place}`}</div>
                </span>
                <button className="btn text" disabled={busy} onClick={() => void run(() => api.cancelPlaceReminder(r.id), "Cancelled")}>
                  Cancel
                </button>
              </div>
            ))}
          </div>
          {access !== "always" && <p className="hint">These go off only once location is allowed all the time.</p>}
        </>
      )}
    </section>
  );
}
