/** The long-press sheet on a message (reply, copy, edit, try again, pin, rate, delete) with its sources and steps, and the 'what was off?' sheet after a thumbs down. */
import { useEffect, useState } from "react";
import { onChange, type Message } from "../../api";
import { Close, Pin, ThumbDown, ThumbUp } from "../../icons";
import { haptic } from "../../haptics";
import { FEEDBACK_REASONS } from "../../../../core/style";
import { Pencil, Refresh, Reply as ReplyIcon } from "../../icons";
import { splitQuote } from "../../../../core/quote";
import { ask } from "../../ask";

export function Sources({ list }: { list: { url: string; title: string }[] }) {
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  return (
    <div className="sources" aria-label="Sources">
      <span className="sources-label">Sources</span>
      {list.map((s) => (
        <a key={s.url} className="source" href={s.url} target="_blank" rel="noreferrer noopener" title={s.title}>
          {host(s.url)}
        </a>
      ))}
    </div>
  );
}

/** After a thumbs down: what was off? One tap, a few words, or skip. */
export function WhySheet({ onSend }: { onSend: (why: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [more, setMore] = useState("");
  const why = [...picked, more.trim()].filter(Boolean).join("; ");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onSend("");
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onSend]);
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Skip" tabIndex={-1} onClick={() => onSend("")} />
      <div className="sheet why-sheet" role="dialog" aria-modal="true" aria-label="What was off?">
        <h2 className="why-title">What was off?</h2>
        <p className="why-sub">Tomo learns from this, so the next replies fit you better.</p>
        <div className="why-chips">
          {FEEDBACK_REASONS.map((r) => (
            <button
              key={r}
              className={`why-chip${picked.includes(r) ? " on" : ""}`}
              aria-pressed={picked.includes(r)}
              onClick={() => {
                haptic.select();
                setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <input className="field" placeholder="Anything else? (optional)" value={more} maxLength={160} onChange={(e) => setMore(e.target.value)} />
        <div className="dialog-actions">
          <button className="btn quiet" onClick={() => onSend("")}>
            Skip
          </button>
          <button className="btn ink" disabled={!why} onClick={() => onSend(why)}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a reply's meta holds when Lyra did something with it (or posted it unasked): those can't be taken back by Try again. */
export const DID = ["memory", "tasks", "worker", "routine", "voice", "reminder", "actions", "checkIn", "tidy", "skills", "docs", "placeReminder", "scan", "people", "headsUp", "lifeAdmin"] as const;

export function MessageActions({
  message,
  canEdit,
  canRetry,
  onAct,
  onClose,
}: {
  message: Message;
  canEdit: boolean;
  canRetry: boolean;
  onAct: (what: "copy" | "pin" | "delete" | "up" | "down" | "edit" | "retry" | "reply") => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="dialog-layer sheet-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Message actions">
        <p className="sheet-preview">{splitQuote(message.content).text.replace(/[*`#>]/g, "").slice(0, 160)}</p>
        {message.meta.usage && (
          <p className="sheet-usage">
            This reply: {(message.meta.usage.input + message.meta.usage.output).toLocaleString("en-US")} tokens ({message.meta.usage.input.toLocaleString("en-US")} read, {message.meta.usage.output.toLocaleString("en-US")} written)
            {message.meta.usage.calls > 1 ? `, ${message.meta.usage.calls} calls` : ""}
            {message.meta.usage.cached ? `; ${message.meta.usage.cached.toLocaleString("en-US")} read from the cache` : ""} · {message.meta.usage.model}
          </p>
        )}
        {!!message.meta.steps?.length && (
          <div className="sheet-more">
            <span className="sources-label">How I got this</span>
            <ol className="how-got-list">
              {message.meta.steps.map((s, i) => (
                <li key={`${i}-${s}`}>{s}</li>
              ))}
            </ol>
          </div>
        )}
        {!!message.meta.sources?.length && (
          <div className="sheet-more">
            <Sources list={message.meta.sources} />
          </div>
        )}
        <div className="group">
          {!!message.content.trim() && !message.meta.error && (
            <button className="item" onClick={() => onAct("reply")} autoFocus>
              <span className="body">
                <div className="title">Reply</div>
              </span>
              <ReplyIcon size={18} />
            </button>
          )}
          <button className="item" onClick={() => onAct("copy")}>
            <span className="body">
              <div className="title">Copy</div>
            </span>
          </button>
          {canEdit && (
            <button className="item" onClick={() => onAct("edit")}>
              <span className="body">
                <div className="title">Edit and send again</div>
              </span>
              <Pencil size={18} />
            </button>
          )}
          {canRetry && (
            <button className="item" onClick={() => onAct("retry")}>
              <span className="body">
                <div className="title">Try again</div>
              </span>
              <Refresh size={18} />
            </button>
          )}
          <button className="item" onClick={() => onAct("pin")}>
            <span className="body">
              <div className="title">{message.meta.pinned ? "Unpin" : "Pin"}</div>
            </span>
          </button>
          {message.role === "assistant" && (
            <>
              <button className="item" onClick={() => onAct("up")}>
                <span className="body">
                  <div className="title">{message.meta.feedback?.rating === "up" ? "Undo good reply" : "Good reply"}</div>
                </span>
                <ThumbUp size={18} />
              </button>
              <button className="item" onClick={() => onAct("down")}>
                <span className="body">
                  <div className="title">{message.meta.feedback?.rating === "down" ? "Undo not quite" : "Not quite"}</div>
                </span>
                <ThumbDown size={18} />
              </button>
            </>
          )}
          <button
            className="item"
            onClick={() => {
              void ask("Delete this message? Tomo will forget it was said, but anything it saved to memory stays.").then<unknown>((ok) => ok && onAct("delete"));
            }}
          >
            <span className="body">
              <div className="title bad">Delete</div>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
