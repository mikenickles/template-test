// (0.63) Small marks for each connection in the services' own colors, for the connections list.
// Simple drawings that point at the service; they're not the services' official artwork.
import type { ReactNode } from "react";

const svg = (body: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    {body}
  </svg>
);

export const BRAND: Record<string, ReactNode> = {
  gmail: svg(
    <>
      <path d="M3 7.5v10A1.5 1.5 0 004.5 19H7v-8l5 3.8 5-3.8v8h2.5a1.5 1.5 0 001.5-1.5v-10a1.8 1.8 0 00-2.9-1.4L12 10 5.9 6.1A1.8 1.8 0 003 7.5z" fill="#EA4335" />
      <path d="M3 7.5V9l4 3V19H4.5A1.5 1.5 0 013 17.5z" fill="#4285F4" />
      <path d="M21 7.5V9l-4 3v7h2.5a1.5 1.5 0 001.5-1.5z" fill="#34A853" />
      <path d="M17 11.9l4-3V7.5a1.8 1.8 0 00-2.9-1.4L17 7z" fill="#FBBC04" />
    </>,
  ),
  calendar: svg(
    <>
      <rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="1.6" />
      <rect x="3" y="4" width="18" height="4.5" rx="2" fill="#4285F4" />
      <text x="12" y="18.3" textAnchor="middle" fontSize="8.5" fontWeight="700" fontFamily="Inter, sans-serif" fill="#1a73e8">
        31
      </text>
    </>,
  ),
  drive: svg(
    <>
      <path d="M8.6 3.5h6.8l6.3 11h-6.8z" fill="#FBBC04" />
      <path d="M8.6 3.5L2.3 14.5l3.4 6 6.3-11z" fill="#34A853" />
      <path d="M5.7 20.5h12.6l3.4-6H8.9z" fill="#4285F4" />
    </>,
  ),
  spotify: svg(
    <>
      <circle cx="12" cy="12" r="10" fill="#1DB954" />
      <path d="M6.8 9.4c3.6-1.1 7.6-.8 10.8 1M7.4 12.6c3-.9 6.2-.6 8.9.9M8 15.6c2.4-.6 4.8-.4 6.9.7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>,
  ),
  bank: svg(
    <>
      <path d="M12 3l9 5H3z" fill="#2f9e5b" />
      <path d="M5 10v7M9.7 10v7M14.3 10v7M19 10v7" stroke="#2f9e5b" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="18.5" width="18" height="2.5" rx="1" fill="#2f9e5b" />
    </>,
  ),
  ynab: svg(
    <>
      <circle cx="12" cy="12" r="10" fill="#1E3A8A" />
      <path d="M8 7.5l4 5 4-5M12 12.5V17" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>,
  ),
  contacts: svg(
    <>
      <circle cx="12" cy="12" r="10" fill="#1a73e8" />
      <circle cx="12" cy="10" r="3.2" fill="#fff" />
      <path d="M6.5 17.5c1.4-2.3 3.3-3.3 5.5-3.3s4.1 1 5.5 3.3" fill="#fff" />
    </>,
  ),
  notices: svg(
    <>
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" fill="#f2a43a" />
      <path d="M10 20a2 2 0 004 0" stroke="#f2a43a" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>,
  ),
  browser: svg(
    <>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="#5f6bd8" strokeWidth="1.8" />
      <path d="M2.5 12h19M12 2.5c3 3.2 3 15.8 0 19M12 2.5c-3 3.2-3 15.8 0 19" stroke="#5f6bd8" strokeWidth="1.5" fill="none" />
    </>,
  ),
  google: svg(
    <>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.87 3c2.26-2.09 3.55-5.17 3.55-8.82z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29l-4-3.1C.46 8.24 0 10.06 0 12s.46 3.76 1.28 5.39l3.99-3.1z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96l-4 3.1C3.26 21.31 7.31 24 12 24z" />
    </>,
  ),
};
