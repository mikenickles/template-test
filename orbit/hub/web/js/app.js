// Treehouse for the desktop: the same rooms and crew as the phone, in a window on the PC.
import { render } from '/vendor/preact.mjs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from '/vendor/hooks.mjs';
import { ATTACHABLE, api, canAttach, hubEvents, onThisPC, prepare, roomEvents } from './api.js';
import { Avatar, CrewTile, GroupPortrait, More, Portrait, characterOf, faceOf, inkColor, tint } from './avatar.js';
import { AgentEditor, RoomEditor, Schedules, Settings } from './editors.js';
import { ToolCard, splitAtCards } from './cards.js';
import { closeOpenMarkup, markdown } from './markdown.js';
import { Treehouse } from './treehouse.js';
import { Icon, Mark, Modal, Pill, Switch, ago, fileSize, formatCost, formatTokens, html } from './ui.js';

// ---------- The app ----------

function App() {
  const [phase, setPhase] = useState('loading'); // loading, connect, offline, ready
  const [state, setState] = useState(null);
  const [roomId, setRoomId] = useState(() => decodeURIComponent(location.hash.slice(1)) || null);
  const [dialog, setDialog] = useState(null);
  // A room the sidebar's search is narrowed to, from "Search this room".
  const [searchRoom, setSearchRoom] = useState(null);
  const [toast, setToast] = useState(null);
  const [updating, setUpdating] = useState(null); // { version, failed } while the hub installs an update and restarts
  const toastTimer = useRef();

  const notify = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.state();
      setState(fresh);
      setPhase('ready');
      return fresh;
    } catch (e) {
      if (e.status === 401) {
        // On the PC itself there's no code to type: the hub signs this browser in.
        if (onThisPC) {
          try {
            await api.connectHere();
            const fresh = await api.state();
            setState(fresh);
            setPhase('ready');
            return fresh;
          } catch {
            // fall through to the code screen
          }
        }
        setPhase('connect');
      } else {
        setPhase((p) => (p === 'ready' ? p : 'offline'));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, []);
  // Rooms start and finish replies elsewhere too; the hub says when, and a slow poll catches the rest.
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const stop = hubEvents(refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [phase]);
  useEffect(() => {
    const onHash = () => setRoomId(decodeURIComponent(location.hash.slice(1)) || null);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const openRoom = (id) => {
    location.hash = id ? encodeURIComponent(id) : '';
  };
  // Installs the update waiting in the hub's updates folder; the hub restarts, then this page reloads.
  const startUpdate = async () => {
    if (state.rooms.some((r) => r.active) && !confirm('Your crew is replying right now, and an update would cut them off. Update anyway?')) return;
    setDialog(null);
    try {
      const { version } = await api.applyUpdate();
      setUpdating({ version, failed: false });
      const until = Date.now() + 120_000;
      const wait = async () => {
        const info = await api.hubInfo().catch(() => null);
        if (info?.version === version) return location.reload();
        if (Date.now() > until) return setUpdating({ version, failed: true });
        return setTimeout(wait, 1000);
      };
      setTimeout(wait, 1500);
    } catch (e) {
      notify(e.message);
    }
  };
  // The getting-to-know-you chat: started on the hub, then opened here.
  const startIntro = async () => {
    try {
      const intro = await api.startIntro();
      await refresh();
      openRoom(intro.id);
    } catch (e) {
      notify(e.message);
      if (/key/i.test(e.message)) setDialog({ type: 'settings', page: 'models' });
    }
  };

  if (phase === 'loading') return html`<div class="connect"><div class="spinner"></div></div>`;
  if (phase === 'connect') return html`<${Connect} onConnected=${refresh} />`;
  if (phase === 'offline') {
    return html`<div class="connect"><div class="center">
      <${Mark} size=${40} />
      <h1 class="title-l">Can't reach the hub</h1>
      <p class="muted">Check that Treehouse is running on the PC, then try again.</p>
      <button class="button" onClick=${refresh}>Try again</button>
    </div></div>`;
  }

  const room = state.rooms.find((r) => r.id === roomId) ?? null;
  const close = () => setDialog(null);
  // "Search this room" narrows the sidebar's search instead of opening a window.
  const openDialog = (d) => (d?.type === 'search-room' ? setSearchRoom(d.room) : setDialog(d));
  /** Deletes a room once the user confirms, from the sidebar or the room's menu. */
  const deleteRoom = async (target) => {
    if (!confirm(`Delete ${target.name}? Its chat and schedules go too. The agents stay in your crew.`)) return;
    try {
      await api.deleteRoom(target.id);
      if (target.id === room?.id) openRoom(null);
      await refresh();
      notify(`Deleted ${target.name}`);
    } catch (e) {
      notify(e.message);
    }
  };

  const edited = async (goTo) => {
    await refresh();
    if (goTo !== undefined) openRoom(goTo);
    close();
  };

  return html`<div class=${`shell${room ? ' in-room' : ''}`}>
    <${Sidebar} state=${state} roomId=${room?.id} onOpen=${openRoom} onDialog=${setDialog} onIntro=${startIntro} onUpdate=${startUpdate} onDelete=${deleteRoom}
      scope=${searchRoom} onScope=${setSearchRoom} />
    <main>
      ${room
        ? html`<${RoomView} key=${room.id} room=${room} state=${state} onDialog=${openDialog} notify=${notify} onBack=${() => openRoom(null)} onDelete=${() => deleteRoom(room)}
            onOpenRoom=${(id) => refresh().then(() => openRoom(id))} onStale=${refresh} />`
        : html`<${Welcome} state=${state} onDialog=${setDialog} onIntro=${startIntro} onOpen=${openRoom}
            onDismiss=${(id) => api.dismissNudge(id).then(refresh).catch((e) => notify(e.message))} />`}
    </main>
    ${dialog?.type === 'agent' && html`<${AgentEditor} agent=${dialog.agent} state=${state} notify=${notify} onClose=${close} onSaved=${() => edited()} onChanged=${refresh} onAddKey=${() => setDialog({ type: 'settings', page: 'models' })} />`}
    ${dialog?.type === 'room' && html`<${RoomEditor} room=${dialog.room} state=${state} notify=${notify} onClose=${close} onSaved=${(id) => edited(id)} />`}
    ${dialog?.type === 'settings' && html`<${Settings} page=${dialog.page} state=${state} notify=${notify} refresh=${refresh} onClose=${close} onIntro=${() => { close(); startIntro(); }} onUpdate=${startUpdate} />`}
    ${updating && html`<div class="updating" role="alertdialog" aria-live="polite">
      ${updating.failed
        ? html`<div class="center"><${Mark} size=${40} /><h1 class="title-l">Treehouse hasn't come back yet</h1>
            <p class="muted">The update to ${updating.version} was installed, but the hub didn't answer. Look at its window on the PC. If it closed, start Treehouse again.</p>
            <button class="button" onClick=${() => location.reload()}>Try again</button></div>`
        : html`<div class="center"><div class="spinner" style="margin:0 auto 18px"></div><h1 class="title-l">Updating Treehouse</h1>
            <p class="muted">Installing ${updating.version}. This takes a few seconds, and the page reloads by itself.</p></div>`}
    </div>`}
    ${dialog?.type === 'members' && html`<${Members} room=${state.rooms.find((r) => r.id === dialog.room.id) ?? dialog.room} state=${state} onClose=${close}
      onMessage=${(agent) => { close(); dispatchEvent(new CustomEvent('treehouse:mention', { detail: agent.name })); }}
      onAdd=${(id) => { const r = state.rooms.find((x) => x.id === dialog.room.id); api.saveRoom({ ...r, agentIds: [...r.agentIds, id] }).then(refresh).catch((e) => notify(e.message)); }} />`}
    ${dialog?.type === 'tokens' && html`<${Tokens} room=${dialog.room} notify=${notify} onClose=${close} />`}
    ${dialog?.type === 'schedules' && html`<${Schedules} room=${dialog.room} state=${state} notify=${notify} refresh=${refresh} onClose=${close} onRan=${() => openRoom(dialog.room.id)} />`}
    ${toast && html`<div class="toast" role="status">${toast}</div>`}
  </div>`;
}

/** A browser on another computer pairs with the code shown on the PC, like a phone. */
function Connect({ onConnected }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.pair(code.replace(/\D/g, ''));
      await onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="connect"><form class="card" onSubmit=${submit}>
    <div class="wordmark"><${Mark} size=${26} /> Treehouse</div>
    <h1 class="title-l" style="margin:24px 0 6px">Connect to your hub</h1>
    <p class="muted" style="margin:0 0 22px">Type the six-digit code your PC shows. On the PC, it's at <span class="mono">localhost:8787/pair</span>.</p>
    <input class="field code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" value=${code}
      onInput=${(e) => setCode(e.currentTarget.value)} aria-label="Pairing code" autofocus />
    ${error && html`<p class="error-text">${error}</p>`}
    <button class="button wide" style="margin-top:18px" disabled=${busy || code.replace(/\D/g, '').length !== 6}>${busy ? 'Connecting' : 'Connect'}</button>
  </form></div>`;
}

function Sidebar({ state, roomId, onOpen, onDialog, onIntro, onUpdate, onDelete, scope = null, onScope = () => {} }) {
  const byId = useMemo(() => Object.fromEntries(state.agents.map((a) => [a.id, a])), [state.agents]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const searchBox = useRef();
  useEffect(() => { if (scope) searchBox.current?.focus(); }, [scope?.id]);
  // Asks the hub a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setFound(null); return undefined; }
    const timer = setTimeout(() => api.search(q, scope?.id).then(setFound).catch(() => setFound({ query: q, rooms: [], messages: [] })), 250);
    return () => clearTimeout(timer);
  }, [query, scope?.id]);
  const rooms = [...state.rooms].sort((a, b) => b.updatedAt - a.updatedAt);
  const intro = !state.profile?.notes?.length;
  const demo = !intro && !state.providers.some((p) => p.takesKey && p.configured);
  const guide = guideOf(state);
  return html`<aside class="sidebar">
    <div class="sidebar-head">
      <button class="hub-button" onClick=${() => onDialog({ type: 'settings' })}>
        <${Mark} size=${26} />
        <div class="names"><div class="title-s">${state.hub.name || 'Treehouse'}</div><div class="caption faint">Settings, keys and usage</div></div>
      </button>
    </div>
    <label class="sidebar-search">
      <${Icon} name="search" size=${17} />
      ${scope && html`<button class="scope-chip" title="Search every room" onClick=${() => onScope(null)}>${scope.name}<${Icon} name="close" size=${13} /></button>`}
      <input ref=${searchBox} type="search" placeholder=${scope ? 'Search this room' : 'Search rooms and messages'} value=${query} onInput=${(e) => setQuery(e.currentTarget.value.slice(0, 200))}
        onKeyDown=${(e) => { if (e.key === 'Escape') { if (query) setQuery(''); else onScope(null); } }} aria-label=${scope ? `Search ${scope.name}` : 'Search rooms and messages'} />
    </label>
    ${query.trim() || scope ? html`<div class="sidebar-scroll"><${SearchResults} found=${query.trim() ? found : undefined} byId=${byId} onOpen=${(id) => { onOpen(id); }} /></div>` : html`<div class="sidebar-scroll">
      ${state.updates?.hub.available && html`<button class="card row button-row update-banner" onClick=${onUpdate}>
        <div style="flex:1"><div class="title-s">Treehouse ${state.updates.hub.available} is ready</div>
          <div class="body-s muted">Install it now. Treehouse restarts in a few seconds.</div></div>
        <span class="pill selected">Update</span>
      </button>`}
      ${intro && html`<button class="card row button-row intro-mini" style=${`--wash:${tint(guide.avatar)}`} onClick=${() => (canIntro(state) ? onIntro() : onDialog({ type: 'settings', page: 'models' }))}>
        <${Portrait} spec=${guide.avatar} size=${36} />
        <div style="flex:1"><div class="title-s">${canIntro(state) ? 'Get to know each other' : 'Meet your guide'}</div>
          <div class="body-s muted">${canIntro(state) ? `A quick chat with ${guide.name}, so your whole crew knows you.` : 'Add an Anthropic key to start.'}</div></div>
        <${Icon} name="chevron" size=${18} />
      </button>`}
      ${demo && html`<button class="card row button-row" style="margin:6px 4px 4px;width:calc(100% - 8px)" onClick=${() => onDialog({ type: 'settings', page: 'models' })}>
        <div style="flex:1"><div class="title-s">Your crew is in demo mode</div><div class="body-s muted">Add an AI key to get real answers.</div></div>
        <${Icon} name="chevron" size=${18} />
      </button>`}
      <div class="sidebar-title">
        <span class="overline">Rooms</span>
        <button class="icon-button" aria-label="New room" title="New room" onClick=${() => onDialog({ type: 'room' })}><${Icon} name="plus" /></button>
      </div>
      ${rooms.map((room) => {
        const crew = room.agentIds.map((id) => byId[id]).filter(Boolean);
        const speaker = byId[room.speaking];
        return html`<div class="room-entry" key=${room.id}><button class=${`room-item${room.id === roomId ? ' current' : ''}`} onClick=${() => onOpen(room.id)} aria-current=${room.id === roomId ? 'page' : null}>
          <${GroupPortrait} specs=${crew.map((a) => a.avatar)} face=${faceOf(room, crew)?.avatar} size=${40} thinking=${room.active && Boolean(speaker)} />
          <div class="text">
            <div class="top">
              <span class="name">${room.name}</span>
              ${room.active
                ? html`<span class="dot" style=${`background:${speaker ? inkColor(speaker.avatar) : 'var(--text-2)'}`}></span>`
                : html`<span class="caption faint">${ago(room.updatedAt)}</span>`}
            </div>
            ${room.active
              ? html`<div class="preview shimmer">${speaker ? `${speaker.name} is replying` : 'Working'}</div>`
              : html`<div class="preview">${room.preview ? `${room.preview.author}: ${room.preview.text}` : 'No messages yet'}</div>`}
          </div>
        </button>
        <button class="icon-button room-delete" aria-label=${`Delete ${room.name}`} title="Delete room" onClick=${() => onDelete(room)}><${Icon} name="trash" size=${18} /></button></div>`;
      })}
      ${!rooms.length && html`<p class="note" style="padding:0 10px">No rooms yet. Make one to start talking to your crew.</p>`}
      <div class="sidebar-title">
        <span class="overline">Crew</span>
        <button class="icon-button" aria-label="New agent" title="New agent" onClick=${() => onDialog({ type: 'agent' })}><${Icon} name="plus" /></button>
      </div>
      <div class="crew-list">
        ${state.agents.map((agent) => html`<button class="agent-chip" onClick=${() => onDialog({ type: 'agent', agent })} title=${agent.role || agent.name}>
          <${Portrait} spec=${agent.avatar} size=${26} />${agent.name}
        </button>`)}
      </div>
    </div>`}
  </aside>`;
}

/** Bold every searched word in a snippet; the rest stays plain text. */
function highlight(text, words) {
  const pattern = words.filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!pattern) return text;
  return text.split(new RegExp(`(${pattern})`, 'gi')).map((part, i) => (i % 2 ? html`<strong>${part}</strong>` : part));
}

/** What a search found: rooms first, then messages with the words around each match. */
function SearchResults({ found, byId, onOpen }) {
  if (found === undefined) return html`<p class="note" style="padding:0 10px">Type to search this room.</p>`;
  if (!found) return html`<p class="note" style="padding:0 10px">Searching…</p>`;
  if (!found.rooms.length && !found.messages.length) return html`<p class="note" style="padding:0 10px">Nothing found for “${found.query}”.</p>`;
  const words = found.query.split(' ');
  return html`
    ${found.rooms.length > 0 && html`<div class="sidebar-title"><span class="overline">Rooms</span></div>
      ${found.rooms.map((r) => html`<button class="search-hit" onClick=${() => onOpen(r.id)}>
        <${GroupPortrait} specs=${r.agentIds.map((id) => byId[id]?.avatar).filter(Boolean)} size=${32} />
        <span class="title-s">${r.name}</span></button>`)}`}
    ${found.messages.length > 0 && html`<div class="sidebar-title"><span class="overline">Messages</span></div>
      ${found.messages.map((m) => {
        const agent = byId[m.agentId];
        return html`<button class="search-hit message" onClick=${() => onOpen(m.roomId)}>
          ${agent ? html`<${Disc} spec=${agent.avatar} size=${30} />` : html`<span class="disc you"><${Icon} name="person" size=${16} /></span>`}
          <span class="text"><span class="top"><span class="title-s" style=${agent ? `color:${inkColor(agent.avatar)}` : ''}>${m.author}</span><span class="caption faint"> · ${m.roomName} · ${ago(m.at)}</span></span>
            <span class="body-s muted">${highlight(m.snippet, words)}</span></span></button>`;
      })}`}`;
}

/** Who's in a room: each member, its model and what it's doing, a way to message one, and the rest of the crew to add. */
function Members({ room, state, onClose, onMessage, onAdd }) {
  const byId = Object.fromEntries(state.agents.map((a) => [a.id, a]));
  const members = room.agentIds.map((id) => byId[id]).filter(Boolean);
  const others = state.agents.filter((a) => !room.agentIds.includes(a.id));
  const row = (a, action) => html`<div class="member-row">
    <${Disc} spec=${a.avatar} size=${44} ring=${room.active && room.speaking === a.id} />
    <div class="text"><div class="title-s">${a.name} ${a.model && html`<span class="model-tag">${modelTag(a.model)}</span>`}</div>
      <div class="body-s" style=${room.active && room.speaking === a.id ? `color:${inkColor(a.avatar)}` : 'color:var(--text-3)'}>${room.active && room.speaking === a.id ? 'Replying now…' : a.role}</div></div>
    ${action}</div>`;
  return html`<${Modal} title=${`In ${room.name}`} onClose=${onClose}>
    <div class="card">${members.map((a) => row(a, html`<button class="pill" onClick=${() => onMessage(a)}>Message</button>`))}</div>
    ${others.length > 0 && html`<div class="overline" style="margin:22px 4px 10px">Add from your crew</div>
      <div class="card">${others.map((a) => row(a, html`<button class="pill selected" onClick=${() => onAdd(a.id)}>Add</button>`))}</div>`}
  <//>`;
}

const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const SIZE_NOTES = {
  small: 'About 5,000 tokens of recent messages, word for word. Cheapest; older messages are summarized, so agents still know what happened.',
  medium: 'About 15,000 tokens of recent messages, word for word, and a summary of the rest. A good balance.',
  large: 'About 40,000 tokens of recent messages, word for word. For long documents and detailed work; costs the most.',
};

/** A room's tokens: what each reply sends and what it's made of, the last 30 days, and ways to send less. */
function Tokens({ room, notify, onClose }) {
  const [context, setContext] = useState(null);
  const [compacting, setCompacting] = useState(false);
  const [error, setError] = useState(null);
  const show = (next) => {
    setContext(next);
    dispatchEvent(new CustomEvent('treehouse:context', { detail: { room: room.id, total: next.tokens.total } }));
  };
  useEffect(() => { api.roomContext(room.id).then(setContext).catch((e) => notify(e.message)); }, [room.id]);
  const set = (size, photos) => {
    setContext({ ...context, size, photos });
    api.setRoomContext(room.id, size, photos).then(show).catch((e) => notify(e.message));
  };
  const compact = async () => {
    setCompacting(true);
    setError(null);
    try {
      show(await api.compactRoom(room.id));
      notify('Summarized');
    } catch (e) {
      setError(e.message);
    } finally {
      setCompacting(false);
    }
  };
  if (!context) return html`<${Modal} title="Tokens" onClose=${onClose}><div class="spinner" style="margin:40px auto"></div><//>`;
  const t = context.tokens;
  const m = context.messages;
  const u = context.usage;
  const sent = u.input + u.cacheRead + u.cacheWrite;
  const parts = [
    ['instructions', t.instructions, 'Instructions and what the crew knows', ''],
    ['summary', t.summary, 'Summary of older messages', m.summarized ? `${m.summarized} messages` : ''],
    ['recent', t.recent, 'Recent messages, word for word', `${m.recent} messages`],
    ['photos', t.photos, 'Photos', ''],
  ];
  return html`<${Modal} title="Tokens" onClose=${onClose}>
    <div class="card token-hero">
      <div class="overline">Each reply in ${room.name} sends about</div>
      <div class="token-total"><span class="hero">${formatTokens(t.total)}</span> <span class="muted">tokens</span></div>
      <div class="token-bar" aria-hidden="true">${parts.filter((p) => p[1] > 0).map(([key, n]) => html`<span class=${`part-${key}`} style=${`flex:${n}`}></span>`)}</div>
      ${parts.filter((p) => p[1] > 0 || p[0] === 'recent').map(([key, n, label, detail]) => html`<div class="token-legend">
        <span class=${`dot part-${key}`}></span><span class="body-s label">${label}</span>${detail && html`<span class="body-s faint">${detail}</span>`}<span class="title-s">${formatTokens(n)}</span></div>`)}
      ${m.leftOut > 0 && html`<p class="body-s faint" style="margin:12px 0 0">${m.leftOut} older messages aren't summarized yet and aren't sent. Summarize now to fold them in.</p>`}
    </div>
    <div class="overline" style="margin:22px 4px 10px">Last ${context.days} days in this room</div>
    <div class="card">
      <div class="row"><span style="flex:1">Tokens sent</span><span class="title-s">${formatTokens(sent)}</span></div>
      <div class="row"><span style="flex:1">Tokens written by the crew</span><span class="title-s">${formatTokens(u.output)}</span></div>
      <div class="row"><div style="flex:1">Read from cache<div class="body-s faint">Cached tokens cost about a tenth</div></div><span class="title-s">${sent > 0 ? `${Math.floor((u.cacheRead * 100) / sent)}%` : 'None yet'}</span></div>
      <div class="row"><div style="flex:1">Estimated cost<div class="body-s faint">${u.requests} requests</div></div><span class="title-s">${u.cost > 0 || u.priced ? formatCost(u.cost) : 'Not priced'}</span></div>
    </div>
    <div class="overline" style="margin:22px 4px 10px">Make replies lighter</div>
    <div class="days" role="radiogroup" aria-label="Context size">${SIZES.map(([key, label]) => html`<${Pill} label=${label} selected=${context.size === key} onClick=${() => set(key, context.photos)} />`)}</div>
    <p class="body-s faint" style="margin:10px 4px 16px">${SIZE_NOTES[context.size] ?? SIZE_NOTES.medium}</p>
    <div class="card">
      <button class="row button-row" role="switch" aria-checked=${context.photos} onClick=${() => set(context.size, !context.photos)}>
        <div style="flex:1"><div class="title-s">Send photos again</div><div class="body-s muted">Off: only the newest message's photos are sent; earlier ones are mentioned by name. About 1,500 tokens saved per photo.</div></div>
        <${Switch} on=${context.photos} /></button>
      <div class="row">
        <div style="flex:1"><div class="title-s">Summarize now</div><div class="body-s muted">Folds all but the last 6 messages into the summary, written by a quick, inexpensive model.</div>
          ${error && html`<div class="body-s" style="color:var(--danger);margin-top:6px">${error}</div>`}</div>
        ${compacting ? html`<div class="spinner"></div>` : html`<button class="pill" onClick=${compact}>Summarize</button>`}
      </div>
    </div>
    <p class="body-s faint" style="margin:14px 4px 0">These only change what agents are sent. You still see the whole chat here.</p>
  <//>`;
}

/** The crew's colors glowing softly behind a screen, one agent to a corner; fewer agents take turns. Still. */
const crewWash = (tints) => [0, 1, 2, 3].map((i) => `--c${i + 1}:${tints[i % tints.length]}`).join(';');

/** An agent's portrait. [ring] circles it in its color, for whoever is speaking. */
const Disc = ({ spec, size = 40, ring = false, thinking = false }) => html`<${Portrait} spec=${spec} size=${size} ring=${ring} thinking=${thinking} />`;

/** The agent who runs the intro: its room's, else the first on Claude, else the guide a new hub would get. */
function guideOf(state) {
  const room = state.rooms.find((r) => r.intro);
  const claude = new Set(state.providers.filter((p) => p.runsCode && p.configured).map((p) => p.id));
  return state.agents.find((a) => a.id === room?.agentIds[0]) ?? state.agents.find((a) => claude.has(a.provider)) ?? { name: 'Nova', avatar: { character: 9 } };
}

// The intro needs Claude (runsCode marks it).
const canIntro = (state) => state.providers.some((p) => p.runsCode && p.configured);

function greeting() {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Home, when no room is open: a hello, the guide's invitation until the crew knows you, and the crew. */
function Welcome({ state, onDialog, onIntro, onOpen, onDismiss }) {
  const name = state.profile?.name;
  const busy = state.rooms.find((r) => r.active);
  const speaker = state.agents.find((a) => a.id === busy?.speaking);
  const intro = !state.profile?.notes?.length;
  const guide = guideOf(state);
  const introRoom = state.rooms.find((r) => r.intro);
  const speaking = new Set(state.rooms.filter((r) => r.active).map((r) => r.speaking));
  return html`<div class="home">
    <h1 class="display">${name ? html`<span class="faint">${greeting()},</span><br />${name}` : greeting()}</h1>
    ${busy
      ? html`<p class="home-chip" style=${`--wash:${speaker ? tint(speaker.avatar) : 'var(--live)'}`}>${speaker ? html`<${Portrait} spec=${speaker.avatar} size=${22} />` : html`<span class="dot"></span>`}
          <span class="shimmer">${speaker ? `${speaker.name} is replying in ${busy.name}` : `Your crew is working in ${busy.name}`}</span></p>`
      : html`<p class="muted home-sub">${!state.agents.length ? "Let's set up your crew"
          : state.agents.length === 1 ? `${state.agents[0].name} is here when you need them`
          : `Your crew of ${state.agents.length} is ready`}</p>`}
    ${intro && html`<div class="intro-card" style=${`--wash:${tint(guide.avatar)}`}>
      <div class="intro-head">
        <${Avatar} spec=${guide.avatar} size=${84} />
        <div><div class="title-l">${!canIntro(state) ? 'Meet your guide' : introRoom ? 'Pick up where you left off' : `Hi! I'm ${guide.name}`}</div>
          <div class="body" style=${`color:${inkColor(guide.avatar)}`}>${canIntro(state) ? "Let's get to know each other" : 'Your crew starts here'}</div></div>
      </div>
      <p class="muted">${canIntro(state)
        ? "A quick chat about you, what you're into and what you'd like help with. Everything I learn, your whole crew will know, and then I'll build a crew just for you."
        : 'Add an Anthropic key and your guide will get to know you, then build a crew around what you need.'}</p>
      ${canIntro(state)
        ? html`<button class="button" onClick=${onIntro}>${introRoom ? 'Continue the chat' : 'Say hello'}</button>`
        : html`<button class="button" onClick=${() => onDialog({ type: 'settings', page: 'models' })}>Add a key</button>`}
    </div>`}
    ${state.nudges?.length > 0 && html`<${NudgeCard} nudges=${[...state.nudges].reverse().slice(0, 5)} state=${state} onOpen=${onOpen} onDismiss=${onDismiss} />`}
    ${state.agents.length > 0 && html`<div class="stage-title"><span class="overline">Your crew</span>
      <button class="label muted" onClick=${() => onDialog({ type: 'room' })}>New room</button></div>
    <div class="stage faces">${state.agents.map((agent) => html`<button class="stage-member" title=${`Edit ${agent.name}`} onClick=${() => onDialog({ type: 'agent', agent })}>
      <${Portrait} spec=${agent.avatar} size=${60} thinking=${speaking.has(agent.id)} />
      ${speaking.has(agent.id)
        ? html`<span class="label" style=${`color:${inkColor(agent.avatar)}`}>replying</span>`
        : html`<span class="label">${agent.name}</span>`}
    </button>`)}
      <button class="stage-member add" onClick=${() => onDialog({ type: 'agent' })}><span class="plus"><${Icon} name="plus" /></span><span class="title-s">New agent</span></button>
    </div>`}
    ${state.agents.length > 0 && !state.rooms.some((r) => !r.intro) && html`<div class="first-room">
      <${Treehouse} height=${200} />
      <div class="title-m">Start your first room</div>
      <p class="muted">Put agents in a room, give them a task, and they'll work it out together.</p>
      <button class="button" onClick=${() => onDialog({ type: 'room' })}>New room</button>
    </div>`}
    ${state.rooms.length > 0 && html`<${RecentRooms} state=${state} onOpen=${onOpen} />`}
  </div>`;
}

/** Glass in a crew's colors: the first two agents' tints, for .crew-glass. */
const glassOf = (agents) => {
  const tints = agents.slice(0, 2).map((a) => tint(a.avatar));
  return tints.length ? `--t1:${tints[0]};--t2:${tints[1] ?? tints[0]}` : '';
};

/** Rooms on Home, as a list or as cards; the choice is kept in this browser. */
function RecentRooms({ state, onOpen }) {
  const [cards, setCards] = useState(() => {
    try {
      return localStorage.getItem('treehouse:rooms-view') === 'cards';
    } catch {
      return false;
    }
  });
  const choose = (value) => {
    setCards(value);
    try {
      localStorage.setItem('treehouse:rooms-view', value ? 'cards' : 'list');
    } catch {
      // Private window: it just won't be remembered.
    }
  };
  const rooms = [...state.rooms].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, cards ? 7 : 5);
  const crewOf = (room) => room.agentIds.map((id) => state.agents.find((a) => a.id === id)).filter(Boolean);
  const line = (room, crew) => {
    const talking = crew.find((a) => a.id === room.speaking);
    return room.active
      ? html`<div class="body-s shimmer" style=${talking ? `color:${inkColor(talking.avatar)}` : ''}>${talking ? `${talking.name} is replying…` : 'Working…'}</div>`
      : html`<div class="body-s muted preview">${room.preview ? `${room.preview.author}: ${room.preview.text}` : 'No messages yet'}</div>`;
  };
  return html`<div class="stage-title"><span class="overline">Recent rooms</span>
      ${state.rooms.length > 1 && html`<div class="view-switch" role="radiogroup" aria-label="Show rooms as">
        <button role="radio" aria-checked=${!cards} aria-label="List" class=${cards ? '' : 'on'} onClick=${() => choose(false)}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" /></svg></button>
        <button role="radio" aria-checked=${cards} aria-label="Cards" class=${cards ? 'on' : ''} onClick=${() => choose(true)}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="4" y="4" width="16" height="7" rx="2.5" /><rect x="4" y="14" width="7" height="6" rx="2.5" /><rect x="14" y="14" width="6" height="6" rx="2.5" /></svg></button>
      </div>`}</div>
    ${cards
      ? html`<div class="room-cards faces">${rooms.map((room, i) => {
        const crew = crewOf(room);
        const face = faceOf(room, crew);
        const thinking = room.active && face && room.speaking === face.id;
        const when = !room.active && html`<span class="caption faint when">${ago(room.updatedAt)}</span>`;
        // The first a wide card with its face beside its name; the rest one face each, the count beside the name.
        return i === 0
          ? html`<button class="room-card crew-glass wide" onClick=${() => onOpen(room.id)}>
            <span class="head"><${GroupPortrait} specs=${crew.map((a) => a.avatar)} face=${face?.avatar} size=${44} thinking=${thinking} />
              <span class="text"><span class="title-s">${room.name}</span>
                <span class="body-s faint">${crew.length <= 1 ? `Just you and ${crew[0]?.name ?? 'your agent'}` : crew.map((a) => a.name).join(', ')}</span></span>${when}</span>
            ${line(room, crew)}
          </button>`
          : html`<button class="room-card crew-glass" onClick=${() => onOpen(room.id)}>
            ${face && html`<${Portrait} spec=${face.avatar} size=${40} thinking=${thinking} />`}${when}
            <span class="title-s">${room.name}${crew.length > 1 && html`<span class="count">+${crew.length - 1}</span>`}</span>
            ${line(room, crew)}
          </button>`;
      })}</div>`
      : html`<div class="room-rows one-card">${rooms.map((room) => {
        const crew = crewOf(room);
        const talking = crew.find((a) => a.id === room.speaking);
        const face = faceOf(room, crew);
        return html`<button class="room-line" onClick=${() => onOpen(room.id)}>
          <${GroupPortrait} specs=${crew.map((a) => a.avatar)} face=${face?.avatar} size=${48} thinking=${room.active && face && room.speaking === face.id} />
          <div class="text"><div class="top"><span class="title-s">${room.name}</span>${room.active
            ? html`<span class="dot" style=${`background:${talking ? inkColor(talking.avatar) : 'var(--text-2)'}`}></span>`
            : html`<span class="caption faint">${ago(room.updatedAt)}</span>`}</div>${line(room, crew)}</div>
        </button>`;
      })}</div>`}`;
}

/** What agents wrote on their own, as one card to step through: Open goes to the room, Dismiss takes it off Home. */
function NudgeCard({ nudges, state, onOpen, onDismiss }) {
  const [index, setIndex] = useState(0);
  const at = Math.min(index, nudges.length - 1);
  const n = nudges[at];
  const agent = state.agents.find((a) => a.id === n.agentId);
  const room = state.rooms.find((r) => r.id === n.roomId);
  const why = { followup: 'Follow-up', watch: 'Watch', brief: 'Morning brief' }[n.kind] ?? 'Check-in';
  return html`<div class="card nudge-card" key=${n.id}>
    <div class="head">${agent ? html`<${Disc} spec=${agent.avatar} size=${38} />` : html`<span class="disc you"></span>`}
      <div class="who"><span class="title-s" style=${agent ? `color:${inkColor(agent.avatar)}` : ''}>${agent?.name ?? 'Your crew'}</span>
        <span class="body-s faint"> · ${why}${room && n.kind !== 'brief' ? ` · ${room.name}` : ''}</span></div>
      <span class="caption faint">${ago(n.at)}</span></div>
    <p>${n.text}</p>
    <div class="foot">
      <div class="dots">${nudges.length > 1 && nudges.map((x, i) => html`<button class=${i === at ? 'on' : ''} aria-label=${`Note ${i + 1} of ${nudges.length}`} onClick=${() => setIndex(i)}></button>`)}</div>
      <button class="label muted" onClick=${() => onDismiss(n.id)}>Dismiss</button>
      <button class="pill selected" onClick=${() => onOpen(n.roomId)}>Open</button>
    </div>
  </div>`;
}

// ---------- A room ----------

/** Folds one live event into the message list. Returns null when the list must be reloaded. */
function upsert(list, message) {
  const index = list.findIndex((m) => m.id === message.id);
  if (index < 0) return [...list, message].sort((a, b) => a.seq - b.seq);
  // An older "still streaming" snapshot must not undo text already here.
  if (message.status === 'streaming' && message.text.length < list[index].text.length) return list;
  const next = list.slice();
  next[index] = message;
  return next;
}

function RoomView({ room, state, onDialog, notify, onBack, onOpenRoom, onStale, onDelete }) {
  const [messages, setMessages] = useState([]);
  const [run, setRun] = useState({ active: false, agentId: null });
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(true);
  const [menu, setMenu] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // the message the next send answers
  const [nearBottom, setNearBottom] = useState(true);
  // Replies that landed while scrolled back, counted on the Latest button.
  const [seenReplies, setSeenReplies] = useState(0);
  const list = useRef([]);
  const scroller = useRef();
  const stick = useRef(true);

  const apply = (next) => {
    list.current = next;
    setMessages(next);
  };
  const load = async () => {
    const snapshot = await api.messages(room.id);
    apply(snapshot.messages);
    setRun(snapshot.run);
    setLoaded(true);
  };

  useEffect(() => {
    apply([]);
    setLoaded(false);
    stick.current = true;
    const stop = roomEvents(room.id, {
      open: () => {
        setConnected(true);
        load().catch(() => setConnected(false));
      },
      message: (m) => apply(upsert(list.current, m)),
      delta: (d) => {
        const index = list.current.findIndex((m) => m.id === d.id);
        const current = list.current[index];
        if (!current || d.at > current.text.length) return void load(); // missed something
        if (d.at < current.text.length) return undefined; // already have it
        const next = list.current.slice();
        next[index] = { ...current, text: current.text + d.text };
        apply(next);
        return undefined;
      },
      activity: (a) => apply(list.current.map((m) => (m.id === a.id ? { ...m, activity: a.activity } : m))),
      cards: (c) => apply(list.current.map((m) => (m.id === c.id ? { ...m, cards: c.cards } : m))),
      reset: (r) => apply(list.current.map((m) => (m.id === r.id ? { ...m, text: r.text } : m))),
      run: setRun,
      cleared: () => apply([]),
      removed: (r) => apply(list.current.filter((m) => m.id !== r.id)),
    });
    return stop;
  }, [room.id]);

  // Stay pinned to the newest line while replies stream in, unless you've scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const el = scroller.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near;
    setNearBottom(near);
  };

  const agents = room.agentIds.map((id) => state.agents.find((a) => a.id === id)).filter(Boolean);
  const byId = Object.fromEntries(state.agents.map((a) => [a.id, a]));
  // The intro just built a crew this window doesn't know yet: fetch it.
  const unknown = messages.some((m) => [...(m.crew?.agentIds ?? []), ...(m.created ?? []).map((c) => c.agentId)].some((id) => !byId[id]));
  useEffect(() => {
    if (unknown) onStale();
  }, [unknown]);
  const washes = agents.slice(0, 4).map((a) => tint(a.avatar));
  const mentions = Object.fromEntries(agents.map((a) => [a.name.replace(/\s/g, '').toLowerCase(), inkColor(a.avatar)]));
  const lead = agents.find((a) => a.id === room.leadId);
  const speaker = byId[run.agentId];
  const introduced = new Set();
  const firstReplies = new Set(
    messages.filter((m) => m.author.type === 'agent' && !introduced.has(m.author.agentId) && introduced.add(m.author.agentId)).map((m) => m.id),
  );
  const replies = messages.filter((m) => m.author.type === 'agent').length;
  useEffect(() => { if (nearBottom) setSeenReplies(replies); }, [nearBottom, replies]);
  const canRetry = (m) =>
    m.author.type === 'agent' && !run.active && agents.some((a) => a.id === m.author.agentId) &&
    (m.status === 'error' || m.status === 'stopped' || messages.at(-1)?.id === m.id);

  const act = (work) => work().catch((e) => notify(e.message));
  // About how many tokens the next reply sends, for the chip in the bar: checked again after each reply.
  const [contextTokens, setContextTokens] = useState(null);
  useEffect(() => {
    if (run.active || !loaded) return;
    api.roomContext(room.id).then((c) => setContextTokens(c.tokens.total)).catch(() => {});
  }, [room.id, run.active, loaded, messages.length]);
  // The Tokens window says when its changes move the count.
  useEffect(() => {
    const changed = (e) => e.detail.room === room.id && setContextTokens(e.detail.total);
    addEventListener('treehouse:context', changed);
    return () => removeEventListener('treehouse:context', changed);
  }, [room.id]);
  const onCopyCode = (e) => {
    const button = e.target.closest('[data-copy]');
    if (!button) return;
    navigator.clipboard.writeText(button.closest('.code-block').querySelector('code').textContent);
    button.querySelector('span').textContent = 'Copied';
    setTimeout(() => (button.querySelector('span').textContent = 'Copy'), 1600);
  };

  return html`
    <header class="room-bar crew-glass" style=${glassOf(agents)}>
      <button class="icon-button narrow-only" onClick=${onBack} aria-label="Back to rooms"><${Icon} name="back" /></button>
      <div class="titles">
        <div class="title-m">${room.name}</div>
        <div class="status">
          ${!connected
            ? html`<span class="dot"></span>Reconnecting to your hub`
            : run.active
              ? html`<span class="dot" style=${`background:${speaker ? inkColor(speaker.avatar) : 'var(--text-2)'}`}></span><span class="shimmer">${speaker ? `${speaker.name} is replying` : 'Working'}</span>`
              : agents.length === 1 ? `Just you and ${agents[0].name}`
              : room.mode === 'auto' ? `Best fit · ${agents.map((a) => a.name).join(', ')}`
              : room.mode === 'lead' && lead ? `Led by ${lead.name}` : `Round table · ${agents.map((a) => a.name).join(', ')}`}
        </div>
      </div>
      <button class="avatar-stack faces" title="Who's in this room" aria-label="Who's in this room" onClick=${() => onDialog({ type: 'members', room })}>${agents.slice(0, 3).map((a) => html`<${Portrait} spec=${a.avatar} size=${32} thinking=${run.active && run.agentId === a.id} />`)}${agents.length > 3 && html`<${More} count=${agents.length - 3} />`}</button>
      ${contextTokens != null && html`<button class="token-chip" title="About how many tokens each reply sends" aria-label=${`About ${formatTokens(contextTokens)} tokens per reply`} onClick=${() => onDialog({ type: 'tokens', room })}>${formatTokens(contextTokens)}</button>`}
      <button class="icon-button" aria-label="Room options" aria-expanded=${menu} onClick=${() => setMenu(!menu)}><${Icon} name="more" /></button>
      ${menu && html`<div class="menu" onMouseLeave=${() => setMenu(false)}>
        <button onClick=${() => { setMenu(false); onDialog({ type: 'room', room }); }}>Edit room</button>
        <button onClick=${() => { setMenu(false); onDialog({ type: 'members', room }); }}>Members</button>
        <button onClick=${() => { setMenu(false); onDialog({ type: 'schedules', room }); }}>Schedules</button>
        <button onClick=${() => { setMenu(false); onDialog({ type: 'search-room', room }); }}>Search this room</button>
        <button onClick=${() => { setMenu(false); onDialog({ type: 'tokens', room }); }}>Tokens${contextTokens != null ? html`<span class="hint">${formatTokens(contextTokens)} per reply</span>` : ''}</button>
        <button onClick=${() => { setMenu(false); if (confirm(`Clear every message in ${room.name}?`)) act(() => api.clear(room.id)); }}>Clear chat</button>
        <button class="danger" onClick=${() => { setMenu(false); onDelete(); }}>Delete room</button>
      </div>`}
    </header>
    <div class="messages-frame">
    <div class="messages" ref=${scroller} onScroll=${onScroll} onClick=${onCopyCode}>
      ${loaded && !messages.length
        ? html`<div class="empty-room">
            <${Treehouse} height=${200} />
            <div class="title-m">${agents.map((a) => a.name).join(', ')}</div>
            <p class="muted">${room.mode === 'auto' ? 'Ask anything. Whoever it suits best answers.' : room.mode === 'lead' && lead ? `${lead.name} answers first and brings in the others.` : 'Everyone answers in turn.'} Mention someone with @ to ask them directly.</p>
          </div>`
        : html`<div class="messages-inner">
            ${messages.map((m, i) => {
              const before = messages[i - 1];
              const newDay = m.createdAt > 0 && (!before || !sameDay(before.createdAt, m.createdAt));
              const runsOn = !newDay && continuesRun(before, m);
              return html`${newDay && html`<div class="day-divider" key=${`day-${m.id}`} role="heading" aria-level="3"><span>${dayLabel(m.createdAt)}</span></div>`}
            <div class=${`message${m.author.type === 'user' ? ' mine' : ''}${runsOn ? ' run' : ''}`} key=${m.id}>
              ${m.author.type === 'user'
                ? html`<${UserMessage} message=${m} mentions=${mentions} onPhoto=${setViewing} byId=${byId} />`
                : html`<${AgentMessage} message=${m} agent=${byId[m.author.agentId]} showModel=${firstReplies.has(m.id)} mentions=${mentions} continued=${runsOn} notify=${notify} />
                  ${(m.created ?? []).map((c) => byId[c.agentId]).filter(Boolean).map((hired) => html`<${NewMember} agent=${hired} onOpen=${() => onDialog({ type: 'agent', agent: hired })} />`)}
                  ${m.crew && html`<${CrewReady} made=${m.crew} crew=${m.crew.agentIds.map((id) => byId[id]).filter(Boolean)} onOpen=${() => onOpenRoom(m.crew.roomId)} />`}`}
              <div class="message-actions">
                ${m.author.type === 'agent' && m.status === 'done' && html`<button onClick=${() => setReplyingTo(m)}><${Icon} name="reply" />Reply</button>`}
                ${m.text && html`<button onClick=${() => { navigator.clipboard.writeText(m.text); notify('Copied'); }}><${Icon} name="copy" />Copy</button>`}
                ${canRetry(m) && html`<button onClick=${() => act(() => api.retry(room.id, m.id))}><${Icon} name="retry" />Ask again</button>`}
                ${m.status !== 'streaming' && html`<button class="danger" onClick=${() => act(() => api.deleteMessage(room.id, m.id))}><${Icon} name="trash" />Delete</button>`}
              </div>
            </div>`;
            })}
          </div>`}
      ${!nearBottom && html`<div class="latest"><button class="pill" onClick=${() => { scroller.current.scrollTop = scroller.current.scrollHeight; }}><${Icon} name="up" size=${16} />${replies > seenReplies ? `${replies - seenReplies} new` : 'Latest'}</button></div>`}
    </div>
    <div class="edge-blur top" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="edge-blur bottom" aria-hidden="true"><i></i><i></i><i></i></div>
    </div>
    <${Composer} room=${room} agents=${agents} running=${run.active} notify=${notify} onSent=${() => { stick.current = true; }}
      suggestions=${loaded && messages.length && !run.active ? suggestionsFor(agents, messages) : []}
      replyingTo=${replyingTo} replyAgent=${replyingTo && byId[replyingTo.author.agentId]} onCancelReply=${() => setReplyingTo(null)} />
    ${viewing && html`<div class="viewer" onClick=${() => setViewing(null)} role="dialog" aria-label=${viewing.name}><img src=${`/api/files/${viewing.id}`} alt=${viewing.name} /></div>`}
  `;
}

function UserMessage({ message, mentions, onPhoto, byId = {} }) {
  const photos = (message.attachments ?? []).filter((a) => a.type.startsWith('image/'));
  const files = (message.attachments ?? []).filter((a) => !a.type.startsWith('image/'));
  return html`
    ${message.scheduled && html`<div class="scheduled caption faint"><${Icon} name="clock" />Scheduled · ${message.scheduled.label}</div>`}
    ${message.replyTo && html`<div class="quoted caption faint"><${Icon} name="reply" />
      <strong style=${`color:${byId[message.replyTo.agentId] ? inkColor(byId[message.replyTo.agentId].avatar) : 'var(--text-2)'}`}>${message.replyTo.name}</strong>
      <span>${message.replyTo.text}</span></div>`}
    ${photos.length + files.length > 0 && html`<div class="attached">
      ${photos.length === 1
        ? html`<img class="photo-single" src=${`/api/files/${photos[0].id}`} alt=${photos[0].name} onClick=${() => onPhoto(photos[0])} />`
        : photos.length > 1 && html`<div class="photos">${photos.map((p) => html`<img src=${`/api/files/${p.id}`} alt=${p.name} onClick=${() => onPhoto(p)} />`)}</div>`}
      ${files.map((f) => html`<a class="file-chip" href=${`/api/files/${f.id}`} target="_blank" rel="noopener">
        <${Icon} name="file" /><div style="min-width:0"><div class="name">${f.name}</div><div class="caption faint">${fileSize(f.size)}</div></div>
      </a>`)}
    </div>`}
    ${message.text && html`<div class="bubble"><div class="md" dangerouslySetInnerHTML=${{ __html: markdown(message.text, mentions) }}></div></div>`}
  `;
}

// What each kind of step reads as, while it happens and once it's done or has failed.
const STEPS = {
  search: ['Searching', 'Searched', 'Search failed', 'search'],
  page: ['Reading', 'Read', "Couldn't open", 'globe'],
  code: ['Running code', 'Ran code', "Code didn't run", 'code'],
  folder: ['Looking in', 'Looked in', "Couldn't open", 'folder'],
  file: ['Reading', 'Read', "Couldn't read", 'file'],
  find: ['Searching files for', 'Searched files for', 'File search failed for', 'search'],
  remember: ['Remembering', 'Remembered', "Couldn't remember", 'memory'],
  forget: ['Forgetting', 'Forgot', "Couldn't forget", 'memory'],
  mail_search: ['Searching email', 'Searched email', 'Email search failed', 'mail'],
  mail_read: ['Reading an email', 'Read an email', "Couldn't read an email", 'mail'],
  mail_draft: ['Drafting an email', 'Saved a draft', "Couldn't save a draft", 'mail'],
  calendar: ['Checking the calendar', 'Checked the calendar', "Couldn't check the calendar", 'calendar'],
  calendar_add: ['Adding to the calendar', 'Added to the calendar', "Couldn't add to the calendar", 'calendar'],
  drive_search: ['Searching Drive', 'Searched Drive', 'Drive search failed', 'search'],
  drive_read: ['Reading from Drive', 'Read from Drive', "Couldn't open a Drive file", 'file'],
  followup: ['Setting a follow-up', 'Will follow up', "Couldn't set a follow-up", 'clock'],
  watch: ['Setting up a watch', 'Watching', "Couldn't watch", 'bell'],
  watch_stop: ['Stopping a watch', 'Stopped watching', "Couldn't stop a watch", 'bell'],
  room: ['Making a room', 'Made a room', "Couldn't make a room", 'plus'],
  guide: ['Reading the Treehouse guide', 'Read the Treehouse guide', "Couldn't read the guide", 'file'],
  self: ['Updating its', 'Updated its', "Couldn't update its", 'check'],
  settings: ['Changing', 'Changed', "Couldn't change", 'check'],
  browse: ['Opening', 'Opened', "Couldn't open", 'globe'],
  browse_read: ['Reading the page', 'Read the page', "Couldn't read the page", 'globe'],
  browse_click: ['Clicking', 'Clicked', "Didn't click", 'globe'],
  browse_type: ['Typing', 'Typed', "Couldn't type", 'globe'],
};
/** Why an agent wrote on its own, beside its name. */
const REACHED = { checkin: 'Checking in', followup: 'Following up', watch: 'Watching', brief: 'Morning brief' };
const site = (url) => url.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0];
const leaf = (path) => path.replace(/\/$/, '').split('/').pop() || path;
function stepDetail(step) {
  switch (step.kind) {
    case 'page':
    case 'browse': return site(step.detail);
    case 'browse_read': return '';
    case 'browse_click': return 'on the page';
    case 'browse_type': return step.detail ? `“${step.detail}”` : 'on the page';
    case 'folder': return step.detail ? leaf(step.detail) : 'your shared folders';
    case 'file': return leaf(step.detail);
    case 'find': return `“${step.detail}”`;
    case 'code': return '';
    case 'mail_search':
    case 'drive_search': return step.detail ? `for “${step.detail}”` : '';
    case 'mail_draft': return step.detail ? `to ${step.detail}` : '';
    case 'mail_read':
    case 'drive_read':
    case 'guide': return '';
    case 'self':
    case 'settings': return step.detail || 'settings';
    default: return step.detail;
  }
}
function summary(activity) {
  const count = (k) => activity.filter((a) => a.kind === k).length;
  const times = (n, one, many) => (n === 1 ? one : many.replace('#', n));
  const parts = [
    count('search') && times(count('search'), 'searched the web', 'searched the web # times'),
    count('page') && times(count('page'), 'read a page', 'read # pages'),
    count('code') && 'ran code',
    count('folder') && times(count('folder'), 'looked in a folder', 'looked in # folders'),
    count('file') && times(count('file'), 'read a file', 'read # files'),
    count('find') && 'searched your files',
    count('remember') && times(count('remember'), 'saved a note', 'saved # notes'),
    count('forget') && 'forgot a note',
    count('mail_search') && 'searched email',
    count('mail_read') && times(count('mail_read'), 'read an email', 'read # emails'),
    count('mail_draft') && times(count('mail_draft'), 'saved a draft', 'saved # drafts'),
    count('calendar') && 'checked the calendar',
    count('calendar_add') && times(count('calendar_add'), 'added an event', 'added # events'),
    count('drive_search') && 'searched Drive',
    count('drive_read') && times(count('drive_read'), 'read a Drive file', 'read # Drive files'),
    count('followup') && 'set a follow-up',
    count('watch') && 'started watching',
    count('watch_stop') && 'stopped a watch',
    count('guide') && 'read the Treehouse guide',
    count('self') && 'updated itself',
    count('settings') && 'changed settings',
    count('browse') + count('browse_click') + count('browse_type') && 'used the browser',
  ].filter(Boolean);
  const text = parts.length <= 1 ? parts[0] ?? `used ${activity.length} tools` : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return text[0].toUpperCase() + text.slice(1);
}

/** One line for a single step: "Searched best ramen near the hotel". */
function stepLine(step) {
  const [, done, failed] = STEPS[step.kind] ?? ['Working', 'Used a tool', 'Used a tool'];
  return [step.failed ? failed : done, stepDetail(step)].filter(Boolean).join(' ');
}

/** While an agent works, a line per step; once it has answered, one small chip that opens to show them. */
function Trail({ activity, streaming }) {
  const [open, setOpen] = useState(false);
  if (!activity?.length) return null;
  const chip = !streaming && html`<button class=${`trail-summary${open ? ' open' : ''}`} aria-expanded=${open} onClick=${() => setOpen(!open)}>
    <${Icon} name=${STEPS[activity[0].kind]?.[3] ?? 'more'} />${activity.length === 1 ? stepLine(activity[0]) : summary(activity)}<${Icon} name="chevron" size=${14} /></button>`;
  if (!streaming && !open) return chip;
  return html`${chip}<div class="trail">${activity.map((step) => {
    const [live, done, failed, icon] = STEPS[step.kind] ?? ['Working', 'Used a tool', 'Used a tool', 'more'];
    const isLive = streaming && !step.done;
    const verb = isLive ? live : step.failed ? failed : done;
    const detail = stepDetail(step);
    return html`<div class="trail-line"><${Icon} name=${icon} />${isLive
      ? html`<span class="shimmer">${verb} ${detail}</span>`
      : html`<span>${verb}</span>${detail && html`<span class="detail">${detail}</span>`}`}</div>`;
  })}</div>`;
}

/** A model by its everyday name: "claude-opus-5-5" reads as "Opus 5.5", "gpt-6.1-terra" as "GPT-6.1 terra". */
function modelTag(model) {
  const id = model.split('/').pop().replace(/:latest$/, '');
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?$/.exec(id);
  if (claude) return `${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}${claude[3] ? `.${claude[3]}` : ''}`;
  if (id.startsWith('gpt-')) return `GPT-${id.slice(4).replace('-', ' ')}`;
  return id;
}

/** A summary, a next step, and the member who hasn't spoken lately, to bring them in. */
function suggestionsFor(agents, messages) {
  const out = [
    { label: 'Summarize so far', text: 'Summarize where we are so far.', send: true },
    { label: "What's next?", text: 'What should we do next?', send: true },
  ];
  if (agents.length > 1) {
    const recent = new Set(messages.slice(-6).map((m) => m.author.agentId).filter(Boolean));
    const quiet = agents.find((a) => !recent.has(a.id));
    if (quiet) out.push({ label: `@${quiet.name.replace(/\s/g, '')}`, text: `@${quiet.name.replace(/\s/g, '')} `, send: false });
  }
  return out;
}

/** Whether a message carries on a run from the same agent: close in time, nothing else in between. */
function continuesRun(before, m) {
  return Boolean(before) && before.author.type === 'agent' && m.author.type === 'agent' && before.author.agentId
    && before.author.agentId === m.author.agentId && !m.proactive && !before.crew && !(before.created ?? []).length
    && m.createdAt - before.createdAt >= 0 && m.createdAt - before.createdAt <= 10 * 60_000;
}
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
/** "Today", "Yesterday", "Tue, Nov 18", or with the year once it's not this year. */
function dayLabel(at) {
  const now = Date.now();
  if (sameDay(at, now)) return 'Today';
  if (sameDay(at, now - 86_400_000)) return 'Yesterday';
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString(undefined, sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
const clock = (at) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace('AM', 'am').replace('PM', 'pm');

function AgentMessage({ message, agent, showModel, mentions, continued = false, notify }) {
  const streaming = message.status === 'streaming';
  const working = streaming && !message.text && (message.activity ?? []).every((a) => a.done);
  const text = streaming ? closeOpenMarkup(message.text) : message.text;
  const rendered = useMemo(() => (message.cards?.length ? '' : markdown(text, mentions)), [text, message.cards]);
  // With cards, the text is cut where each card goes; only the last piece can still be arriving.
  const pieces = useMemo(() => {
    if (!message.cards?.length) return null;
    const parts = splitAtCards(message.text, message.cards);
    const last = parts.findLastIndex((p) => p.text);
    return parts.map((p, i) => (p.text ? { html: markdown(streaming && i === last ? closeOpenMarkup(p.text) : p.text, mentions) } : p));
  }, [message.text, message.cards, streaming]);
  return html`<div class="agent-message">
    ${continued ? html`<span class="disc-space"></span>` : working
      // While it works out what to say, the agent's whole character stands there; once words arrive, its portrait.
      ? html`<span class="speaker working"><${Avatar} spec=${agent?.avatar} size=${64} thinking /></span>`
      : html`<span class="speaker"><${Portrait} spec=${agent?.avatar} size=${36} thinking=${streaming && Boolean(message.text)} /></span>`}
    <div class="body">
      ${!continued && html`<div class="agent-head">
        <span class="name">${agent?.name ?? message.author.name}</span>
        ${message.proactive && html`<span class="reached"><${Icon} name="bell" size=${13} />${REACHED[message.proactive.kind] ?? 'Checking in'}</span>`}
        ${showModel && !message.proactive && message.author.model && html`<span class="model-tag" title=${message.author.model}>${modelTag(message.author.model)}</span>`}
        ${message.createdAt > 0 && !streaming && html`<span class="caption faint">${clock(message.createdAt)}</span>`}
      </div>`}
      <${Trail} activity=${message.activity} streaming=${streaming} />
      ${pieces
        ? html`<div class="pieces">${pieces.map((p) => (p.card
          ? html`<${ToolCard} key=${p.card.id} card=${p.card} agent=${agent} notify=${notify} />`
          : html`<div class="md" dangerouslySetInnerHTML=${{ __html: p.html }}></div>`))}</div>`
        : message.text && html`<div class="md" dangerouslySetInnerHTML=${{ __html: rendered }}></div>`}
      ${working && html`<div class="thinking-dots" style=${`--wash:${tint(agent?.avatar)};--ink:${inkColor(agent?.avatar)}`} aria-label="Thinking"><i></i><i></i><i></i></div>`}
      ${message.status === 'error' && html`<div class="failure"><span class="dot"></span><div>${message.error || "This agent couldn't reply."}</div></div>`}
      ${message.status === 'stopped' && html`<div class="caption faint" style="margin-top:6px">Stopped</div>`}
      ${!streaming && message.sources?.length > 0 && html`<div class="sources">${message.sources.map((s, i) => html`<a class="source" href=${s.url} target="_blank" rel="noopener noreferrer" title=${s.title}>
        <span class="n">${i + 1}</span>${site(s.url)}
      </a>`)}</div>`}
    </div>
  </div>`;
}

/** Someone an agent just hired, washed in their own color, and the way to look them over. */
function NewMember({ agent, onOpen }) {
  return html`<button class="crew-ready new-member" onClick=${onOpen} style=${`--wash:linear-gradient(90deg, ${tint(agent.avatar)}, transparent)`}>
    <${Avatar} spec=${agent.avatar} size=${52} />
    <div class="text"><div class="title-s">Meet ${agent.name}</div><div class="body-s muted">${[agent.role, agent.model].filter(Boolean).join(' · ')}</div></div>
    <span class="pill">View</span>
  </button>`;
}

/** The intro's payoff: the crew it just built, and the way into their room. */
function CrewReady({ made, crew, onOpen }) {
  const tints = (crew.length > 1 ? crew.slice(1) : crew).map((a) => tint(a.avatar));
  return html`<button class="crew-ready" onClick=${onOpen} style=${`--wash:linear-gradient(90deg, ${(tints.length > 1 ? tints : [tints[0] ?? 'transparent', 'transparent']).join(', ')})`}>
    <${CrewTile} specs=${crew.map((a) => a.avatar)} size=${56} />
    <div class="text"><div class="title-s">${made.label || 'Your crew is ready'}</div><div class="body-s muted">${made.name} · ${crew.map((a) => a.name).join(', ')}</div></div>
    <span class="pill selected">Open</span>
  </button>`;
}

// ---------- Writing a message ----------

// The browser's own speech recognition, where it has one (Edge and Chrome do).
const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition;

function Composer({ room, agents, running, notify, onSent, replyingTo = null, replyAgent = null, onCancelReply = () => {}, suggestions = [] }) {
  const [draft, setDraft] = useState('');
  // "Message" in the members window starts a message to that agent.
  useEffect(() => {
    const mention = (e) => {
      const handle = `@${e.detail.replace(/\s/g, '')} `;
      setDraft((d) => (d.trim() ? `${d.trimEnd()} ${handle}` : handle));
      setTimeout(() => box.current?.focus());
    };
    addEventListener('treehouse:mention', mention);
    return () => removeEventListener('treehouse:mention', mention);
  }, []);
  const [listening, setListening] = useState(false);
  const [focused, setFocused] = useState(false);
  const recognizer = useRef(null);
  const talk = () => {
    if (listening) { recognizer.current?.stop(); return; }
    const r = new Speech();
    r.interimResults = false;
    r.lang = navigator.language;
    r.onresult = (e) => {
      const words = [...e.results].map((x) => x[0].transcript).join(' ').trim();
      if (words) setDraft((d) => (d.trim() ? `${d.trimEnd()} ${words}` : words));
    };
    r.onerror = (e) => e.error !== 'aborted' && e.error !== 'no-speech' && notify(e.error === 'not-allowed' ? 'Allow the microphone for this page to talk to the crew.' : "Couldn't hear that. Try again.");
    r.onend = () => setListening(false);
    recognizer.current = r;
    setListening(true);
    r.start();
  };
  const suggest = (s) => {
    if (s.send) api.send(room.id, s.text).then(onSent).catch((e) => notify(e.message));
    else { setDraft(s.text); box.current?.focus(); }
  };
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mention, setMention] = useState(null);
  const box = useRef();
  const picker = useRef();

  useEffect(() => {
    setDraft('');
    setFiles([]);
  }, [room.id]);
  // Choosing Reply puts the cursor straight in the box, before the next key press lands.
  useLayoutEffect(() => {
    if (replyingTo) box.current?.focus();
  }, [replyingTo?.id]);
  // The box grows with what's typed, up to a limit.
  useLayoutEffect(() => {
    const el = box.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const add = (list) => {
    const usable = [...list].filter(canAttach);
    if (usable.length < list.length) notify('Treehouse can attach photos, PDFs and text files.');
    setFiles((current) => {
      const next = [...current, ...usable.map((file) => ({ file, key: crypto.randomUUID(), url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }))];
      if (next.length > 6) notify('A message can carry up to six photos and files.');
      return next.slice(0, 6);
    });
  };

  const send = async () => {
    const text = draft.trim();
    if (sending || (!text && !files.length)) return;
    setSending(true);
    try {
      const ids = [];
      for (const { file } of files) {
        const { blob, name } = await prepare(file);
        ids.push((await api.upload(blob, name)).id);
      }
      await api.send(room.id, text, ids, replyingTo?.id);
      setDraft('');
      setFiles([]);
      onCancelReply();
      onSent();
    } catch (e) {
      notify(e.message);
    } finally {
      setSending(false);
      box.current?.focus();
    }
  };

  const onInput = (e) => {
    const value = e.currentTarget.value;
    setDraft(value);
    const before = value.slice(0, e.currentTarget.selectionStart);
    const match = /(^|\s)@([\p{L}\p{N}_]*)$/u.exec(before);
    setMention(match ? match[2].toLowerCase() : null);
  };
  const insertMention = (agent) => {
    const el = box.current;
    const before = draft.slice(0, el.selectionStart).replace(/@[\p{L}\p{N}_]*$/u, '');
    const after = draft.slice(el.selectionStart);
    setDraft(`${before}@${agent.name.replace(/\s/g, '')} ${after}`);
    setMention(null);
    el.focus();
  };
  // Suggestions while a mention is part-typed; once it's whole, Enter sends.
  const handle = (a) => a.name.replace(/\s/g, '').toLowerCase();
  const matches = mention === null ? [] : agents.filter((a) => handle(a).startsWith(mention) && handle(a) !== mention);
  const canSend = (draft.trim() || files.length) && !sending;

  return html`<div class="composer-wrap">
    ${suggestions.length > 0 && !draft && !focused && !replyingTo && html`<div class="suggestions">${suggestions.map((s) => html`<${Pill} label=${s.label} small onClick=${() => suggest(s)} />`)}</div>`}
    <div class=${`composer${dragging ? ' dragging' : ''}`}
      onDragOver=${(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave=${() => setDragging(false)}
      onDrop=${(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}>
      ${matches.length > 0 && html`<div class="mention-chips">${matches.map((a) => html`<${Pill} label=${a.name} small onClick=${() => insertMention(a)}><${Portrait} spec=${a.avatar} size=${20} /><//>`)}</div>`}
      ${replyingTo && html`<div class="replying">
        <span style=${`color:${replyAgent ? inkColor(replyAgent.avatar) : 'var(--text-2)'}`}><${Icon} name="reply" size=${16} /></span>
        <div class="text"><div class="label" style=${replyAgent ? `color:${inkColor(replyAgent.avatar)}` : ''}>Replying to ${replyAgent?.name ?? replyingTo.author.name}</div>
          <div class="body-s muted">${replyingTo.text.replace(/\s+/g, ' ').slice(0, 160)}</div></div>
        <button class="icon-button" aria-label="Cancel reply" title="Cancel reply" onClick=${onCancelReply}><${Icon} name="close" /></button>
      </div>`}
      ${files.length > 0 && html`<div class="drafts">${files.map((f) => html`<div class=${`draft${sending ? ' sending' : ''}`} key=${f.key}>
        ${f.url ? html`<img src=${f.url} alt=${f.file.name} />` : html`<div class="file"><${Icon} name="file" size=${18} /><span>${f.file.name}</span></div>`}
        ${!sending && html`<button class="remove" aria-label=${`Remove ${f.file.name}`} onClick=${() => setFiles(files.filter((x) => x.key !== f.key))}><${Icon} name="close" /></button>`}
      </div>`)}</div>`}
      <div class="composer-row">
        <button class="icon-button" aria-label="Attach photos or files" title="Attach photos or files" onClick=${() => picker.current.click()}><${Icon} name="plus" /></button>
        <input type="file" multiple accept=${ATTACHABLE} hidden ref=${picker} onChange=${(e) => { add(e.currentTarget.files); e.currentTarget.value = ''; }} />
        <textarea ref=${box} rows="1" placeholder=${listening ? 'Listening…' : agents.length === 1 ? `Message ${agents[0].name}` : 'Message the crew'} value=${draft} onInput=${onInput}
          onFocus=${() => setFocused(true)} onBlur=${() => setFocused(false)}
          onPaste=${(e) => e.clipboardData.files.length && (e.preventDefault(), add(e.clipboardData.files))}
          onKeyDown=${(e) => {
            if (e.key === 'Escape' && replyingTo) onCancelReply();
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              if (matches.length) insertMention(matches[0]);
              else send();
            }
          }} aria-label="Message"></textarea>
        ${Speech && html`<button class=${`icon-button${listening ? ' listening' : ''}`} aria-label=${listening ? 'Stop listening' : 'Talk'} title=${listening ? 'Stop listening' : 'Talk'} aria-pressed=${listening} onClick=${talk}><${Icon} name="mic" /></button>`}
        ${!canSend && running
          ? html`<button class="send" aria-label="Stop" title="Stop" onClick=${() => api.stop(room.id).catch((e) => notify(e.message))}><span class="stop"></span></button>`
          : html`<button class="send" aria-label="Send" disabled=${!canSend} onClick=${send}>${sending ? html`<span class="spinner"></span>` : html`<${Icon} name="up" size=${19} />`}</button>`}
      </div>
    </div>
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));

// Installable as a desktop app; the service worker only has to exist.
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
