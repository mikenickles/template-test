import { useEffect, useState } from "react";
import { api } from "../api";
import { Markdown } from "../markdown";

/** Who Lyra is: read it, edit it, or go back to the original. */
export function Soul({ toast, userName }: { toast: (m: string) => void; userName: string }) {
  const [soul, setSoul] = useState<{ content: string; custom: boolean } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => void api.soul().then(setSoul, (e) => toast(e.message)), [toast]);
  if (!soul) return <div className="center-load">Loading…</div>;

  const run = async (fn: () => Promise<{ content: string; custom: boolean }>, msg: string) => {
    setBusy(true);
    try {
      setSoul(await fn());
      setDraft(null);
      toast(msg);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (draft !== null)
    return (
      <div className="screen">
        <div className="bar" style={{ marginBottom: 24 }}>
          <h1 className="page-title">Edit soul</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn quiet" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || draft === soul.content} onClick={() => run(() => api.saveSoul(draft), "Soul saved")}>
              Save
            </button>
          </div>
        </div>
        <label htmlFor="soul-file" className="sr-only">
          Lyra's soul
        </label>
        <textarea id="soul-file" className="editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck />
        <p className="hint">Write {"{user}"} where your name should go. Changes apply from Lyra's next reply.</p>
      </div>
    );

  return (
    <div className="screen">
      <div className="bar">
        <h1 className="page-title">Soul</h1>
        <button className="btn quiet" onClick={() => setDraft(soul.content)}>
          Edit
        </button>
      </div>
      <p className="page-sub">Who Lyra is and how it talks to you. {soul.custom ? "Edited by you." : "The original."}</p>
      {soul.custom && (
        <p className="hint">
          Lyra's built-in character changes with updates (the latest makes Lyra more of a friend, and quicker to take the lead). Because you've edited yours, Lyra is still using your version. Reset to the original below to get the new one; you can edit again after.
        </p>
      )}
      <div className="soul-doc">
        {soul.content
          .replace(/^# .*\n+/, "")
          .replaceAll("{user}", userName === "you" ? "your person" : userName)
          .split(/^## /m)
          .map((part, i) => {
            const [head, ...rest] = i === 0 ? ["", part] : part.split("\n");
            return (
              <section key={i} className={head ? "section" : undefined}>
                {head && <h2 className="section-label">{head.trim()}</h2>}
                <Markdown text={rest.join("\n").trim()} />
              </section>
            );
          })}
      </div>
      {soul.custom && (
        <section className="section">
          <button className="btn quiet" disabled={busy} onClick={() => confirm("Go back to Lyra's original soul? Your edits are removed.") && run(() => api.resetSoul(), "Back to the original")}>
            Reset to the original
          </button>
        </section>
      )}
    </div>
  );
}
