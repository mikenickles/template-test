import { useEffect, useReducer, useRef, useState } from "react";
import { clock, LIVE_PRICE_PER_MINUTE } from "../../core/live";
import type { Channel } from "./api";
import { Avatar } from "./LyraMark";
import { Mic } from "./icons";
import { startVoiceCall, type VoiceCall } from "./voiceCall";

const LABEL = { connecting: "Connecting…", listening: "Listening", speaking: "Lyra is speaking", working: "Working on it…", ended: "Call ended" } as const;

/** The live voice screen: Lyra's face, what's being said, the clock, mute and end. */
export function VoiceOverlay({ channel, onClose, toast }: { channel: Channel | null; onClose: () => void; toast: (m: string) => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [handle, setHandle] = useState<VoiceCall | null>(null);
  const live = useRef<VoiceCall | null>(null);
  const closing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    startVoiceCall(channel?.id ?? null, redraw).then(
      (h) => {
        if (cancelled) return void h.end();
        live.current = h;
        setHandle(h);
      },
      (e) => {
        if (cancelled) return;
        toast((e as Error).message);
        onClose();
      },
    );
    const tick = setInterval(redraw, 1000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      void live.current?.end();
    };
    // one call per time the screen is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = handle?.call.status ?? "connecting";
  // the call ended by itself (dropped, or closed from the other side)
  useEffect(() => {
    if (status === "ended" && !closing.current) {
      closing.current = true;
      if (handle?.call.error) toast(handle.call.error);
      onClose();
    }
  }, [status, handle, onClose, toast]);

  const hangUp = () => {
    closing.current = true;
    void live.current?.end();
    onClose();
  };

  const elapsed = handle?.startedAt ? (Date.now() - handle.startedAt) / 1000 : 0;
  const call = handle?.call;
  return (
    <div className={`voice voice-${status}${handle?.muted ? " muted" : ""}`} role="dialog" aria-modal="true" aria-label="Live voice with Lyra">
      <div className="voice-top">
        <span className="voice-where">{channel ? channel.name : "Lyra"}</span>
        <span className="voice-clock" aria-label="Call length and estimated cost">
          {clock(elapsed)} · about ${((elapsed / 60) * LIVE_PRICE_PER_MINUTE).toFixed(2)}
        </span>
      </div>

      <div className="voice-center">
        <span className="voice-orb">
          <span className="orb orb-lg">
            <Avatar />
          </span>
        </span>
        <p className="voice-status" role="status">
          {handle?.muted && status === "listening" ? "Muted" : LABEL[status]}
        </p>
        <div className="voice-captions" aria-live="polite">
          {call?.heard && <p className="voice-heard">{call.heard}</p>}
          {call?.said && <p className="voice-said">{call.said}</p>}
          {call?.error && <p className="voice-error">{call.error}</p>}
        </div>
      </div>

      <div className="voice-actions">
        <button className={`voice-btn${handle?.muted ? " on" : ""}`} onClick={() => handle?.setMuted(!handle.muted)} disabled={!handle} aria-pressed={!!handle?.muted}>
          <Mic size={22} />
          <span>{handle?.muted ? "Unmute" : "Mute"}</span>
        </button>
        <button className="voice-btn end" onClick={hangUp}>
          <span>End</span>
        </button>
      </div>
    </div>
  );
}
