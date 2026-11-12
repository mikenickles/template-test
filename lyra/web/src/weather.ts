/**
 * Weather for Lyra's status line, from Open-Meteo (free, no account, no key).
 * Only the place's coordinates are sent. Results are kept for 30 minutes.
 */
import type { WeatherPlace } from "../../core/lyra";

export interface Weather {
  temp: number;
  unit: "F" | "C";
  text: string;
  icon: string;
}

/** WMO weather codes, as Open-Meteo reports them. */
export function describeWeather(code: number, isDay = true): { text: string; icon: string } {
  if (code === 0) return { text: isDay ? "Sunny" : "Clear", icon: isDay ? "☀️" : "🌙" };
  if (code <= 2) return { text: "Partly cloudy", icon: isDay ? "⛅" : "☁️" };
  if (code === 3) return { text: "Cloudy", icon: "☁️" };
  if (code === 45 || code === 48) return { text: "Foggy", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { text: "Drizzle", icon: "🌦️" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { text: "Rain", icon: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: "Snow", icon: "❄️" };
  if (code >= 95) return { text: "Storms", icon: "⛈️" };
  return { text: "Mixed", icon: "🌤️" };
}

/** Fahrenheit where people use it, Celsius everywhere else. */
export function preferredUnit(locale = navigator.language): "F" | "C" {
  return /^en-(US|LR|MM)$|^(my|ee)\b/i.test(locale) || /-(US|BS|BZ|KY|PW|LR)$/i.test(locale) ? "F" : "C";
}

let cache: { key: string; at: number; value: Weather } | null = null;

export async function currentWeather(place: WeatherPlace, unit = preferredUnit()): Promise<Weather> {
  const key = `${place.latitude},${place.longitude},${unit}`;
  if (cache && cache.key === key && Date.now() - cache.at < 30 * 60_000) return cache.value;
  const q = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,weather_code,is_day",
    temperature_unit: unit === "F" ? "fahrenheit" : "celsius",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error(`Weather service said ${r.status}`);
  const j = (await r.json()) as { current: { temperature_2m: number; weather_code: number; is_day: number } };
  const d = describeWeather(j.current.weather_code, j.current.is_day === 1);
  const value = { temp: Math.round(j.current.temperature_2m), unit, ...d };
  cache = { key, at: Date.now(), value };
  return value;
}

/** Look a city up by name ("Boston" or "Boston, MA"). */
export async function findPlace(query: string): Promise<WeatherPlace[]> {
  const name = query.split(",")[0].trim();
  if (!name) return [];
  const q = new URLSearchParams({ name, count: "5", language: "en", format: "json" });
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  if (!r.ok) throw new Error("Couldn't look that place up.");
  const j = (await r.json()) as { results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }[] };
  const hint = query.split(",").slice(1).join(",").trim().toLowerCase();
  const all = (j.results ?? []).map((p) => ({
    name: [p.name, p.admin1, p.country_code === "US" ? undefined : p.country_code].filter(Boolean).join(", "),
    latitude: p.latitude,
    longitude: p.longitude,
  }));
  // "Portland, OR" puts Oregon first
  return hint ? [...all.filter((p) => p.name.toLowerCase().includes(hint)), ...all.filter((p) => !p.name.toLowerCase().includes(hint))] : all;
}
