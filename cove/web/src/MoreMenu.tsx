import { useEffect, useState } from "react";
import { More } from "./icons";

export interface MoreItem {
  label: string;
  onClick: () => void;
  /** shown in red (Delete) */
  bad?: boolean;
  disabled?: boolean;
}

/**
 * (0.54) The "⋯" button at the end of a row of actions: the main one or two stay as buttons,
 * the rest open in the same bottom sheet as a message's actions, so a row never wraps.
 */
export function MoreMenu({ items, label = "More actions" }: { items: MoreItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <>
      <button type="button" className="btn quiet more-btn" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <More size={20} />
      </button>
      {open && (
        <div className="dialog-layer sheet-layer" role="presentation">
          <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
            <div className="group">
              {shown.map((i, n) => (
                <button
                  key={i.label}
                  className="item"
                  disabled={i.disabled}
                  autoFocus={n === 0}
                  onClick={() => {
                    setOpen(false);
                    i.onClick();
                  }}
                >
                  <span className="body">
                    <div className={`title${i.bad ? " bad" : ""}`}>{i.label}</div>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
