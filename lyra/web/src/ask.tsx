// Lyra's own "are you sure?" and "what should it be called?" (0.47), in place of the system's
// plain pop-ups. `ask("Delete “Packing list”? Its steps go too.")` shows the question as the
// title and the rest underneath, with a button named for what happens; it resolves true or false.
// `askText("Save where you are now as…")` asks for a few words and resolves them, or null.
import { useEffect, useRef, useState } from "react";

interface Asking {
  title: string;
  body: string;
  ok: string;
  danger: boolean;
  /** set: ask for text */
  input?: { placeholder: string; value: string };
  done: (answer: boolean | string | null) => void;
}

let open: ((a: Asking) => void) | null = null;

/** The button says what will happen: the question's own first word or two. */
function buttonFor(text: string): { ok: string; danger: boolean } {
  const t = text.trim();
  const m = t.match(/^(Delete|Remove|Disconnect|Forget|Turn off|Stop|Put .*? back|Go back)/i);
  if (!m) return { ok: "Continue", danger: /replaces|removed|deleted/i.test(t) };
  const verb = m[1];
  const ok = /^Put /i.test(verb) ? "Put it back" : verb.charAt(0).toUpperCase() + verb.slice(1);
  return { ok, danger: /^(Delete|Remove|Disconnect|Forget)/i.test(verb) };
}

/** "Question? The rest." → the question, and the rest. */
function split(text: string): { title: string; body: string } {
  const i = text.indexOf("?");
  if (i === -1 || i > 90) {
    const dot = text.indexOf(". ");
    return dot === -1 ? { title: text, body: "" } : { title: text.slice(0, dot + 1), body: text.slice(dot + 2) };
  }
  return { title: text.slice(0, i + 1), body: text.slice(i + 1).trim() };
}

export function ask(text: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  if (!open) return Promise.resolve(window.confirm(text));
  const b = buttonFor(text);
  return new Promise((done) => open!({ ...split(text), ok: opts.ok ?? b.ok, danger: opts.danger ?? b.danger, done: (a) => done(a === true) }));
}

export function askText(title: string, opts: { placeholder?: string; value?: string; ok?: string; body?: string } = {}): Promise<string | null> {
  if (!open) return Promise.resolve(window.prompt(title, opts.value ?? ""));
  return new Promise((done) =>
    open!({
      title,
      body: opts.body ?? "",
      ok: opts.ok ?? "Save",
      danger: false,
      input: { placeholder: opts.placeholder ?? "", value: opts.value ?? "" },
      done: (a) => done(typeof a === "string" && a.trim() ? a.trim() : null),
    }),
  );
}

/** Mounted once, at the top of the app. */
export function AskHost() {
  const [a, setA] = useState<Asking | null>(null);
  const [text, setText] = useState("");
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    open = (next) => {
      setText(next.input?.value ?? "");
      setA(next);
    };
    return () => {
      open = null;
    };
  }, []);
  const close = (answer: boolean | string | null) => {
    a?.done(answer);
    setA(null);
  };
  useEffect(() => {
    if (!a) return;
    if (!a.input) okRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close(a.input ? null : false);
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [a]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null;
  return (
    <div className="dialog-layer ask-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Cancel" tabIndex={-1} onClick={() => close(a.input ? null : false)} />
      <form
        className="dialog ask"
        role="alertdialog"
        aria-modal="true"
        aria-label={a.title}
        onSubmit={(e) => {
          e.preventDefault();
          close(a.input ? text : true);
        }}
      >
        <h2 className="ask-title">{a.title}</h2>
        {a.body && <p className="ask-body">{a.body}</p>}
        {a.input && <input className="field" autoFocus value={text} placeholder={a.input.placeholder} maxLength={80} onChange={(e) => setText(e.target.value)} aria-label={a.title} />}
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={() => close(a.input ? null : false)}>
            Cancel
          </button>
          <button ref={okRef} type="submit" className={`btn ${a.danger ? "danger" : "ink"}`} disabled={!!a.input && !text.trim()}>
            {a.ok}
          </button>
        </div>
      </form>
    </div>
  );
}
