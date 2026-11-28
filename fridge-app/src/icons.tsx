import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number; color?: string; w?: number };
const base = ({ size = 22, color = 'currentColor', w = 1.75, ...rest }: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: w,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...rest
});

export const IHome = (p: P) => <svg {...base(p)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>;
export const IFridge = (p: P) => <svg {...base(p)}><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M5 10h14M9 6v1.5M9 13.5v3" /></svg>;
export const ICalendar = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export const ITasks = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>;
export const IFood = (p: P) => <svg {...base(p)}><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.2 0-4 2.5-4 6v4h4" /></svg>;
export const IBag = (p: P) => <svg {...base(p)}><path d="M5 7h14l-1.3 11.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>;
export const IPlus = (p: P) => <svg {...base({ w: 2.2, ...p })}><path d="M12 5v14M5 12h14" /></svg>;
export const IClose = (p: P) => <svg {...base({ w: 2, ...p })}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IWave = (p: P) => <svg {...base({ w: 2.3, ...p })}><path d="M4 9.5v5M8 6.5v11M12 3.5v17M16 7.5v9M20 10v4" /></svg>;
export const IChevL = (p: P) => <svg {...base({ w: 2, ...p })}><path d="m15 18-6-6 6-6" /></svg>;
export const IChevR = (p: P) => <svg {...base({ w: 2, ...p })}><path d="m9 18 6-6-6-6" /></svg>;
export const ITrash = (p: P) => <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const ISpark = (p: P) => <svg {...base({ w: 1.9, ...p })}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>;
export const ICheck = (p: P) => <svg {...base({ w: 2.6, ...p })}><path d="m5 12 5 5 9-10" /></svg>;
export const ISend = (p: P) => <svg {...base({ w: 2, ...p })}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IKeyboard = (p: P) => <svg {...base(p)}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>;
export const IMic = (p: P) => <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const ISun = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const IBox = (p: P) => <svg {...base(p)}><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>;
