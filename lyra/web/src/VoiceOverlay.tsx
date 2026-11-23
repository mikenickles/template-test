import { useEffect, useReducer, useRef, useState } from "react";
import { clock, LIVE_PRICE_PER_MINUTE, LIVE_VOICES } from "../../core/live";
import { api, type Channel } from "./api";
import { Avatar } from "./LyraMark";
import { Mic } from "./icons";
import { startVoiceCall, type VoiceCall } from "./voiceCall";

const LABEL = { connecting: "Connecting…", listening: "Listening", speaking: "Tomo is speaking", working: "Working on it…", ended: "Call ended" } as const;

/** The live voice screen: Lyra's face, what's being said, the clock, mute and end. */
export function VoiceOverlay({ channel, onClose, toast }: { channel: Channel | null; onClose: () => void; toast: (m: string) => void }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [handle, setHandle] = useState<VoiceCall | null>(null);
  const live = useRef<VoiceCall | null>(null);
  const closing = useRef(false);
  // (0.65.2) change the voice mid-call: the new voice takes over on a fresh connection
  const [gen, setGen] = useState(0);
  const [voices, setVoices] = useState(false);
  const [voice, setVoice] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => {
    void api.state().then((s) => setVoice(s.liveVoice), () => {});
  }, []);
  const pickVoice = async (v: string) => {
    setVoices(false);
    if (v === voice) return;
    setSwitching(v);
    try {
      await api.saveSettings({ liveVoice: v });
      setVoice(v);
      const old = live.current;
      live.current = null;
      setHandle(null);
      await old?.end().catch(() => {});
      setGen((n) => n + 1);
    } catch (e) {
      toast((e as Error).message);
      setSwitching(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    startVoiceCall(channel?.id ?? null, redraw).then(
      (h) => {
        if (cancelled) return void h.end();
        live.current = h;
        setHandle(h);
        setSwitching(null);
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
      if (!switchingRef.current) void live.current?.end();
    };
    // one call per time the screen is opened, and a fresh one after a voice change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen]);
  const switchingRef = useRef(false);
  switchingRef.current = !!switching;

  const status = handle?.call.status ?? "connecting";
  // the call ended by itself (dropped, or closed from the other side)
  useEffect(() => {
    if (status === "ended" && !closing.current && !switching) {
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
    <div className={`voice voice-${status}${handle?.muted ? " muted" : ""}`} role="dialog" aria-modal="true" aria-label="Live voice with Tomo">
      <div className="voice-top">
        <span className="voice-where">{channel ? channel.name : "Tomo"}</span>
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
          {switching ? `Switching to ${switching}…` : handle?.muted && status === "listening" ? "Muted" : LABEL[status]}
        </p>
        <div className="voice-captions" aria-live="polite">
          {call?.heard && <p className="voice-heard">{call.heard}</p>}
          {call?.said && <p className="voice-said">{call.said}</p>}
          {call?.error && <p className="voice-error">{call.error}</p>}
        </div>
      </div>

      {voices && (
        <div className="voice-voices" role="group" aria-label="Voices">
          {LIVE_VOICES.map((v) => (
            <button key={v} className={`voice-chip${v === voice ? " on" : ""}`} aria-pressed={v === voice} onClick={() => void pickVoice(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      )}
      <div className="voice-actions">
        <button className={`voice-btn${voices ? " on" : ""}`} onClick={() => setVoices((o) => !o)} disabled={!!switching} aria-expanded={voices}>
          <span className="voice-btn-big" aria-hidden="true">♪</span>
          <span>{voice ? voice[0].toUpperCase() + voice.slice(1) : "Voice"}</span>
        </button>
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
