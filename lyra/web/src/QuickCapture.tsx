// Quick capture and voice memos: say it, and it goes to Lyra.
//  - quick (the Quick Settings tile, the widget's mic): listens until you pause, then sends it;
//  - memo ("Voice memo" in the attach sheet): keeps listening until Done, then Lyra turns it into
//    a card of tasks and reminders you can tap.
// Uses the phone's own speech recognition. You can always type instead.
import { useEffect, useRef, useState } from "react";
import { Close, Mic } from "./icons";
import { listen } from "./platform";
import { haptic } from "./haptics";

export function QuickCapture({ mode, onSend, onClose }: { mode: "quick" | "memo"; onSend: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"listening" | "done" | "typing">(listen.available ? "listening" : "typing");
  const [error, setError] = useState("");
  const sent = useRef(false);

  const send = (t: string) => {
    const words = t.trim();
    if (!words || sent.current) return;
    sent.current = true;
    haptic.done();
    onSend(mode === "memo" ? `Voice memo: ${words}` : words);
    onClose();
  };

  useEffect(() => {
    if (!listen.available) return;
    const off = listen.onWords((o) => {
      if (o.error) {
        setError(o.error);
        setState("typing");
        return;
      }
      if (typeof o.text === "string") setText(o.text);
      if (o.done) {
        setState("done");
        // quick capture goes as soon as you stop talking
        if (mode === "quick" && o.text?.trim()) send(o.text);
      }
    });
    haptic.tap();
    listen.start(mode === "memo").catch((e) => {
      setError((e as Error).message);
      setState("typing");
    });
    return () => {
      off();
      void listen.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = () => {
    if (state === "listening") void listen.stop();
    else send(text);
  };

  return (
    <div className="dialog-layer sheet-layer capture-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet capture" role="dialog" aria-modal="true" aria-label={mode === "memo" ? "Voice memo" : "Tell Lyra"}>
        <div className="capture-top">
          <span className="capture-title">{mode === "memo" ? "Voice memo" : "Tell Lyra"}</span>
          <button className="ring" aria-label="Cancel" onClick={onClose}>
            <Close size={18} />
          </button>
        </div>
        {state === "listening" && (
          <div className="capture-listening" aria-live="polite">
            <span className="capture-mic">
              <Mic size={26} />
            </span>
            <p className="capture-hint">{mode === "memo" ? "Talk it through. Tap Done when you've finished." : "Listening… say what's on your mind."}</p>
          </div>
        )}
        {state === "typing" || state === "done" ? (
          <textarea
            className="capture-text"
            value={text}
            autoFocus={state === "typing"}
            rows={4}
            placeholder={mode === "memo" ? "What's on your mind? Lyra will sort it into tasks and reminders." : "Remind me to call the dentist tomorrow"}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          text && <p className="capture-words">{text}</p>
        )}
        {error && <p className="hint">{error}</p>}
        <div className="dialog-actions">
          {state === "listening" ? (
            <button className="btn quiet" onClick={() => (void listen.cancel(), setState("typing"))}>
              Type instead
            </button>
          ) : (
            <span />
          )}
          <button className="btn ink" disabled={state !== "listening" && !text.trim()} onClick={done}>
            {state === "listening" ? "Done" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
