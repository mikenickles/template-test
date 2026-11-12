import { useState } from "react";
import { api, isNative, type AppState } from "../api";
import { Check, Chevron, Cpu } from "../icons";

type KeyId = "anthropic" | "openai" | "gemini";

const ACCENT_CHOICES: { id: AppState["accent"]; label: string }[] = [
  { id: "lime", label: "Lime" },
  { id: "orange", label: "Burnt orange" },
  { id: "yellow", label: "Yellow" },
  { id: "red", label: "Red" },
  { id: "maroon", label: "Maroon" },
  { id: "navy", label: "Navy" },
  { id: "indigo", label: "Indigo" },
  { id: "teal", label: "Teal" },
];

const KEY_FIELDS: { id: KeyId; label: string; where: string; placeholder: string }[] = [
  { id: "anthropic", label: "Claude API key", where: "console.anthropic.com", placeholder: "sk-ant-…" },
  { id: "openai", label: "OpenAI API key", where: "platform.openai.com", placeholder: "sk-…" },
  { id: "gemini", label: "Gemini API key", where: "aistudio.google.com", placeholder: "AIza…" },
];

export function Settings({
  state,
  setState,
  toast,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
}) {
  const [provider, setProvider] = useState<string>(state.choice.provider);
  const [model, setModel] = useState(state.choice.model);
  const [name, setName] = useState(state.userName === "you" ? "" : state.userName);
  const [drafts, setDrafts] = useState<Partial<Record<KeyId, string>>>({});
  const [baseUrl, setBaseUrl] = useState(state.keys.openaiBaseUrl);
  const [busy, setBusy] = useState(false);
  const info = state.providers.find((p) => p.id === provider)!;
  const modelDirty = provider !== state.choice.provider || model.trim() !== state.choice.model;
  const connected = state.connectors.filter((c) => c.state === "connected").length;

  const run = async (fn: () => Promise<AppState>, done: string) => {
    setBusy(true);
    try {
      const s = await fn();
      setState(s);
      setProvider(s.choice.provider);
      setModel(s.choice.model);
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (id: string) => {
    setProvider(id);
    setModel(id === state.choice.provider ? state.choice.model : state.providers.find((p) => p.id === id)!.defaultModel);
  };

  const saveKey = (id: KeyId) =>
    run(async () => {
      const value = drafts[id]?.trim();
      // Using a new key straight away is almost always what you want.
      const s = await api.saveSettings({ keys: { [id]: value }, ...(value ? { provider: id } : {}) });
      setDrafts((d) => ({ ...d, [id]: "" }));
      return s;
    }, "Key saved");

  return (
    <div className="screen">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        Lyra lives on this phone. Your keys stay in {isNative ? "Android's encrypted storage" : "this browser"} and only go to the model you pick.
      </p>

      <section className="section">
        <h2 className="section-label">You</h2>
        <label className="field-label" htmlFor="name">
          What should Lyra call you?
        </label>
        <div className="field-row">
          <input id="name" className="field" value={name} placeholder="Your first name" onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          {name.trim() !== (state.userName === "you" ? "" : state.userName) && (
            <button className="btn ink" disabled={busy} onClick={() => run(() => api.saveSettings({ userName: name }), "Saved")}>
              Save
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Accent color</h2>
        <div className="swatches" role="radiogroup" aria-label="Accent color">
          {ACCENT_CHOICES.map((c) => (
            <label key={c.id} className="swatch" data-accent={c.id}>
              <input
                type="radio"
                name="accent"
                value={c.id}
                checked={state.accent === c.id}
                disabled={busy}
                onChange={() => run(() => api.saveSettings({ accent: c.id }), `${c.label} it is`)}
              />
              <span className="swatch-dot">{state.accent === c.id && <Check size={20} />}</span>
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Model</h2>
        <div className="group" role="radiogroup" aria-label="Model provider">
          {state.providers.map((p) => (
            <label className="item" key={p.id} style={{ cursor: p.ready ? "pointer" : "default", opacity: p.ready ? 1 : 0.55 }}>
              <input type="radio" name="provider" className="sr-only" checked={provider === p.id} disabled={!p.ready} onChange={() => pick(p.id)} />
              <span className={`radio${provider === p.id ? " on" : ""}`} />
              <span className="body">
                <div className="title">{p.label}</div>
                <div className="sub">{p.id === "fake" ? "Canned replies, for trying the app" : p.ready ? p.defaultModel : p.hint}</div>
              </span>
            </label>
          ))}
        </div>
        {provider !== "fake" && (
          <div style={{ marginTop: 16 }}>
            <label className="section-label" htmlFor="model">
              Model name
            </label>
            <input id="model" className="field" value={model} onChange={(e) => setModel(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </div>
        )}
        {modelDirty && (
          <button
            className="btn primary"
            style={{ marginTop: 16, width: "100%" }}
            onClick={() => run(() => api.saveSettings({ provider, model }), `Lyra now uses ${info.label}`)}
            disabled={busy || !info.ready}
          >
            Use {info.label}
          </button>
        )}
      </section>

      <section className="section">
        <h2 className="section-label">Web</h2>
        <div className="group">
          <label className="item">
            <span className="body">
              <div className="title">Web search</div>
              <div className="sub">Lyra and its workers can look things up with your model's built-in search. Each search adds a small fee on your model bill.</div>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={state.webSearch}
              disabled={busy}
              onChange={(e) => run(() => api.saveSettings({ webSearch: e.target.checked }), e.target.checked ? "Web search on" : "Web search off")}
            />
          </label>
        </div>
        {provider === "fake" && <p className="hint">The practice model can't search. Pick Claude, OpenAI or Gemini.</p>}
        {state.keys.openaiBaseUrl && provider === "openai" && <p className="hint">Your own model server doesn't support web search.</p>}
      </section>

      <section className="section">
        <h2 className="section-label">API keys</h2>
        <div className="keys">
          {KEY_FIELDS.map((k) => {
            const saved = state.keys[k.id];
            const draft = drafts[k.id] ?? "";
            return (
              <div className="key" key={k.id}>
                <label className="key-head" htmlFor={`key-${k.id}`}>
                  <span>{k.label}</span>
                  {saved ? <span className="pill live">Saved</span> : <span className="key-where">{k.where}</span>}
                </label>
                <div className="field-row">
                  <input
                    id={`key-${k.id}`}
                    className="field"
                    type="password"
                    value={draft}
                    placeholder={saved ? "•••••••• (paste to replace)" : k.placeholder}
                    onChange={(e) => setDrafts((d) => ({ ...d, [k.id]: e.target.value }))}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {draft.trim() ? (
                    <button className="btn ink" disabled={busy} onClick={() => saveKey(k.id)}>
                      Save
                    </button>
                  ) : saved ? (
                    <button className="btn quiet" disabled={busy} onClick={() => run(() => api.saveSettings({ keys: { [k.id]: null } }), "Key removed")}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="key">
            <label className="key-head" htmlFor="base-url">
              <span>Your own model server</span>
              <span className="key-where">optional</span>
            </label>
            <div className="field-row">
              <input
                id="base-url"
                className="field"
                value={baseUrl}
                placeholder="http://192.168.1.20:11434/v1"
                onChange={(e) => setBaseUrl(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
              />
              {baseUrl.trim() !== state.keys.openaiBaseUrl && (
                <button className="btn ink" disabled={busy} onClick={() => run(() => api.saveSettings({ openaiBaseUrl: baseUrl }), "Saved")}>
                  Save
                </button>
              )}
            </div>
            <p className="hint" style={{ marginLeft: 0 }}>
              Any OpenAI-compatible server, like Ollama or LM Studio on your computer. Used by the OpenAI option.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Connections</h2>
        <div className="group">
          <a className="item" href="#/access">
            <span className="tile">
              <Cpu />
            </span>
            <span className="body">
              <div className="title">Apps Lyra can read</div>
              <div className="sub">{connected ? `${connected} connected` : "None yet"}</div>
            </span>
            <Chevron className="chev" />
          </a>
        </div>
      </section>
    </div>
  );
}
