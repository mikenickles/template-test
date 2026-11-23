import { useState } from "react";

/**
 * (0.62) "How I got this": the plain steps Tomo took for a reply. While it works they tick by
 * one under another; once the reply is written they fold into one line you can open.
 */
export function WorkSteps({ steps }: { steps: string[] }) {
  if (!steps.length) return null;
  return (
    <ul className="work-steps" aria-live="polite">
      {steps.map((s, i) => (
        <li key={`${i}-${s}`} className={i === steps.length - 1 ? "now" : ""}>
          <i aria-hidden="true" />
          {s}
        </li>
      ))}
    </ul>
  );
}

export function HowIGotThis({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  return (
    <div className={`how-got${open ? " open" : ""}`}>
      <button type="button" className="how-got-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="how-dots" aria-hidden="true">
          {steps.slice(0, 3).map((_, i) => (
            <i key={i} />
          ))}
        </span>
        How I got this · {steps.length} {steps.length === 1 ? "step" : "steps"}
      </button>
      {open && (
        <ol className="how-got-list">
          {steps.map((s, i) => (
            <li key={`${i}-${s}`}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
