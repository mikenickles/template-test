import { useState } from "react";
import { api, type AppState } from "../api";
import { Chevron, Cpu } from "../icons";

export function Settings({
  state,
  setState,
  toast,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
}) {
  const [provider, setProvider] = useState(state.choice.provider);
  const [model, setModel] = useState(state.choice.model);
  const [busy, setBusy] = useState(false);
  const info = state.providers.find((p) => p.id === provider)!;
  const dirty = provider !== state.choice.provider || model.trim() !== state.choice.model;
  const connected = state.connectors.filter((c) => c.state === "connected").length;

  const pick = (id: string) => {
    setProvider(id);
    setModel(id === state.choice.provider ? state.choice.model : state.providers.find((p) => p.id === id)!.defaultModel);
  };

  const save = async () => {
    setBusy(true);
    try {
      setState(await api.settings(provider, model.trim()));
      toast(`Lyra now uses ${info.label}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Everything stays on this computer except what's sent to the model you pick.</p>

      <section className="section">
        <h2 className="section-label">Model</h2>
        <div className="group" role="radiogroup" aria-label="Model provider">
          {state.providers.map((p) => (
            <label className="item" key={p.id} style={{ cursor: p.ready ? "pointer" : "default", opacity: p.ready ? 1 : 0.6 }}>
              <input
                type="radio"
                name="provider"
                className="sr-only"
                checked={provider === p.id}
                disabled={!p.ready}
                onChange={() => pick(p.id)}
              />
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
            <label className="section-label" htmlFor="model" style={{ display: "block" }}>
              Model name
            </label>
            <input id="model" className="field" value={model} onChange={(e) => setModel(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </div>
        )}
        {dirty && (
          <button className="btn primary" style={{ marginTop: 16, width: "100%" }} onClick={save} disabled={busy || !info.ready}>
            Use {info.label}
          </button>
        )}
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
