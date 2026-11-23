import { useRef } from "react";
import { intentChip, type Intent } from "../../core/intent";
import { haptic } from "./haptics";

const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * (0.62) A quiet chip over the composer with what Tomo is about to do: a reminder at the time
 * it read, a new task, a look at your calendar. On a reminder, tap it to pick another time.
 */
export function IntentChip({ intent, onTime }: { intent: Intent; onTime: (d: Date | null) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const { title, sub } = intentChip(intent);
  const reminder = intent.kind === "reminder";
  const icon =
    intent.kind === "reminder" ? (
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0" />
    ) : intent.kind === "task" ? (
      <path d="M5 12.5l4 4L19 7" />
    ) : (
      <path d="M5 6h14v13H5zM5 10h14M9 4v4M15 4v4" />
    );
  const open = () => {
    const el = picker.current;
    if (!el) return;
    haptic.select();
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <div className={`intent-chip${reminder ? " can-edit" : ""}`} role="status" aria-live="polite">
      <button type="button" className="intent-chip-btn" onClick={reminder ? open : undefined} tabIndex={reminder ? 0 : -1} aria-label={reminder ? `${title}. ${sub}. Pick another time` : `${title}. ${sub}`}>
        <span className="intent-ic" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </span>
        <span className="intent-words">
          <span className="intent-title">{title}</span>
          <span className="intent-sub">{sub}</span>
        </span>
      </button>
      {reminder && (
        <input
          ref={picker}
          className="intent-picker"
          type="datetime-local"
          tabIndex={-1}
          aria-hidden="true"
          value={intent.at ? local(intent.at) : ""}
          onChange={(e) => {
            const d = e.target.value ? new Date(e.target.value) : null;
            onTime(d && !isNaN(+d) ? d : null);
          }}
        />
      )}
    </div>
  );
}
