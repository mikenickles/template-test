// Making and changing things: agents, rooms, settings and schedules, each in a dialog.
import { useEffect, useState } from '/vendor/hooks.mjs';
import { api, onThisPC } from './api.js';
import { Avatar, CHARACTERS, characterOf, randomAvatar, tint } from './avatar.js';
import { Icon, Modal, Pill, Switch, formatCost, formatTokens, html } from './ui.js';

const ABILITIES = [
  ['web', 'globe', 'Search the web', 'Look things up and read pages, with sources.'],
  ['code', 'code', 'Run code', 'Calculate and work through data in a private sandbox.'],
  ['files', 'folder', 'Read your files', null],
  ['memory', 'memory', 'Remember things', 'Keeps notes when you ask it to remember something, for every room.'],
  ['crew', 'hire', 'Build your crew', 'Hires new agents when you ask: writes their instructions, asks which model to use, picks a free look.'],
  ['google', 'mail', 'Use your Google account', null],
];

const LEVELS = [['off', 'Off'], ['gentle', 'Gentle'], ['active', 'Active']];

export function AgentEditor({ agent, state, notify, onClose, onSaved, onChanged, onAddKey }) {
  const fresh = !agent;
  const live = state.agents.find((a) => a.id === agent?.id) ?? agent;
  const firstProvider = state.providers.find((p) => p.configured && p.models.length && p.id !== 'demo') ?? state.providers.find((p) => p.id === 'demo');
  const [avatar, setAvatar] = useState(agent?.avatar ?? randomAvatar());
  const [name, setName] = useState(agent?.name ?? '');
  const [role, setRole] = useState(agent?.role ?? '');
  const [provider, setProvider] = useState(agent?.provider ?? firstProvider?.id ?? '');
  const [model, setModel] = useState(agent?.model ?? firstProvider?.models[0] ?? '');
  const [instructions, setInstructions] = useState(agent?.instructions ?? '');
  const [abilities, setAbilities] = useState(new Set(agent?.abilities ?? ['memory']));
  const [proactive, setProactive] = useState(agent?.proactive ?? 'off');
  const [models, setModels] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = state.providers.find((p) => p.id === provider);

  useEffect(() => {
    setModels(chosen?.models ?? []);
    if (provider) api.models(provider).then((r) => r.models.length && setModels(r.models)).catch(() => {});
  }, [provider]);

  const save = async () => {
    setBusy(true);
    try {
      await api.saveAgent({ ...(agent ?? {}), name: name.trim(), role: role.trim(), instructions: instructions.trim(), provider, model: model.trim(), avatar, abilities: [...abilities], proactive });
      onSaved();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete ${agent.name}? It leaves every room it's in.`)) return;
    try {
      await api.deleteAgent(agent.id);
      onSaved();
    } catch (e) {
      notify(e.message);
    }
  };
  const toggle = (key) => {
    const next = new Set(abilities);
    next.has(key) ? next.delete(key) : next.add(key);
    setAbilities(next);
  };
  const remember = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await api.addMemory(agent.id, note.trim());
      setNote('');
      onChanged();
    } catch (err) {
      notify(err.message);
    }
  };
  const canSave = name.trim() && provider && model.trim() && !busy;
  const folders = state.folders.map((f) => f.name).join(', ');
  const google = state.google ?? {};
  const claudeReady = state.providers.some((p) => p.runsCode && p.configured);
  const detailOf = (key, detail) => {
    if (key === 'code' && chosen?.abilities && !chosen?.runsCode) return "Claude models only: it runs in Anthropic's private sandbox.";
    if (key === 'web' && chosen?.abilities && !chosen?.runsCode && !claudeReady) return 'Reads pages. Searching needs an Anthropic key on the hub.';
    if (detail) return detail;
    if (key === 'google') {
      return google.connected
        ? `Gmail, Calendar and Drive for ${google.email || 'your account'}. Reads mail and saves drafts, never sends.`
        : 'Gmail, Calendar and Drive. Connect Google in Settings on this PC first.';
    }
    return folders ? `Read only, from ${folders}.` : "Read only. Share folders from the PC's Treehouse page first.";
  };
  const who = name.trim() || 'This agent';

  return html`<${Modal} title=${fresh ? 'New agent' : 'Edit agent'} onClose=${onClose}
    actions=${html`<button class="button" style="height:36px;padding:0 18px" disabled=${!canSave} onClick=${save}>${fresh ? 'Create' : 'Save'}</button>`}>
    <div class="identity" style=${`--wash:${tint(avatar)}`}>
      <${Avatar} key=${characterOf(avatar).number} spec=${avatar} size=${96} style="animation:pop .45s cubic-bezier(.34,1.56,.64,1)" />
      <div class="title-l" style=${`margin-top:16px;${name.trim() ? '' : 'color:var(--text-3)'}`}>${name.trim() || 'New agent'}</div>
      ${role.trim() && html`<div class="muted">${role}</div>`}
      ${model && html`<div class="mono faint" style="margin-top:8px">${model}</div>`}
      <button class="icon-button" style="position:absolute;top:12px;right:12px;background:var(--raised)" aria-label="Shuffle avatar" title="Shuffle" onClick=${() => setAvatar(randomAvatar())}><${Icon} name="dice" /></button>
    </div>

    <div class="section-title">Look</div>
    <label class="field-label">Character · ${characterOf(avatar).name}</label>
    <div class="characters" role="radiogroup" aria-label="Character">${CHARACTERS.map((c) => html`<button class=${`character${characterOf(avatar).number === c.number ? ' selected' : ''}`} role="radio" aria-label=${c.name} title=${c.name} aria-checked=${characterOf(avatar).number === c.number} style=${`--wash:${c.fill}`} onClick=${() => setAvatar({ character: c.number })}><img src=${c.image} alt="" draggable="false" /></button>`)}</div>

    <div class="section-title">Identity</div>
    <label class="field-label" for="agent-name">Name</label>
    <input id="agent-name" class="field" placeholder="Nova" maxlength="40" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />
    <label class="field-label" for="agent-role" style="margin-top:16px">Role</label>
    <input id="agent-role" class="field" placeholder="the planner" maxlength="80" value=${role} onInput=${(e) => setRole(e.currentTarget.value)} />

    <div class="section-title">Model</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${state.providers.map((p) => html`<${Pill} label=${p.label} selected=${p.id === provider} dimmed=${!p.configured}
      onClick=${() => { if (p.id !== provider) { setProvider(p.id); setModel(p.models[0] ?? ''); } }} />`)}</div>
    ${chosen && !chosen.configured && html`<div class="row" style="padding:12px 0 0;min-height:0">
      <span class="body-s muted" style="flex:1">${chosen.label} needs an API key before this agent can reply.</span>
      ${chosen.takesKey && html`<${Pill} label="Add key" onClick=${onAddKey} />`}
    </div>`}
    <label class="field-label" for="agent-model" style="margin-top:16px">Model id</label>
    <input id="agent-model" class="field mono" style="font-size:15px" list="model-ids" value=${model} onInput=${(e) => setModel(e.currentTarget.value)} />
    <datalist id="model-ids">${models.map((m) => html`<option value=${m} />`)}</datalist>

    <div class="section-title">Abilities</div>
    ${!chosen?.abilities && html`<p class="body-s muted" style="margin:0 0 12px">Demo agents can't use abilities. Switch this agent to a real model to use them.</p>`}
    <div class="card">${ABILITIES.map(([key, icon, title, detail]) => {
      // Running code needs Anthropic's sandbox, so only Claude agents can turn it on.
      const off = !chosen?.abilities || (key === 'code' && !chosen?.runsCode);
      return html`<button class=${`ability${off ? ' disabled' : ''}`} role="switch" aria-checked=${abilities.has(key)}
      disabled=${off} onClick=${() => toggle(key)}>
      <${Icon} name=${icon} />
      <div style="flex:1"><div class="title-s">${title}</div><div class="body-s muted">${detailOf(key, detail)}</div></div>
      <${Switch} on=${abilities.has(key)} disabled=${off} />
    </button>`;
    })}</div>

    <div class="section-title">Reaches out</div>
    <div style="display:flex;gap:8px">${LEVELS.map(([level, label]) => html`<${Pill} label=${label} selected=${proactive === level} onClick=${() => setProactive(level)} />`)}</div>
    <p class="body-s muted" style="margin:12px 0 0">${proactive === 'gentle'
      ? `About once a day, ${who === 'This agent' ? 'this agent' : who} looks over your chats and writes to you only when something is worth it: a deadline coming up, a plan for today.`
      : proactive === 'active'
        ? `A few times a day, ${who === 'This agent' ? 'this agent' : who} looks over your chats, and your calendar and email if it can, and writes when something needs you.`
        : `${who} only replies when you write.`}${proactive !== 'off' && chosen?.abilities ? ' It can also follow up later and keep an eye on things for you.' : ''}</p>

    ${live && html`<div class="section-title">Memory</div>
      ${live.memory?.length
        ? html`<div class="card">${live.memory.map((n) => html`<div class="row">
            <div style="flex:1"><div>${n.text}</div><div class="caption faint">${n.source === 'agent' ? `Saved by ${live.name}` : 'Added by you'}</div></div>
            <button class="icon-button" aria-label=${`Forget "${n.text}"`} onClick=${() => api.removeMemory(live.id, n.id).then(onChanged).catch((e) => notify(e.message))}><${Icon} name="close" size=${18} /></button>
          </div>`)}</div>`
        : html`<p class="body-s muted" style="margin:0 0 12px">Nothing yet. Add what ${live.name} should keep in mind everywhere, like how you like answers.</p>`}
      <form style="display:flex;gap:8px;margin-top:12px" onSubmit=${remember}>
        <input class="field" placeholder="Add something to remember" maxlength="300" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} />
        <button class="button secondary" disabled=${!note.trim()}>Add</button>
      </form>`}

    <div class="section-title">Instructions</div>
    <textarea class="field" rows="6" placeholder="How should this agent think, behave, and help the crew?" value=${instructions} onInput=${(e) => setInstructions(e.currentTarget.value)}></textarea>
    ${!fresh && html`<button class="button danger" style="margin-top:32px" onClick=${remove}>Delete agent</button>`}
  <//>`;
}

export function RoomEditor({ room, state, notify, onClose, onSaved }) {
  const fresh = !room;
  const [name, setName] = useState(room?.name ?? '');
  const [members, setMembers] = useState(room?.agentIds ?? []);
  // New rooms start as best fit: only the agents suited to each message answer it.
  const [mode, setMode] = useState(room?.mode ?? 'auto');
  const [description, setDescription] = useState(room?.description ?? '');
  const [leadId, setLeadId] = useState(room?.leadId ?? null);
  const toggle = (id) => setMembers(members.includes(id) ? members.filter((m) => m !== id) : [...members, id]);
  const lead = members.includes(leadId) ? leadId : members[0];
  const save = async () => {
    try {
      const saved = await api.saveRoom({ ...(room ?? {}), name: name.trim(), agentIds: members, mode, leadId: mode === 'lead' ? lead : null, description: description.trim() });
      onSaved(saved.id);
    } catch (e) {
      notify(e.message);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete ${room.name} and its messages?`)) return;
    try {
      await api.deleteRoom(room.id);
      onSaved(null);
    } catch (e) {
      notify(e.message);
    }
  };
  return html`<${Modal} title=${fresh ? 'New room' : 'Edit room'} onClose=${onClose}
    actions=${html`<button class="button" style="height:36px;padding:0 18px" disabled=${!name.trim() || !members.length} onClick=${save}>${fresh ? 'Create' : 'Save'}</button>`}>
    <label class="field-label" for="room-name">Name</label>
    <input id="room-name" class="field" placeholder="Launch plan" maxlength="60" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />
    <label class="field-label" for="room-description" style="margin-top:18px">Description</label>
    <textarea id="room-description" class="field" rows="3" maxlength="2000" value=${description} onInput=${(e) => setDescription(e.currentTarget.value)}
      placeholder="What this room is for, and rules for everyone in it. For example: We're planning a trip to Japan in April. Keep replies short."></textarea>
    <p class="note" style="margin-top:6px">Every agent in this room reads it before answering.</p>
    <div class="section-title">Crew</div>
    ${state.agents.length
      ? html`<div style="display:flex;flex-wrap:wrap;gap:8px">${state.agents.map((a) => html`<${Pill} label=${a.name} selected=${members.includes(a.id)} onClick=${() => toggle(a.id)}><${Avatar} spec=${a.avatar} size=${24} /><//>`)}</div>`
      : html`<p class="muted">Make an agent first, then put it in a room.</p>`}
    <div class="section-title">Who answers</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <${Pill} label="Best fit" selected=${mode === 'auto'} onClick=${() => setMode('auto')} />
      <${Pill} label="One leads" selected=${mode === 'lead'} onClick=${() => setMode('lead')} />
      <${Pill} label="Round table" selected=${mode === 'roundtable'} onClick=${() => setMode('roundtable')} />
    </div>
    <p class="note">${mode === 'auto'
      ? 'Only the agent or two best suited to each message answer it. Talk to the whole group ("what do you all think?") and everyone joins in.'
      : mode === 'lead' ? 'The lead answers first, brings in the others with @mentions, then sums up.' : 'Everyone answers in turn.'} Mention someone with @ to ask them directly.</p>
    ${mode === 'lead' && members.length > 1 && html`<label class="field-label" style="margin-top:18px">Lead</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${members.map((id) => state.agents.find((a) => a.id === id)).filter(Boolean).map((a) => html`<${Pill} label=${a.name} selected=${a.id === lead} onClick=${() => setLeadId(a.id)}><${Avatar} spec=${a.avatar} size=${24} /><//>`)}</div>`}
    ${!fresh && html`<button class="button danger" style="margin-top:32px" onClick=${remove}>Delete room</button>`}
  <//>`;
}

/** Ollama says "llama3.2:latest" for "llama3.2". */
const sameModel = (a, b) => (a.includes(':') ? a : `${a}:latest`) === (b.includes(':') ? b : `${b}:latest`);

/** A model runtime on this PC (Ollama): is it running, what it has, and small models to download. */
function LocalPanel({ provider: p, model, setModel, error, onPull, onDismiss }) {
  const download = p.download && !p.download.error ? p.download : null;
  const busy = !p.running || Boolean(download);
  const name = p.label.replace(/ \(.*\)$/, '');
  return html`<div class="local-panel">
    <p class="muted" style="margin:0">${!p.running
      ? html`${name} runs AI models on this PC, free and private. ${p.installUrl && html`<a href=${p.installUrl} target="_blank" rel="noopener noreferrer">Download ${name}</a>`}, install it and open it. This page notices within a few seconds.`
      : p.models.length ? `On this PC: ${p.models.join(', ')}. Pick a model in an agent's Model section.`
      : 'Running, with no models yet. Download one below; it stays on this PC.'}</p>
    ${p.suggestions.map((s) => {
      const have = p.models.some((m) => sameModel(m, s.model));
      const here = download && sameModel(download.model, s.model);
      return html`<div class="suggestion">
        <div style="flex:1"><div class="title-s">${s.label}</div><div class="body-s faint">${s.size} · ${s.note}</div>
          ${here && html`<div class="meter"><span style=${`width:${Math.max(2, download.percent)}%`}></span></div>`}</div>
        ${have ? html`<span class="label" style="color:var(--live)">On this PC</span>`
          : here ? html`<span class="label">${download.percent}%</span>`
          : html`<button class="pill" disabled=${busy} onClick=${() => onPull(s.model)}>Get</button>`}
      </div>`;
    })}
    ${download && !p.suggestions.some((s) => sameModel(s.model, download.model)) && html`<div>
      <div class="body-s faint">Downloading ${download.model} · ${download.percent}%</div>
      <div class="meter"><span style=${`width:${Math.max(2, download.percent)}%`}></span></div></div>`}
    <form style="display:flex;gap:8px" onSubmit=${(e) => { e.preventDefault(); onPull(model); }}>
      <input class="field mono" style="flex:1;font-size:15px" placeholder="Any model, e.g. qwen3:4b" title="Any model name from ollama.com/library" value=${model} onInput=${(e) => setModel(e.currentTarget.value)} />
      <button class="button" disabled=${busy || !model.trim()}>Download</button>
    </form>
    ${(error || p.download?.error) && html`<p class="error-text" style="margin:0">${error || p.download.error}
      ${!error && html` <button type="button" class="label muted" onClick=${onDismiss}>Dismiss</button>`}</p>`}
    <p class="note" style="margin:0">Local models run on this PC's processor: free and private, but slower and not as clever as online ones. They can't search the web, run code or read your folders.</p>
  </div>`;
}

export function Settings({ state, notify, refresh, onClose, onIntro, onUpdate }) {
  const [open, setOpen] = useState(null);
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [keyError, setKeyError] = useState(null);
  const [usage, setUsage] = useState(null);
  const [canPick, setCanPick] = useState(false);
  const [path, setPath] = useState('');
  const profile = state.profile ?? { name: '', notes: [] };
  const [name, setName] = useState(profile.name);
  const [fact, setFact] = useState('');
  const byName = Object.fromEntries(state.agents.map((a) => [a.name, a]));
  const aboutYou = (work) => work().then(refresh).catch((e) => notify(e.message));
  const [lookingForUpdates, setLookingForUpdates] = useState(false);
  const checkNow = async () => {
    setLookingForUpdates(true);
    try {
      const found = await api.checkForUpdates();
      await refresh();
      notify(found.feed?.error ?? (found.hub.available ? `Treehouse ${found.hub.available} is ready to install.` : 'Treehouse is up to date.'));
    } catch (e) {
      notify(e.message);
    } finally {
      setLookingForUpdates(false);
    }
  };

  // While a local runtime's panel is open, keep its status fresh: quickly during a download.
  const local = state.providers.find((p) => p.id === open && p.local);
  const pulling = Boolean(local?.download && !local.download.error);
  useEffect(() => {
    if (!local) return undefined;
    const timer = setInterval(() => refresh(), pulling ? 1000 : 4000);
    return () => clearInterval(timer);
  }, [local?.id, pulling]);
  const pull = (provider, model) => {
    if (!model.trim()) return;
    api.pullModel(provider.id, model.trim()).then(() => { setKey(''); return refresh(); }).catch((e) => setKeyError(e.message));
  };

  useEffect(() => {
    api.usage(30).then(setUsage).catch(() => {});
    if (onThisPC) api.pairInfo().then((p) => setCanPick(p.canPick)).catch(() => {});
  }, []);

  const saveKey = async (provider) => {
    setChecking(true);
    setKeyError(null);
    try {
      await api.setKey(provider.id, key.trim());
      setKey('');
      setOpen(null);
      notify(`${provider.label} key saved. Agents on ${provider.label} can reply now.`);
      await refresh();
    } catch (e) {
      setKeyError(e.message);
    } finally {
      setChecking(false);
    }
  };
  const folders = async (work) => {
    try {
      await work();
      setPath('');
      await refresh();
    } catch (e) {
      notify(e.message);
    }
  };
  const total = usage?.total;

  return html`<${Modal} title="Settings" onClose=${onClose}>
    <div class="card"><div class="row">
      <div style="flex:1"><div class="title-m">${state.hub.name || 'Your hub'}</div><div class="mono faint" style="margin-top:3px">${location.host}</div></div>
      <span class="dot live"></span><span class="label" style="color:var(--live)">Online</span>
    </div>
    ${state.hub.remote?.length > 0 && html`<div class="row"><span class="muted" style="flex:1">Away from home</span><span class="mono faint">${state.hub.remote[0]}</span></div>`}
    <div class="row"><span class="muted" style="flex:1">Version</span><span class="mono">${state.hub.version}</span></div></div>

    <div class="section-title">Updates</div>
    <div class="card">
      <div class="row"><span style="flex:1">
        <div class="title-s">Treehouse on this PC</div>
        <div class="body-s muted">${state.updates?.hub.available ? `Version ${state.updates.hub.available} is ready to install` : `Version ${state.hub.version}, up to date`}</div></span>
        ${state.updates?.hub.available && html`<button class="button" onClick=${onUpdate}>Update</button>`}</div>
      <div class="row"><span style="flex:1">
        <div class="title-s">Treehouse on your phone</div>
        <div class="body-s muted">${state.updates?.app.available ? `Version ${state.updates.app.available} is ready. Open Treehouse on the phone, Settings, Update.` : 'Nothing new waiting'}</div></span></div>
      <div class="row"><span style="flex:1;min-width:0">
        <div class="title-s">Updates folder</div>
        <div class="mono faint" style="overflow-wrap:anywhere">${state.updates?.folder}</div></span>
        ${onThisPC && html`<button class="pill" onClick=${() => api.openUpdates().catch((e) => notify(e.message))}>Open folder</button>`}</div>
    </div>
    ${state.updates?.feed?.enabled && html`<div class="note" style="display:flex;align-items:center;gap:12px">
      <span style=${`flex:1;${state.updates.feed.error ? 'color:var(--danger)' : ''}`}>${lookingForUpdates || state.updates.feed.checking ? 'Looking in your Google Drive…'
        : state.updates.feed.error ?? `Treehouse checks your Google Drive for new versions every few hours.${state.updates.feed.checkedAt ? ` Last checked ${new Date(state.updates.feed.checkedAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}`}</span>
      <button class="pill" disabled=${lookingForUpdates} onClick=${checkNow}>Check now</button></div>`}
    <p class="note">New versions ${state.updates?.feed?.enabled ? 'arrive from your Google Drive by themselves, or' : 'arrive'} as two files: <span class="mono">orbit-hub-X.Y.Z.zip</span> for this PC and <span class="mono">orbit-X.Y.Z.apk</span> for the phone, saved in the updates folder. An Update button then appears here and in the phone app.</p>

    <div class="section-title">About you</div>
    <div class="card">
      <form class="row" onSubmit=${(e) => { e.preventDefault(); aboutYou(() => api.setProfileName(name.trim())); }}>
        <input class="field" style="flex:1" placeholder="What should your crew call you?" maxlength="40" value=${name} onInput=${(e) => setName(e.currentTarget.value)} aria-label="Your name" />
        ${name.trim() !== profile.name && html`<button class="button">Save</button>`}
      </form>
      ${profile.notes.map((n) => html`<div class="about-note">
        <div style="flex:1"><div>${n.text}</div>
          <div class="who caption faint">${byName[n.source] && html`<${Avatar} spec=${byName[n.source].avatar} size=${16} />`}${n.source === 'you' ? 'Added by you' : `Learned by ${n.source}`}</div></div>
        <button class="icon-button" aria-label=${`Forget "${n.text}"`} title="Forget" onClick=${() => aboutYou(() => api.removeProfileNote(n.id))}><${Icon} name="close" /></button>
      </div>`)}
      <form class="row" style="border-top:1px solid var(--hairline)" onSubmit=${(e) => { e.preventDefault(); if (fact.trim()) aboutYou(async () => { await api.addProfileNote(fact.trim()); setFact(''); }); }}>
        <input class="field" style="flex:1" placeholder="Add something about you" maxlength="300" value=${fact} onInput=${(e) => setFact(e.currentTarget.value)} />
        <button class="button" disabled=${!fact.trim()}>Add</button>
      </form>
    </div>
    <p class="note">Every agent in your crew knows this, in every room, and they add to it as they learn about you.
      ${state.providers.some((p) => p.abilities && p.configured) && html` <button class="label" onClick=${onIntro}>Chat with your guide</button>`}</p>

    <${ProactiveSettings} state=${state} notify=${notify} refresh=${refresh} />
    <${GoogleSettings} state=${state} notify=${notify} refresh=${refresh} />

    <div class="section-title">Model providers</div>
    <div class="card">${state.providers.map((p) => html`<div>
      <button class="row button-row" disabled=${!p.takesKey && !p.local} onClick=${() => { setOpen(open === p.id ? null : p.id); setKey(''); setKeyError(null); }}>
        <div style="flex:1"><div class="title-s">${p.label}</div>${p.keyHint && html`<div class="mono faint">Key ${p.keyHint}</div>`}</div>
        ${p.id === 'demo' ? html`<span class="label faint">Built in</span>`
          : p.download && !p.download.error ? html`<span class="label faint">Downloading ${p.download.percent}%</span>`
          : p.configured ? html`<span class="dot live"></span><span class="label" style="color:var(--live)">Ready</span>`
          : html`<span class="label faint">${p.takesKey ? 'Add key' : p.running ? 'Get a model' : 'Not running'}</span>`}
        ${(p.takesKey || p.local) && html`<${Icon} name="chevron" size=${18} />`}
      </button>
      ${open === p.id && p.local && html`<${LocalPanel} provider=${p} model=${key} setModel=${(v) => { setKey(v); setKeyError(null); }} error=${keyError}
        onPull=${(model) => pull(p, model)} onDismiss=${() => api.clearDownload(p.id).then(refresh).catch(() => {})} />`}
      ${open === p.id && !p.local && html`<form class="row" style="flex-wrap:wrap;border-top:1px solid var(--hairline)" onSubmit=${(e) => { e.preventDefault(); saveKey(p); }}>
        <input class="field mono" style="flex:1;min-width:220px;font-size:15px" type="password" autocomplete="off" placeholder=${`Paste your ${p.label} key`} value=${key} onInput=${(e) => { setKey(e.currentTarget.value); setKeyError(null); }} autofocus />
        <button class="button" disabled=${!key.trim() || checking}>${checking ? 'Checking' : 'Save key'}</button>
        ${keyError && html`<p class="error-text" style="width:100%;margin:0">${keyError}</p>`}
        <div style="width:100%;display:flex;gap:16px;align-items:center">
          ${p.keyUrl && html`<a class="label" href=${p.keyUrl} target="_blank" rel="noopener noreferrer">Get a key from ${new URL(p.keyUrl).host}</a>`}
          <span style="flex:1"></span>
          ${p.keySource === 'app' && html`<button type="button" class="label" style="color:var(--danger)" onClick=${() => api.removeKey(p.id).then(refresh).catch((e) => notify(e.message))}>Remove key</button>`}
        </div>
      </form>`}
    </div>`)}</div>
    <p class="note">Keys are checked with the provider, then stored only on your PC.</p>

    <div class="section-title">Usage</div>
    <div class="card" style="padding:18px 18px 16px">
      ${!usage ? html`<div class="spinner"></div>`
        : !total.requests ? html`<div class="muted">Nothing in the last 30 days.</div>`
        : html`
          <div class="label muted">${total.cost > 0 ? 'Estimated spend, last 30 days' : 'Tokens, last 30 days'}</div>
          <div class="hero">${total.cost > 0 ? formatCost(total.cost) : formatTokens(total.input + total.output + total.cacheRead + total.cacheWrite)}</div>
          <div class="body-s faint">${formatTokens(total.input + total.cacheRead + total.cacheWrite)} tokens in · ${formatTokens(total.output)} out</div>
          ${(() => {
            const rows = usage.agents;
            const byCost = rows.every((r) => r.priced) && rows.some((r) => r.cost > 0);
            const measure = (r) => (byCost ? r.cost : r.input + r.output + r.cacheRead + r.cacheWrite);
            const most = Math.max(...rows.map(measure), 1e-9);
            return rows.map((r) => html`<div style="margin-top:16px" aria-label=${`${r.name}, ${r.priced || r.cost > 0 ? formatCost(r.cost) : ''}`}>
              <div style="display:flex;justify-content:space-between"><span class="title-s">${r.name}</span><span class="title-s">${r.priced || r.cost > 0 ? formatCost(r.cost) : `${formatTokens(measure(r))} tokens`}</span></div>
              <div class="meter"><span style=${`width:${Math.max(2, (measure(r) / most) * 100)}%`}></span></div>
            </div>`);
          })()}`}
    </div>
    <p class="note">Estimates from published token prices, not a bill. Web searches aren't included.</p>

    <div class="section-title">Shared folders</div>
    <div class="card">
      ${state.folders.length
        ? state.folders.map((f) => html`<div class="row"><${Icon} name="folder" />
            <div style="flex:1;min-width:0"><div class="title-s">${f.name}</div><div class="mono faint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.path}</div></div>
            <button class="label muted" onClick=${() => folders(() => api.stopSharing(f.id))}>Stop sharing</button></div>`)
        : html`<div class="row"><${Icon} name="folder" /><span class="muted">No folders shared yet</span></div>`}
    </div>
    ${onThisPC
      ? html`<form style="display:flex;gap:8px;margin-top:12px" onSubmit=${(e) => { e.preventDefault(); folders(() => api.shareFolder(path.trim())); }}>
          <input class="field" placeholder="Full path, like C:\\Users\\you\\Documents\\Notes" value=${path} onInput=${(e) => setPath(e.currentTarget.value)} />
          <button class="button secondary" disabled=${!path.trim()}>Share</button>
          ${canPick && html`<button type="button" class="button secondary" onClick=${() => folders(() => api.pickFolder())}>Choose…</button>`}
        </form>
        <p class="note">Agents with Read your files turned on can read these, never change them.</p>`
      : html`<p class="note">Folders are shared from the PC itself, in Treehouse there.</p>`}

    ${!onThisPC && html`<button class="button danger" style="margin-top:32px" onClick=${() => api.disconnect().then(() => location.reload()).catch((e) => notify(e.message))}>Disconnect this browser</button>`}
  <//>`;
}

const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Agents that speak first: who reaches out, the morning brief, quiet hours, the daily limit, and what's coming up. */
function ProactiveSettings({ state, notify, refresh }) {
  const settings = state.proactive ?? { quietStart: '21:00', quietEnd: '08:00', dailyLimit: 6, brief: { enabled: false, time: '08:00', agentId: null } };
  const save = (change) => api.saveProactive(change).then(refresh).catch((e) => notify(e.message));
  const brief = settings.brief;
  const intro = state.rooms.find((r) => r.intro);
  const writer = state.agents.find((a) => a.id === brief.agentId) ?? state.agents.find((a) => a.id === intro?.agentIds[0]) ?? state.agents[0];
  const byId = Object.fromEntries(state.agents.map((a) => [a.id, a]));
  const reaching = state.agents.filter((a) => (a.proactive ?? 'off') !== 'off');
  const plans = [...(state.followups ?? [])].sort((a, b) => a.at - b.at);
  return html`
    <div class="section-title">Proactive</div>
    <div class="card">
      <div class="row"><${Icon} name="bell" /><div style="flex:1">
        <div class="title-s">${reaching.length ? reaching.map((a) => a.name).join(', ') : 'No agent reaches out yet'}</div>
        <div class="body-s muted">${reaching.length ? 'Write to you on their own when something is worth it. Change it per agent, under Reaches out.' : 'Open an agent and choose Gentle or Active under Reaches out.'}</div></div></div>
      <button class="row button-row" role="switch" aria-checked=${brief.enabled} onClick=${() => save({ brief: { enabled: !brief.enabled } })}>
        <div style="flex:1"><div class="title-s">Morning brief</div><div class="body-s muted">A short note each morning: your day, what the crew is working on, and anything that needs you.</div></div>
        <${Switch} on=${brief.enabled} /></button>
      ${brief.enabled && html`<div class="row" style="gap:12px;flex-wrap:wrap">
        <label class="body-s muted">At <input class="field mono" style="width:auto;display:inline-block;margin-left:6px;padding:6px 10px" type="time" value=${brief.time} onChange=${(e) => save({ brief: { time: e.currentTarget.value } })} /></label>
        <label class="body-s muted">From <select class="field" style="width:auto;display:inline-block;margin-left:6px;padding:6px 10px" value=${writer?.id ?? ''} onChange=${(e) => save({ brief: { agentId: e.currentTarget.value } })}>
          ${state.agents.map((a) => html`<option value=${a.id}>${a.name}</option>`)}</select></label></div>`}
      <div class="row" style="gap:12px;flex-wrap:wrap">
        <span style="flex:1;min-width:140px"><div class="title-s">Quiet hours</div><div class="body-s muted">No check-ins then. Promised follow-ups still arrive.</div></span>
        <input class="field mono" style="width:auto;padding:6px 10px" type="time" aria-label="Quiet from" value=${settings.quietStart} onChange=${(e) => save({ quietStart: e.currentTarget.value })} />
        <span class="muted">to</span>
        <input class="field mono" style="width:auto;padding:6px 10px" type="time" aria-label="Quiet until" value=${settings.quietEnd} onChange=${(e) => save({ quietEnd: e.currentTarget.value })} />
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="title-s" style="flex:1">At most</span>
        ${[2, 4, 6, 10].map((n) => html`<${Pill} small label=${`${n} a day`} selected=${settings.dailyLimit === n} onClick=${() => save({ dailyLimit: n })} />`)}</div>
    </div>
    ${(plans.length > 0 || state.watches?.length > 0) && html`
      <div class="card" style="margin-top:12px">
        ${plans.map((f) => html`<div class="row"><${Icon} name="clock" /><div style="flex:1;min-width:0"><div class="title-s">${f.note}</div>
          <div class="body-s muted">${byId[f.agentId]?.name ?? 'An agent'} · ${when(f.at)}</div></div>
          <button class="label muted" onClick=${() => api.deleteFollowUp(f.id).then(refresh).catch((e) => notify(e.message))}>Cancel</button></div>`)}
        ${(state.watches ?? []).map((w) => html`<div class="row"><${Icon} name="bell" /><div style="flex:1;min-width:0"><div class="title-s">${w.what}${w.condition ? `, when ${w.condition}` : ''}</div>
          <div class="body-s muted">${byId[w.agentId]?.name ?? 'An agent'} checks every ${w.every}${w.lastFinding ? `. Last: ${w.lastFinding}` : ''}</div></div>
          <button class="label muted" onClick=${() => api.deleteWatch(w.id).then(refresh).catch((e) => notify(e.message))}>Stop</button></div>`)}
      </div>`}
    <p class="note">Gentle agents look over your chats about once a day, Active ones a few times a day, and stay quiet unless something is worth it. What they bring up shows on Home and on your phone.</p>`;
}

/** The user's Google account: set up and connected only on the PC. */
function GoogleSettings({ state, notify, refresh }) {
  const google = state.google ?? {};
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [editing, setEditing] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // While the consent tab is open, look for the connection to land.
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => refresh(), 2500);
    const stop = setTimeout(() => setWaiting(false), 5 * 60 * 1000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [waiting]);
  useEffect(() => { if (google.connected) setWaiting(false); }, [google.connected]);
  const saveClient = async (e) => {
    e.preventDefault();
    try {
      await api.setGoogleClient(clientId.trim(), secret.trim());
      setClientId('');
      setSecret('');
      setEditing(false);
      await refresh();
    } catch (err) {
      notify(err.message);
    }
  };
  const connect = async () => {
    try {
      const { url } = await api.connectGoogle();
      window.open(url, '_blank', 'noopener');
      setWaiting(true);
    } catch (err) {
      notify(err.message);
    }
  };
  return html`
    <div class="section-title">Google</div>
    <div class="card">
      <div class="row"><${Icon} name="mail" /><div style="flex:1;min-width:0">
        <div class="title-s">${google.connected ? google.email || 'Connected' : 'Not connected'}</div>
        <div class="body-s muted">${google.connected ? 'Gmail, Calendar and Drive' : 'Gmail, Calendar and Drive for your agents'}</div></div>
        ${google.connected
          ? html`<button class="label muted" onClick=${() => api.disconnectGoogle().then(refresh).catch((e) => notify(e.message))}>Disconnect</button>`
          : onThisPC && google.configured && !editing && html`<button class="button" disabled=${waiting} onClick=${connect}>${waiting ? 'Waiting for Google…' : 'Connect'}</button>`}
      </div>
      ${onThisPC && !google.connected && (!google.configured || editing) && html`<form class="google-setup" onSubmit=${saveClient}>
        <p class="body-s" style="margin:0 0 10px">A one-time setup, about five minutes. Google needs a key that's yours alone:</p>
        <ol class="body-s muted">
          <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">Google Cloud</a>, signed in as you, and create a project called Treehouse.</li>
          <li>Turn on the <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">Gmail API</a>, <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener noreferrer">Google Calendar API</a> and <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">Google Drive API</a> (Enable on each).</li>
          <li>Under <a href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noopener noreferrer">Google Auth Platform</a>, set it up as External with your email. Then under Audience, choose Publish app, so your access doesn't expire after a week.</li>
          <li>Under <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Clients</a>, create a client of type Desktop app, and paste its ID and secret here.</li>
        </ol>
        <input class="field mono" style="font-size:14px" placeholder="Client ID (ends in .apps.googleusercontent.com)" value=${clientId} onInput=${(e) => setClientId(e.currentTarget.value)} />
        <input class="field mono" style="font-size:14px;margin-top:8px" type="password" autocomplete="off" placeholder="Client secret" value=${secret} onInput=${(e) => setSecret(e.currentTarget.value)} />
        <div style="display:flex;gap:8px;margin-top:12px"><button class="button" disabled=${!clientId.trim() || !secret.trim()}>Save</button>
          ${editing && html`<button type="button" class="button secondary" onClick=${() => setEditing(false)}>Cancel</button>`}</div>
      </form>`}
    </div>
    <p class="note">${google.connected
      ? 'Agents with Use your Google account turned on can search and read your email and save drafts (never send), check your calendar and add events, and read your Drive. Everything stays on this PC.'
      : onThisPC
        ? html`When you connect, Google shows a warning that it hasn't verified the app: that's expected for an app only you use. Choose Advanced, then Go to Treehouse, and allow everything.${google.configured && !editing ? html` <button class="label" onClick=${() => setEditing(true)}>Change client</button>` : ''}`
        : 'Connect Google from Treehouse on your PC, in Settings there.'}</p>`;
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LETTERS = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' };
const DAY_NAMES = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
const same = (a, b) => [...a].sort().join() === [...b].sort().join();
const EVERY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];
const describeDays = (days) =>
  same(days, EVERY) ? 'Every day' : same(days, WEEKDAYS) ? 'Weekdays' : same(days, WEEKENDS) ? 'Weekends' : DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_NAMES[d]).join(', ');

export function Schedules({ room, state, notify, refresh, onClose, onRan }) {
  const schedules = state.schedules.filter((s) => s.roomId === room.id).sort((a, b) => a.time.localeCompare(b.time));
  const [editing, setEditing] = useState(null);
  const run = async (work) => {
    try {
      await work();
      await refresh();
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  };
  if (editing) {
    return html`<${ScheduleForm} room=${room} schedule=${editing === 'new' ? null : editing} onClose=${() => setEditing(null)}
      onSave=${async (s) => (await run(() => api.saveSchedule(s))) && setEditing(null)}
      onDelete=${async (s) => (await run(() => api.deleteSchedule(s.id))) && setEditing(null)}
      onRun=${async (s) => { if (await run(() => api.runSchedule(s.id))) { onClose(); onRan(); } }} />`;
  }
  return html`<${Modal} title=${`Schedules · ${room.name}`} onClose=${onClose}
    actions=${schedules.length > 0 && html`<button class="button" style="height:36px;padding:0 18px" onClick=${() => setEditing('new')}>New</button>`}>
    ${schedules.length
      ? html`<div class="card">${schedules.map((s) => html`<div class="row">
          <button style="flex:1;text-align:left" onClick=${() => setEditing(s)}>
            <div><span class="title-l" style=${s.enabled ? '' : 'color:var(--text-3)'}>${s.time}</span> <span class="label muted">${describeDays(s.days)}</span></div>
            <div class="muted" style="margin-top:2px">${s.text}</div>
            <div class="caption faint" style="margin-top:4px">${s.enabled && s.nextRunAt ? `Next: ${new Date(s.nextRunAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Paused'}</div>
          </button>
          <button role="switch" aria-checked=${s.enabled} aria-label=${s.enabled ? 'Pause' : 'Resume'} style="padding:10px" onClick=${() => run(() => api.saveSchedule({ ...s, enabled: !s.enabled }))}><${Switch} on=${s.enabled} /></button>
        </div>`)}</div>`
      : html`<div class="title-m">Nothing scheduled in ${room.name}</div>
        <p class="muted">Have the crew do something at a set time, like a morning briefing or a Friday wrap-up.</p>
        <button class="button" onClick=${() => setEditing('new')}>New schedule</button>`}
    <p class="note">Schedules run on this PC's clock while the hub is running. If the PC is off at that time, that run is skipped.</p>
  <//>`;
}

function ScheduleForm({ room, schedule, onClose, onSave, onDelete, onRun }) {
  const [text, setText] = useState(schedule?.text ?? '');
  const [time, setTime] = useState(schedule?.time ?? '08:00');
  const [days, setDays] = useState(schedule?.days ?? WEEKDAYS);
  const toggle = (d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  const save = () => onSave({ ...(schedule ?? {}), roomId: room.id, text: text.trim(), time, days, enabled: true });
  return html`<${Modal} title=${schedule ? 'Edit schedule' : 'New schedule'} onClose=${onClose}
    actions=${html`<button class="button" style="height:36px;padding:0 18px" disabled=${!text.trim() || !days.length || !time} onClick=${save}>${schedule ? 'Save' : 'Create'}</button>`}>
    <label class="field-label" for="schedule-text">Ask the crew in ${room.name}</label>
    <textarea id="schedule-text" class="field" rows="3" placeholder="Summarize today's news about solar power, in five bullets" value=${text} onInput=${(e) => setText(e.currentTarget.value)}></textarea>
    <div class="section-title">Time</div>
    <input class="field hero" style="width:auto;padding:4px 14px" type="time" value=${time} onInput=${(e) => setTime(e.currentTarget.value)} aria-label="Time" />
    <div class="section-title">Days</div>
    <div class="days">${DAY_ORDER.map((d) => html`<button class=${`day${days.includes(d) ? ' on' : ''}`} aria-pressed=${days.includes(d)} aria-label=${DAY_NAMES[d]} onClick=${() => toggle(d)}>${DAY_LETTERS[d]}</button>`)}</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <${Pill} label="Every day" selected=${same(days, EVERY)} onClick=${() => setDays(EVERY)} />
      <${Pill} label="Weekdays" selected=${same(days, WEEKDAYS)} onClick=${() => setDays(WEEKDAYS)} />
      <${Pill} label="Weekends" selected=${same(days, WEEKENDS)} onClick=${() => setDays(WEEKENDS)} />
    </div>
    <p class="note">Runs on this PC's clock while the hub is running. Results also reach your phone as a notification.</p>
    ${schedule && html`<button class="button secondary wide" style="margin-top:24px" onClick=${() => onRun(schedule)}>Run it now</button>
      <button class="button danger" style="margin-top:16px" onClick=${() => onDelete(schedule)}>Delete schedule</button>`}
  <//>`;
}
