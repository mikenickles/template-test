// A widget under Lyra's reply (0.48): choices to tap, a checklist to tick, or a place with
// Directions and Call. The tap is the user's own: a choice sends its label as their message.
import { useState } from "react";
import type { Widget } from "../../core/widgets";
import { api } from "./api";
import { haptic } from "./haptics";
import { Check, Chevron } from "./icons";
import { openMaps } from "./platform";

export function WidgetCard({ messageId, widget, onSend, toast, live }: { messageId: number; widget: Widget; onSend: (text: string) => void; toast: (m: string) => void; live: boolean }) {
  const [w, setW] = useState(widget);
  const tap = async (index: number, on = true) => {
    try {
      const m = await api.widgetTap(messageId, index, on);
      if (m.meta.widget) setW(m.meta.widget);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (w.kind === "choices")
    return (
      <div className="widget" role="group" aria-label={w.title || "Choices"}>
        {w.title && <p className="widget-title">{w.title}</p>}
        <div className="widget-choices">
          {w.options.map((o, i) => (
            <button
              key={o.label}
              className={`widget-choice${w.picked === i ? " picked" : ""}`}
              // once one is picked (or the chat has moved on) they're a record, not buttons
              disabled={w.picked !== undefined || !live}
              onClick={() => {
                haptic.tap();
                void tap(i);
                onSend(o.label);
              }}
            >
              <span className="widget-choice-body">
                <span className="widget-choice-label">{o.label}</span>
                {o.detail && <span className="widget-choice-detail">{o.detail}</span>}
              </span>
              {w.picked === i ? <Check size={18} /> : w.picked === undefined && live ? <Chevron size={18} className="chev" /> : null}
            </button>
          ))}
        </div>
      </div>
    );

  if (w.kind === "checklist") {
    const done = w.items.filter((i) => i.done).length;
    return (
      <div className="widget" role="group" aria-label={w.title}>
        <p className="widget-title">
          {w.title}
          <span className="widget-count">
            {done} of {w.items.length}
          </span>
        </p>
        <ul className="widget-list">
          {w.items.map((it, i) => (
            <li key={`${i}${it.text}`}>
              <label className={`widget-check${it.done ? " done" : ""}`}>
                <input
                  type="checkbox"
                  checked={!!it.done}
                  onChange={(e) => {
                    haptic.select();
                    void tap(i, e.target.checked);
                  }}
                />
                <span className="widget-box">{it.done && <Check size={14} />}</span>
                <span className="widget-check-text">{it.text}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="widget widget-place" role="group" aria-label={w.name}>
      <p className="widget-place-name">{w.name}</p>
      {w.address && <p className="widget-place-line">{w.address}</p>}
      {w.note && <p className="widget-place-line">{w.note}</p>}
      <div className="widget-actions">
        <button className="btn primary" onClick={() => void openMaps(w.maps)}>
          Directions
        </button>
        {w.phone && (
          <a className="btn quiet" href={`tel:${w.phone.replace(/[^0-9+]/g, "")}`}>
            Call
          </a>
        )}
      </div>
    </div>
  );
}
