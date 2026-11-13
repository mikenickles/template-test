import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 22, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Back = (p: P) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const Chevron = (p: P) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);
export const ArrowUp = (p: P) => (
  <Icon {...p}>
    <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
  </Icon>
);
export const ArrowDown = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" />
  </Icon>
);
export const Stop = (p: P) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);
export const Mail = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </Icon>
);
export const Calendar = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);
export const File = (p: P) => (
  <Icon {...p}>
    <path d="M14 3H7.5A2.5 2.5 0 005 5.5v13A2.5 2.5 0 007.5 21h9a2.5 2.5 0 002.5-2.5V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);
export const Notebook = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="3" width="15" height="18" rx="2.5" />
    <path d="M9 3v18M12.5 8h4M12.5 12h4" />
  </Icon>
);
export const Plus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const Check = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const Minus = (p: P) => (
  <Icon {...p}>
    <path d="M6 12h12" />
  </Icon>
);
export const Pin = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18.4l.9-5.4-3.9-3.8 5.4-.8z" />
  </Icon>
);
export const ThumbUp = (p: P) => (
  <Icon {...p}>
    <path d="M7.5 10.5v9h-3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
    <path d="M7.5 10.5l3.6-6.3a1.6 1.6 0 0 1 2.9 1.2l-.8 3.6h5a2 2 0 0 1 2 2.4l-1.3 6.4a2 2 0 0 1-2 1.7H7.5" />
  </Icon>
);
export const ThumbDown = (p: P) => <ThumbUp {...p} style={{ transform: "rotate(180deg)", ...p.style }} />;
export const Inbox = (p: P) => (
  <Icon {...p}>
    <path d="M4 13.5l2.2-7.1A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.9 1.4l2.2 7.1V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" />
    <path d="M4 13.5h4.5l1 2h5l1-2H20" />
  </Icon>
);
export const Pulse = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />
  </Icon>
);
export const Bulb = (p: P) => (
  <Icon {...p}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </Icon>
);
export const Shield = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.3z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);
export const People = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="3.2" />
    <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
    <circle cx="17" cy="10" r="2.4" />
    <path d="M15.5 14.8c2.3.1 4 1.4 4.6 3.7" />
  </Icon>
);
export const Cpu = (p: P) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9.5 9.5h5v5h-5zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
  </Icon>
);
export const Clock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const ArrowUpRight = (p: P) => (
  <Icon {...p}>
    <path d="M7 17L17 7M8.5 7H17v8.5" />
  </Icon>
);
export const Spark = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5z" />
  </Icon>
);
export const MenuIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h10M4 17h13" />
  </Icon>
);
export const Pencil = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 5.5l4 4M4 20l1-5L15.5 4.5a2.1 2.1 0 013 0l1 1a2.1 2.1 0 010 3L9 19z" />
  </Icon>
);
export const Trash = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 008.5 21h7a1.5 1.5 0 001.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
  </Icon>
);
export const Layers = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
  </Icon>
);

/** Channel icons: one stroke weight, sized to the text. Keys match core/chat.ts CHANNEL_ICONS. */
const CHANNEL_PATHS: Record<string, JSX_Paths> = {
  home: ["M4 11l8-6.5 8 6.5", "M6 9.5V20h12V9.5", "M10 20v-5h4v5"],
  sprout: ["M12 20v-8", "M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z", "M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"],
  game: ["M7 9h10a4 4 0 014 4v1.5a3 3 0 01-5.3 1.9L14.5 15h-5l-1.2 1.4A3 3 0 013 14.5V13a4 4 0 014-4z", "M8 11.5v3M6.5 13h3", "M15.5 12.5h.01M17.5 14h.01"],
  heart: ["M12 19.5s-7.5-4.5-7.5-10A4 4 0 0112 7a4 4 0 017.5 2.5c0 5.5-7.5 10-7.5 10z"],
  work: ["M4 8.5h16v10.5H4z", "M9 8.5V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v2.5", "M4 13h16"],
  travel: ["M3 14.5l18-6.5-6.5 13-2.5-6.5z", "M12 14.5L21 8"],
  tools: ["M14.5 5.5a4 4 0 00-5 5L4 16l4 4 5.5-5.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z"],
  book: ["M5 4.5h10.5A3.5 3.5 0 0119 8v11.5H8.5A3.5 3.5 0 015 16z", "M5 16a3.5 3.5 0 013.5-3.5H19"],
  money: ["M4 7h16v10H4z", "M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z", "M7 12h.01M17 12h.01"],
  star: ["M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18.4l.9-5.4-3.9-3.8 5.4-.8z"],
};
type JSX_Paths = string[];

export const CHANNEL_ICON_NAMES = Object.keys(CHANNEL_PATHS);

export function ChannelIcon({ name, ...p }: P & { name: string }) {
  const paths = CHANNEL_PATHS[name] ?? CHANNEL_PATHS.star;
  return (
    <Icon {...p}>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </Icon>
  );
}
export const ChatIcon = (p: P) => (
  <Icon {...p}>
    <path d="M20 11.5a7.5 7.5 0 01-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1120 11.5z" />
  </Icon>
);
export const TasksIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 6.5l1.8 1.8L9 5M4 15.5l1.8 1.8L9 14M12.5 7h7.5M12.5 16h7.5" />
  </Icon>
);
export const Search = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Icon>
);
export const Close = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const CheckCircle = ({ done, ...p }: P & { done?: boolean }) => (
  <Icon {...p}>
    {done ? (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
        <path d="M8 12.3l2.7 2.7L16 9.6" stroke="var(--accent-ink)" strokeWidth={2.2} />
      </>
    ) : (
      <circle cx="12" cy="12" r="9" />
    )}
  </Icon>
);

export const Gear = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);

export const Info = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);

export const More = (p: P) => (
  <Icon {...p}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={2.6} />
  </Icon>
);

export const User = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </Icon>
);

export const Bell = (p: P) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Icon>
);

export const Cloud = (p: P) => (
  <Icon {...p}>
    <path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 10.5a3.75 3.75 0 0 1-.5 7.5z" />
  </Icon>
);

export const Refresh = (p: P) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </Icon>
);

export const Plug = (p: P) => (
  <Icon {...p}>
    <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" />
  </Icon>
);

export const Chart = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h16M7 20v-6M12 20V6M17 20v-9" strokeWidth={2.2} />
  </Icon>
);

export const Mic = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Icon>
);

export const Wave = (p: P) => (
  <Icon {...p}>
    <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4" strokeWidth={2.2} />
  </Icon>
);

/** Lyra's four-point star (Vega), filled. */
export const Star = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M12 2c.8 6.3 3.7 9.2 10 10-6.3.8-9.2 3.7-10 10-.8-6.3-3.7-9.2-10-10 6.3-.8 9.2-3.7 10-10z" />
  </Icon>
);

export const Music = (p: P) => (
  <Icon {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Icon>
);
