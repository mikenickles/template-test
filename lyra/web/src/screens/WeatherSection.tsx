import { useState } from "react";
import type { WeatherPlace } from "../../../core/lyra";
import { api, type AppState } from "../api";
import { findPlace } from "../weather";

/** Settings: where the weather under Lyra's avatar is for. Off until you pick a place. */
export function WeatherSection({ state, setState, toast }: { state: AppState; setState: (s: AppState) => void; toast: (m: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherPlace[] | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const r = await findPlace(query);
      setResults(r);
      if (!r.length) toast("Couldn't find that place. Try just the city name.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (place: WeatherPlace | null) => {
    try {
      setState(await api.saveSettings({ weatherPlace: place }));
      setResults(null);
      setQuery("");
      toast(place ? `Weather for ${place.name}` : "Weather off");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className="section">
      <h2 className="section-label">Weather</h2>
      {state.weatherPlace ? (
        <div className="group">
          <div className="item">
            <span className="body">
              <div className="title">{state.weatherPlace.name}</div>
              <div className="sub">Shown under Lyra's avatar, now and then.</div>
            </span>
            <button className="btn quiet" onClick={() => void pick(null)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <>
          <form
            className="field-row"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input className="field" aria-label="Your city" placeholder="Your city, like Boston" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn ink" disabled={busy || !query.trim()}>
              Find
            </button>
          </form>
          {results && results.length > 0 && (
            <div className="group" style={{ marginTop: 12 }}>
              {results.map((p) => (
                <button key={`${p.latitude},${p.longitude}`} className="item" onClick={() => void pick(p)}>
                  <span className="body">
                    <div className="title">{p.name}</div>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <p className="hint">From Open-Meteo, a free weather service. Only the city's map position is sent, nothing about you.</p>
    </section>
  );
}
