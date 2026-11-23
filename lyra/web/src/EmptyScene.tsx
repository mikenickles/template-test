// (0.62) Empty pages with a moment: Tomo napping on an empty task list, reading on an empty
// shelf, stargazing on a quiet activity log, looking around with a magnifier, or waving hello.
// Drawn like the face (the Kit body in the accent); the motion stops with Gentle motion off.

import tomoStill from "./assets/tomo-idle.webp";

export type Pose = "nap" | "read" | "stars" | "look" | "wave";

/** Ask Tomo something in the main chat, as if you'd typed it. */
export function askTomo(say: string) {
  sessionStorage.setItem("lyra.say", JSON.stringify({ hash: "#/", say, at: Date.now() }));
  if (location.hash !== "#/") location.hash = "#/";
  dispatchEvent(new Event("lyra:say"));
}

function Scene({ pose }: { pose: Pose }) {
  return (
    <svg className={`es es-${pose}`} viewBox="0 0 120 100" aria-hidden="true">
      <ellipse className="es-shadow" cx="60" cy="90" rx="24" ry="2.8" />
      {pose === "stars" && (
        <g className="es-sky">
          <path className="tw" d="M86 18 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 l4 -1.6z" />
          <path className="tw" d="M100 36 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2 l3 -1.2z" />
          <circle className="tw" cx="70" cy="12" r="1.6" />
          <circle className="tw" cx="104" cy="16" r="1.3" />
        </g>
      )}
      <defs>
        <clipPath id={`es-clip-${pose}`}>
          <circle cx="60" cy="56" r="30" />
        </clipPath>
      </defs>
      <g className="es-body">
        <g clipPath={`url(#es-clip-${pose})`}>
          <rect x="30" y="26" width="60" height="60" fill="#fcfcfc" />
          <image href={tomoStill} x="20" y="12" width="80" height="80" preserveAspectRatio="xMidYMid slice" />
        </g>
        <circle cx="60" cy="56" r="30" className="es-ring" />
      </g>
      {pose === "nap" && (
        <g className="es-z">
          <text x="84" y="34">z</text>
          <text x="92" y="24">z</text>
        </g>
      )}
      {pose === "read" && (
        <g className="es-book">
          <path d="M40 72 Q51 66 60 72 L60 90 Q51 84 40 90 Z" />
          <path d="M60 72 Q69 66 80 72 L80 90 Q69 84 60 90 Z" />
          <path className="es-page" d="M60 72 Q69 66 80 72 L80 90 Q69 84 60 90 Z" />
        </g>
      )}
      {pose === "look" && (
        <g className="es-glass">
          <circle cx="84" cy="58" r="9" />
          <path d="M90.5 64.5 L98 72" />
        </g>
      )}
    </svg>
  );
}

export function EmptyScene({ pose, title, text, action }: { pose: Pose; title: string; text?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="empty-scene">
      <Scene pose={pose} />
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action && (
        <button type="button" className="btn quiet" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
