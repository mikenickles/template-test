import { useEffect, useState } from "react";
import { api, type AppState } from "../api";
import { Check, Chevron } from "../icons";

type KeyId = "anthropic" | "openai" | "gemini";
interface Model {
  id: string;
  label: string;
}

const PROVIDERS: { id: KeyId; name: string; keyLabel: string; where: string; placeholder: string }[] = [
  { id: "anthropic", name: "Claude", keyLabel: "Claude API key", where: "console.anthropic.com", placeholder: "sk-ant-…" },
  { id: "openai", name: "OpenAI", keyLabel: "OpenAI API key", where: "platform.openai.com", placeholder: "sk-…" },
  { id: "gemini", name: "Gemini", keyLabel: "Gemini API key", where: "aistudio.google.com", placeholder: "AIza…" },
];
const SHOWN = 6;

/** Settings → AI model: a card per provider. Add its key, then pick from the models that key can use. */
export function ModelSettings({ state, run, busy }: { state: AppState; run: (fn: () => Promise<AppState>, done: string) => Promise<void>; busy: boolean }) {
  const current = state.choice;
  const [open, setOpen] = useState<KeyId | null>(current.provider === "fake" ? (PROVIDERS.find((p) => state.providers.find((x) => x.id === p.id)?.ready)?.id ?? "anthropic") : (current.provider as KeyId));

  return (
    <>
      <section className="section">
        <h2 className="section-label">Providers</h2>
        <div className="providers">
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.id} p={p} state={state} run={run} busy={busy} open={open === p.id} onToggle={() => setOpen((o) => (o === p.id ? null : p.id))} />
          ))}
          <button
            className={`provider-head practice${current.provider === "fake" ? " using" : ""}`}
            disabled={busy || current.provider === "fake"}
            onClick={() => void run(() => api.saveSettings({ provider: "fake" }), "Lyra now uses Practice")}
          >
            <span className="body">
              <span className="title">Practice</span>
              <span className="sub">Canned replies, for trying the app without a key</span>
            </span>
            {current.provider === "fake" ? <span className="pill live">In use</span> : <span className="pill">Use</span>}
          </button>
        </div>
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
              onChange={(e) => void run(() => api.saveSettings({ webSearch: e.target.checked }), e.target.checked ? "Web search on" : "Web search off")}
            />
          </label>
        </div>
        {current.provider === "fake" && <p className="hint">The practice model can't search. Pick Claude, OpenAI or Gemini.</p>}
        {state.keys.openaiBaseUrl && current.provider === "openai" && <p className="hint">Your own model server doesn't support web search.</p>}
      </section>
    </>
  );
}

function ProviderCard({
  p,
  state,
  run,
  busy,
  open,
  onToggle,
}: {
  p: (typeof PROVIDERS)[number];
  state: AppState;
  run: (fn: () => Promise<AppState>, done: string) => Promise<void>;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const saved = state.keys[p.id];
  const ready = !!state.providers.find((x) => x.id === p.id)?.ready;
  const using = state.choice.provider === p.id;
  const [draft, setDraft] = useState("");
  const [baseUrl, setBaseUrl] = useState(state.keys.openaiBaseUrl);
  const [models, setModels] = useState<Model[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState("");
  const [reload, setReload] = useState(0);

  // the models this key can use, asked from the provider when the card opens
  useEffect(() => {
    if (!open || !ready) return;
    let alive = true;
    setModels(null);
    setError(null);
    api.models(p.id).then(
      (m) => alive && setModels(m),
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [open, ready, p.id, reload, state.keys.openaiBaseUrl]);

  const use = (m: Model) => void run(() => api.saveSettings({ provider: p.id, model: m.id }), `Lyra now uses ${m.label}`);
  const currentLabel = using ? (models?.find((m) => m.id === state.choice.model)?.label ?? state.choice.model) : null;
  const match = (m: Model) => !filter.trim() || `${m.label} ${m.id}`.toLowerCase().includes(filter.trim().toLowerCase());
  const list = (models ?? []).filter(match);
  // the one in use always shows, even when the list is folded
  const folded = all || filter.trim() ? list : [...list.slice(0, SHOWN), ...list.slice(SHOWN).filter((m) => using && m.id === state.choice.model)];

  return (
    <div className={`provider${open ? " open" : ""}${using ? " using" : ""}`}>
      <button className="provider-head" onClick={onToggle} aria-expanded={open}>
        <span className="body">
          <span className="title">{p.name}</span>
          <span className="sub">{using ? currentLabel : ready ? "Ready. Pick a model to use it." : "Add an API key"}</span>
        </span>
        {using && <span className="pill live">In use</span>}
        <Chevron className={`chev${open ? " down" : ""}`} />
      </button>

      {open && (
        <div className="provider-body">
          <label className="key-head" htmlFor={`key-${p.id}`}>
            <span>{p.keyLabel}</span>
            {saved ? <span className="pill live">Saved</span> : <span className="key-where">{p.where}</span>}
          </label>
          <div className="field-row">
            <input
              id={`key-${p.id}`}
              className="field"
              type="password"
              value={draft}
              placeholder={saved ? "•••••••• (paste to replace)" : p.placeholder}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {draft.trim() ? (
              <button
                className="btn ink"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    // using a new key straight away is almost always what you want
                    const s = await api.saveSettings({ keys: { [p.id]: draft.trim() }, provider: p.id });
                    setDraft("");
                    setReload((n) => n + 1);
                    return s;
                  }, "Key saved")
                }
              >
                Save
              </button>
            ) : saved ? (
              <button className="btn quiet" disabled={busy} onClick={() => void run(() => api.saveSettings({ keys: { [p.id]: null } }), "Key removed")}>
                Remove
              </button>
            ) : null}
          </div>

          {ready && (
            <>
              <div className="models-head">
                <span className="key-head-text">Model</span>
                {models && models.length > SHOWN && (
                  <input className="field models-filter" aria-label={`Find a ${p.name} model`} placeholder="Find a model" value={filter} onChange={(e) => setFilter(e.target.value)} />
                )}
              </div>
              {!models && !error && <p className="hint models-note">Loading the models your key can use…</p>}
              {error && (
                <p className="hint bad models-note" role="alert">
                  {error}{" "}
                  <button className="link" onClick={() => setReload((n) => n + 1)}>
                    Try again
                  </button>
                </p>
              )}
              {models && (
                <div className="models" role="radiogroup" aria-label={`${p.name} model`}>
                  {folded.map((m) => {
                    const on = using && m.id === state.choice.model;
                    return (
                      <button key={m.id} role="radio" aria-checked={on} className={`model${on ? " on" : ""}`} disabled={busy} onClick={() => !on && use(m)}>
                        <span className="body">
                          <span className="model-name">{m.label}</span>
                          {m.label !== m.id && <span className="model-id">{m.id}</span>}
                        </span>
                        {on && <Check size={18} />}
                      </button>
                    );
                  })}
                  {models.length > 0 && list.length === 0 && <p className="hint models-note">No model matches "{filter}".</p>}
                  {!all && !filter.trim() && list.length > SHOWN && (
                    <button className="link models-more" onClick={() => setAll(true)}>
                      Show all {list.length}
                    </button>
                  )}
                </div>
              )}
              <details className="manual">
                <summary>Type a model name instead</summary>
                <div className="field-row">
                  <input id={`model-${p.id}`} className="field" aria-label={`${p.name} model name`} value={manual} placeholder={state.providers.find((x) => x.id === p.id)?.defaultModel} onChange={(e) => setManual(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                  <button className="btn ink" disabled={busy || !manual.trim()} onClick={() => use({ id: manual.trim(), label: manual.trim() })}>
                    Use
                  </button>
                </div>
              </details>
            </>
          )}

          {p.id === "openai" && (
            <details className="manual" open={!!state.keys.openaiBaseUrl}>
              <summary>Use your own model server</summary>
              <div className="field-row">
                <input id="base-url" className="field" aria-label="Your own model server" value={baseUrl} placeholder="http://192.168.1.20:11434/v1" onChange={(e) => setBaseUrl(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" />
                {baseUrl.trim() !== state.keys.openaiBaseUrl && (
                  <button className="btn ink" disabled={busy} onClick={() => void run(() => api.saveSettings({ openaiBaseUrl: baseUrl }), "Saved")}>
                    Save
                  </button>
                )}
              </div>
              <p className="hint" style={{ marginLeft: 0 }}>
                Any OpenAI-compatible server, like Ollama or LM Studio on your computer. Its models show up in the list above.
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
