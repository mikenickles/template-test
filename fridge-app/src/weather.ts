import { Geolocation } from '@capacitor/geolocation';
import { useEffect, useState } from 'react';

export interface Weather { temp: number; label: string; hi: number; lo: number; days: { day: string; hi: number; label: string }[]; }

const CACHE = 'family-fridge:weather';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function codeLabel(c: number) {
  if (c === 0) return 'Clear';
  if (c <= 2) return 'Sunny';
  if (c === 3) return 'Cloudy';
  if (c <= 48) return 'Fog';
  if (c <= 57) return 'Drizzle';
  if (c <= 67) return 'Rain';
  if (c <= 77) return 'Snow';
  if (c <= 82) return 'Showers';
  if (c <= 86) return 'Snow';
  return 'Storms';
}

async function fetchWeather(units: 'F' | 'C'): Promise<Weather> {
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 3600000 });
  const { latitude, longitude } = pos.coords;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude.toFixed(3) + '&longitude=' + longitude.toFixed(3) +
    '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=' + (units === 'C' ? 'celsius' : 'fahrenheit') + '&timezone=auto&forecast_days=5';
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json();
  const days = (j.daily.time as string[]).slice(1, 5).map((t, i) => {
    const [y, m, d] = t.split('-').map(Number);
    return { day: DOW[new Date(y, m - 1, d).getDay()], hi: Math.round(j.daily.temperature_2m_max[i + 1]), label: codeLabel(j.daily.weather_code[i + 1]) };
  });
  return {
    temp: Math.round(j.current.temperature_2m), label: codeLabel(j.current.weather_code),
    hi: Math.round(j.daily.temperature_2m_max[0]), lo: Math.round(j.daily.temperature_2m_min[0]), days
  };
}

interface Cached { at: number; units: 'F' | 'C'; w: Weather; }
function readCache(units: 'F' | 'C'): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null') as Cached | null;
    return c && c.units === units ? c : null;
  } catch { return null; }
}

/** Weather for the current location, cached for 30 minutes. Off when `enabled` is false. */
export function useWeather(enabled = true, units: 'F' | 'C' = 'F') {
  const [w, setW] = useState<Weather | null>(() => readCache(units)?.w ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const cached = readCache(units);
    setW(cached?.w ?? null);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return;
    fetchWeather(units).then((nw) => {
      if (!alive) return;
      setW(nw);
      try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), units, w: nw })); } catch { /* ignore */ }
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [enabled, units]);
  return { weather: enabled ? w : null, failed };
}
