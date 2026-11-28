export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
export const todayKey = () => dateKey(today());
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a: Date, b: Date) => dateKey(a) === dateKey(b);
/** Monday of the week containing d. */
export const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export function fmtTime(t: string) {
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + (m ? ':' + pad(m) : '') + ' ' + ap;
}

export function shortDate(d: Date) {
  return DOW_LONG[d.getDay()].slice(0, 3) + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
}

export function relativeLabel(d: Date) {
  const t = today();
  if (sameDay(d, t)) return 'Today';
  if (sameDay(d, addDays(t, 1))) return 'Tomorrow';
  return shortDate(d);
}

export function greeting(h = new Date().getHours()) {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

export const minutesNow = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
export const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
