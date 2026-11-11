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
