/** Settings, You and appearance: name, look, accent, bubbles, size, feel, talk like me, reaching Tomo. */
import { useState } from "react";
import { api, isNative, type AppState } from "../../api";
import { Check, Chevron } from "../../icons";
import { useSlidingPill } from "../../pill";
import { haptic, hapticsOn, setHaptics } from "../../haptics";
import { setSounds, sound, soundsOn } from "../../sounds";
import { listen } from "../../platform";
import { WeatherSection } from "../WeatherSection";
import { useEffect } from "react";
import { ask } from "../../ask";
import { AVATAR_SIZES, TEXT_SIZES, ambientOn, avatarSize, setAmbient, setAvatarSize, setTextSize, textSize } from "../../sizes";
import { Orb } from "../../LyraMark";
import { BUBBLE_CHOICES, THEME_CHOICES, ACCENT_CHOICES } from "./choices";
import type { Props } from "../Settings";

export function YouSection({ state, setState, toast, run, busy }: Omit<Props, "section"> & { run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState(state.userName === "you" ? "" : state.userName);
  return (
    <>
      <section className="section">
        <h2 className="section-label">You</h2>
        <label className="field-label" htmlFor="name">
          What should Tomo call you?
        </label>
        <div className="field-row">
          <input id="name" className="field" value={name} placeholder="Your first name" onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          {name.trim() !== (state.userName === "you" ? "" : state.userName) && (
            <button className="btn ink" disabled={busy} onClick={() => void run(() => api.saveSettings({ userName: name }), "Saved")}>
              Save
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Look</h2>
        <div className="theme-styles" role="radiogroup" aria-label="Look">
          {THEME_CHOICES.map((t) => (
            <label key={t.id} className="theme-style" data-theme={t.id}>
              <input type="radio" name="theme" value={t.id} checked={state.theme === t.id} disabled={busy} onChange={() => void run(() => api.saveSettings({ theme: t.id }), `${t.label} it is`)} />
              {/* a tiny chat in the card's own look: Tomo, a reply, your message, the tab underline */}
              <span className="theme-sample" aria-hidden="true">
                <i className="ts-face" />
                <span className="ts-lines">
                  <i />
                  <i />
                </span>
                <i className="ts-me" />
                <i className="ts-tab" />
              </span>
              <span className="name">{t.label}</span>
              <span className="about">{t.about}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Accent color</h2>
        <div className="swatches" role="radiogroup" aria-label="Accent color">
          {ACCENT_CHOICES.map((c) => (
            <label key={c.id} className="swatch" data-accent={c.id}>
              <input type="radio" name="accent" value={c.id} checked={state.accent === c.id} disabled={busy} onChange={() => void run(() => api.saveSettings({ accent: c.id }), `${c.label} it is`)} />
              <span className="swatch-dot">{state.accent === c.id && <Check size={20} />}</span>
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Your messages</h2>
        <div className="bubble-styles" role="radiogroup" aria-label="Your messages">
          {BUBBLE_CHOICES.map((b) => (
            <label key={b.id} className="bubble-style" data-bubbles={b.id}>
              <input
                type="radio"
                name="bubbles"
                value={b.id}
                checked={state.bubbles === b.id}
                disabled={busy}
                onChange={() => void run(() => api.saveSettings({ bubbles: b.id }), `${b.label} it is`)}
              />
              <span className="sample" aria-hidden="true">
                Hey Tomo!
              </span>
              <span className="name">{b.label}</span>
              <span className="about">{b.about}</span>
            </label>
          ))}
        </div>
      </section>

      <SizeSection />

      <TalkLikeMe state={state} run={run} busy={busy} toast={toast} />

      <WeatherSection state={state} setState={setState} toast={toast} />

      <HapticsSection />

      <ReachSection toast={toast} />
    </>
  );
}

/** The fastest ways to Lyra from outside the app (the phone): the assistant gesture, icon shortcuts, the tile, the widget. */
export function ReachSection({ toast }: { toast: (m: string) => void }) {
  const [state, setState] = useState<"on" | "off" | "unknown" | null>(null);
  useEffect(() => {
    const check = () => void listen.assistant().then(setState, () => {});
    check();
    // back from the phone's settings page
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  if (state === null) return null;
  return (
    <section className="section">
      <h2 className="section-label">Reach Tomo faster</h2>
      <div className="group">
        <button className="item" onClick={() => void listen.chooseAssistant().catch((e) => toast((e as Error).message))}>
          <span className="body">
            <div className="title">Make Tomo your assistant</div>
            <div className="sub">
              {state === "on"
                ? "Tomo is this phone's assistant: the assistant gesture (holding the power or home button, or swiping in from a corner) opens it listening."
                : "Pick Tomo under Digital assistant app, and the phone's assistant gesture (holding the power or home button, or swiping in from a corner) opens Tomo listening instead."}
            </div>
          </span>
          {state === "on" ? <span className="pill">On</span> : <Chevron size={18} className="chev" />}
        </button>
      </div>
      <ul className="reach-list">
        <li>
          <b>Tomo's icon:</b> press and hold it for Talk to Tomo, Voice memo and Tasks.
        </li>
        <li>
          <b>Quick Settings:</b> add the Tomo tile to talk from anywhere.
        </li>
        <li>
          <b>Home screen:</b> add the Tomo widget for what's next and a mic.
        </li>
      </ul>
    </section>
  );
}

/** How big the chat text and Lyra's avatar are, on this device. */
export function SizeSection() {
  const [text, setText] = useState(textSize);
  const [avatar, setAvatar] = useState(avatarSize);
  const textPill = useSlidingPill(text);
  const avatarPill = useSlidingPill(avatar);
  return (
    <section className="section">
      <h2 className="section-label">Size</h2>
      <div className="size-preview" aria-hidden="true">
        <Orb />
        <p>This is how big Tomo and its messages look.</p>
      </div>
      <div className="size-row">
        <span>Text in chats</span>
        <div className="seg four" role="radiogroup" aria-label="Text size" ref={textPill}>
          <span className="slide-pill" aria-hidden="true" />
          {TEXT_SIZES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={text === s.id}
              className={text === s.id ? "on" : ""}
              onClick={() => {
                setTextSize(s.id);
                setText(s.id);
                haptic.select();
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="size-row">
        <span>Tomo's avatar</span>
        <div className="seg" role="radiogroup" aria-label="Avatar size" ref={avatarPill}>
          <span className="slide-pill" aria-hidden="true" />
          {AVATAR_SIZES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={avatar === s.id}
              className={avatar === s.id ? "on" : ""}
              onClick={() => {
                setAvatarSize(s.id);
                setAvatar(s.id);
                haptic.select();
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">Only on this device.</p>
    </section>
  );
}

/** Sounds (any device, off to start) and little taps under your finger (the phone). */
export function HapticsSection() {
  const [on, setOn] = useState(hapticsOn);
  const [sounds, setSoundsOn] = useState(soundsOn);
  const [ambient, setAmbientOn] = useState(ambientOn);
  return (
    <section className="section">
      <h2 className="section-label">Feel</h2>
      <div className="group">
        <label className="item">
          <span className="body">
            <div className="title">Gentle motion</div>
            <div className="sub">Tomo's face moves, and switches to its working clip while it's thinking. Off shows a still picture and saves a touch of battery.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={ambient}
            onChange={(e) => {
              setAmbient(e.target.checked);
              setAmbientOn(e.target.checked);
            }}
          />
        </label>
        <label className="item">
          <span className="body">
            <div className="title">Sounds</div>
            <div className="sub">A few soft notes: when you send, when Tomo answers, when something gets done, and a bell when Tomo speaks first.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={sounds}
            onChange={(e) => {
              setSounds(e.target.checked);
              setSoundsOn(e.target.checked);
              if (e.target.checked) sound.reply(true);
            }}
          />
        </label>
        {isNative && (
        <label className="item">
          <span className="body">
            <div className="title">Haptics</div>
            <div className="sub">A light tap when you send, switch tabs, swipe a task or tick one off.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={on}
            onChange={(e) => {
              setHaptics(e.target.checked);
              setOn(e.target.checked);
              haptic.done();
            }}
          />
        </label>
        )}
      </div>
    </section>
  );
}

export type TalkStyle = Awaited<ReturnType<typeof api.talkStyle>>;

/** Lyra mirrors how you talk, and what Lyra has noticed so far. */
export function TalkLikeMe({ state, run, busy, toast }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean; toast: (m: string) => void }) {
  const [style, setStyle] = useState<TalkStyle | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => void api.talkStyle().then(setStyle, () => {}), [state.mirror]);
  const act = async (fn: () => Promise<TalkStyle>, done: string) => {
    setWorking(true);
    try {
      setStyle(await fn());
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="section">
      <h2 className="section-label">How Tomo talks to you</h2>
      <div className="group">
        <label className="item">
          <span className="body">
            <div className="title">Talk like me</div>
            <div className="sub">Tomo picks up your slang, energy and emoji over time and talks a bit more like you. Tomo learns only from your own messages and the replies you rate with a thumbs up or down, never your email.</div>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={state.mirror}
            disabled={busy}
            onChange={(e) => void run(() => api.saveSettings({ mirror: e.target.checked }), e.target.checked ? "Tomo will talk more like you" : "Tomo will keep its own voice")}
          />
        </label>
      </div>
      {state.mirror && style && (
        <>
          {style.notes.length ? (
            <>
              <p className="hint">What Tomo has noticed so far:</p>
              <ul className="style-notes">
                {style.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hint">Nothing learned yet. Tomo goes by your recent chat for now, and every few days takes note of how you talk.</p>
          )}
          <div className="field-row">
            <button className="btn quiet" disabled={working} onClick={() => void act(() => api.learnStyleNow(), "Updated")}>
              {working ? "Listening…" : style.notes.length ? "Update now" : "Learn now"}
            </button>
            {style.notes.length > 0 && (
              <button className="btn text" disabled={working} onClick={() => void ask("Forget what Tomo noticed about how you talk?").then<unknown>((ok) => ok && act(() => api.forgetStyle(), "Forgotten"))}>
                Forget
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
