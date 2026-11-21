// Treehouse for the desktop: the same rooms and crew as the phone, in a window on the PC.
import { render } from '/vendor/preact.mjs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from '/vendor/hooks.mjs';
import { ATTACHABLE, api, canAttach, hubEvents, onThisPC, prepare, roomEvents } from './api.js';
import { Avatar, CrewTile, characterOf, inkColor, tint } from './avatar.js';
import { AgentEditor, RoomEditor, Schedules, Settings } from './editors.js';
import { closeOpenMarkup, markdown } from './markdown.js';
import { Treehouse } from './treehouse.js';
import { Icon, Mark, Pill, ago, fileSize, html } from './ui.js';

// ---------- The app ----------

function App() {
  const [phase, setPhase] = useState('loading'); // loading, connect, offline, ready
  const [state, setState] = useState(null);
  const [roomId, setRoomId] = useState(() => decodeURIComponent(location.hash.slice(1)) || null);
  const [dialog, setDialog] = useState(null);
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
      if (/key/i.test(e.message)) setDialog({ type: 'settings' });
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
    <${Sidebar} state=${state} roomId=${room?.id} onOpen=${openRoom} onDialog=${setDialog} onIntro=${startIntro} onUpdate=${startUpdate} onDelete=${deleteRoom} />
    <main>
      ${room
        ? html`<${RoomView} key=${room.id} room=${room} state=${state} onDialog=${setDialog} notify=${notify} onBack=${() => openRoom(null)} onDelete=${() => deleteRoom(room)}
            onOpenRoom=${(id) => refresh().then(() => openRoom(id))} onStale=${refresh} />`
        : html`<${Welcome} state=${state} onDialog=${setDialog} onIntro=${startIntro} onOpen=${openRoom}
            onDismiss=${(id) => api.dismissNudge(id).then(refresh).catch((e) => notify(e.message))} />`}
    </main>
    ${dialog?.type === 'agent' && html`<${AgentEditor} agent=${dialog.agent} state=${state} notify=${notify} onClose=${close} onSaved=${() => edited()} onChanged=${refresh} onAddKey=${() => setDialog({ type: 'settings' })} />`}
    ${dialog?.type === 'room' && html`<${RoomEditor} room=${dialog.room} state=${state} notify=${notify} onClose=${close} onSaved=${(id) => edited(id)} />`}
    ${dialog?.type === 'settings' && html`<${Settings} state=${state} notify=${notify} refresh=${refresh} onClose=${close} onIntro=${() => { close(); startIntro(); }} onUpdate=${startUpdate} />`}
    ${updating && html`<div class="updating" role="alertdialog" aria-live="polite">
      ${updating.failed
        ? html`<div class="center"><${Mark} size=${40} /><h1 class="title-l">Treehouse hasn't come back yet</h1>
            <p class="muted">The update to ${updating.version} was installed, but the hub didn't answer. Look at its window on the PC. If it closed, start Treehouse again.</p>
            <button class="button" onClick=${() => location.reload()}>Try again</button></div>`
        : html`<div class="center"><div class="spinner" style="margin:0 auto 18px"></div><h1 class="title-l">Updating Treehouse</h1>
            <p class="muted">Installing ${updating.version}. This takes a few seconds, and the page reloads by itself.</p></div>`}
    </div>`}
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

function Sidebar({ state, roomId, onOpen, onDialog, onIntro, onUpdate, onDelete }) {
  const byId = useMemo(() => Object.fromEntries(state.agents.map((a) => [a.id, a])), [state.agents]);
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
    <div class="sidebar-scroll">
      ${state.updates?.hub.available && html`<button class="card row button-row update-banner" onClick=${onUpdate}>
        <div style="flex:1"><div class="title-s">Treehouse ${state.updates.hub.available} is ready</div>
          <div class="body-s muted">Install it now. Treehouse restarts in a few seconds.</div></div>
        <span class="pill selected">Update</span>
      </button>`}
      ${intro && html`<button class="card row button-row intro-mini" style=${`--wash:${tint(guide.avatar)}`} onClick=${() => (canIntro(state) ? onIntro() : onDialog({ type: 'settings' }))}>
        <${Avatar} spec=${guide.avatar} size=${36} />
        <div style="flex:1"><div class="title-s">${canIntro(state) ? 'Get to know each other' : 'Meet your guide'}</div>
          <div class="body-s muted">${canIntro(state) ? `A quick chat with ${guide.name}, so your whole crew knows you.` : 'Add an Anthropic key to start.'}</div></div>
        <${Icon} name="chevron" size=${18} />
      </button>`}
      ${demo && html`<button class="card row button-row" style="margin:6px 4px 4px;width:calc(100% - 8px)" onClick=${() => onDialog({ type: 'settings' })}>
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
          <${CrewTile} specs=${crew.map((a) => a.avatar)} size=${44} tint=${crew[0] ? tint(crew[0].avatar) : null} />
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
          <${Avatar} spec=${agent.avatar} size=${26} />${agent.name}
        </button>`)}
      </div>
    </div>
  </aside>`;
}

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
  return html`<div class="home">
    <h1 class="display">${name ? `${greeting()}, ${name}` : greeting()}</h1>
    <p class="muted home-sub">${busy
      ? html`<span class="dot" style=${`background:${speaker ? inkColor(speaker.avatar) : 'var(--live)'}`}></span><span class="shimmer">${speaker ? `${speaker.name} is replying in ${busy.name}` : `Your crew is working in ${busy.name}`}</span>`
      : !state.agents.length ? "Let's set up your crew"
      : state.agents.length === 1 ? `${state.agents[0].name} is here when you need them`
      : `Your crew of ${state.agents.length} is ready`}</p>
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
        : html`<button class="button" onClick=${() => onDialog({ type: 'settings' })}>Add a key</button>`}
    </div>`}
    ${state.nudges?.length > 0 && html`<div class="stage-title"><span class="overline">From your crew</span></div>
    <div class="nudges">${[...state.nudges].reverse().slice(0, 5).map((n) => {
      const agent = state.agents.find((a) => a.id === n.agentId);
      const room = state.rooms.find((r) => r.id === n.roomId);
      const why = { followup: 'Follow-up', watch: 'Watch', brief: 'Morning brief' }[n.kind] ?? 'Check-in';
      return html`<div class="nudge" key=${n.id} style=${`--wash:${agent ? tint(agent.avatar) : 'transparent'}`}>
        <${Avatar} spec=${agent?.avatar} size=${40} />
        <button class="text" style="text-align:left" onClick=${() => onOpen(n.roomId)}>
          <div class="body-s"><span class="title-s" style=${`color:${agent ? inkColor(agent.avatar) : 'var(--text)'}`}>${agent?.name ?? 'Your crew'}</span>
            <span class="muted"> · ${why}${room && n.kind !== 'brief' ? ` · ${room.name}` : ''} · ${ago(n.at)}</span></div>
          <p>${n.text}</p>
        </button>
        <button class="icon-button" aria-label="Dismiss" title="Dismiss" onClick=${() => onDismiss(n.id)}><${Icon} name="close" size=${18} /></button>
      </div>`;
    })}</div>`}
    ${state.agents.length > 0 && html`<div class="stage-title"><span class="overline">Your crew</span>
      <button class="label muted" onClick=${() => onDialog({ type: 'room' })}>New room</button></div>
    <div class="stage">${state.agents.map((agent) => html`<button class="stage-member" style=${`--pool:${tint(agent.avatar)}`} title=${`Edit ${agent.name}`} onClick=${() => onDialog({ type: 'agent', agent })}>
      <span class="pool"></span><${Avatar} spec=${agent.avatar} size=${72} />
      <span class="title-s">${agent.name}</span>${agent.role && html`<span class="caption faint">${agent.role}</span>`}
    </button>`)}
      <button class="stage-member add" onClick=${() => onDialog({ type: 'agent' })}><span class="plus"><${Icon} name="plus" /></span><span class="title-s">New agent</span></button>
    </div>`}
    ${state.agents.length > 0 && !state.rooms.some((r) => !r.intro) && html`<div class="first-room">
      <${Treehouse} height=${200} />
      <div class="title-m">Start your first room</div>
      <p class="muted">Put agents in a room, give them a task, and they'll work it out together.</p>
      <button class="button" onClick=${() => onDialog({ type: 'room' })}>New room</button>
    </div>`}
    ${state.rooms.length > 0 && html`<div class="stage-title"><span class="overline">Recent rooms</span></div>
    <div class="room-cards">${[...state.rooms].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4).map((room) => {
      const crew = room.agentIds.map((id) => state.agents.find((a) => a.id === id)).filter(Boolean);
      return html`<button class="room-card" style=${`--wash:${crew[0] ? tint(crew[0].avatar) : 'transparent'}`} onClick=${() => onOpen(room.id)}>
        <${CrewTile} specs=${crew.map((a) => a.avatar)} size=${48} />
        <div class="text"><div class="title-s">${room.name}</div>
          <div class="body-s muted">${room.active ? 'Working now' : room.preview ? `${room.preview.author}: ${room.preview.text}` : 'No messages yet'}</div></div>
      </button>`;
    })}</div>`}
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
  const washes = agents.slice(0, 3).map((a) => tint(a.avatar));
  const mentions = Object.fromEntries(agents.map((a) => [a.name.replace(/\s/g, '').toLowerCase(), inkColor(a.avatar)]));
  const lead = agents.find((a) => a.id === room.leadId);
  const speaker = byId[run.agentId];
  const introduced = new Set();
  const firstReplies = new Set(
    messages.filter((m) => m.author.type === 'agent' && !introduced.has(m.author.agentId) && introduced.add(m.author.agentId)).map((m) => m.id),
  );
  const canRetry = (m) =>
    m.author.type === 'agent' && !run.active && agents.some((a) => a.id === m.author.agentId) &&
    (m.status === 'error' || m.status === 'stopped' || messages.at(-1)?.id === m.id);

  const act = (work) => work().catch((e) => notify(e.message));
  const onCopyCode = (e) => {
    const button = e.target.closest('[data-copy]');
    if (!button) return;
    navigator.clipboard.writeText(button.closest('.code-block').querySelector('code').textContent);
    button.querySelector('span').textContent = 'Copied';
    setTimeout(() => (button.querySelector('span').textContent = 'Copy'), 1600);
  };

  return html`
    ${washes.length > 0 && html`<div class="room-wash" aria-hidden="true" style=${`--wash:linear-gradient(90deg, ${(washes.length > 1 ? washes : [washes[0], washes[0]]).join(', ')})`}></div>`}
    <header class="room-bar">
      <button class="icon-button narrow-only" onClick=${onBack} aria-label="Back to rooms"><${Icon} name="back" /></button>
      <div class="titles">
        <div class="title-m">${room.name}</div>
        <div class="status">
          ${!connected
            ? html`<span class="dot"></span>Reconnecting to your hub`
            : run.active
              ? html`<span class="dot" style=${`background:${speaker ? inkColor(speaker.avatar) : 'var(--text-2)'}`}></span><span class="shimmer">${speaker ? `${speaker.name} is replying` : 'Working'}</span>`
              : agents.length === 1 ? `Just you and ${agents[0].name}`
              : room.mode === 'auto' ? 'Best fit: whoever suits each message answers'
              : room.mode === 'lead' && lead ? `Led by ${lead.name}` : 'Round table'}
        </div>
      </div>
      <div class="avatar-row">${agents.slice(0, 5).map((a) => html`<${Avatar} spec=${a.avatar} size=${30} thinking=${run.active && run.agentId === a.id} />`)}</div>
      <button class="icon-button" aria-label="Room options" aria-expanded=${menu} onClick=${() => setMenu(!menu)}><${Icon} name="more" /></button>
      ${menu && html`<div class="menu" onMouseLeave=${() => setMenu(false)}>
        <button onClick=${() => { setMenu(false); onDialog({ type: 'room', room }); }}>Edit room</button>
        <button onClick=${() => { setMenu(false); onDialog({ type: 'schedules', room }); }}>Schedules</button>
        <button onClick=${() => { setMenu(false); if (confirm(`Clear every message in ${room.name}?`)) act(() => api.clear(room.id)); }}>Clear chat</button>
        <button class="danger" onClick=${() => { setMenu(false); onDelete(); }}>Delete room</button>
      </div>`}
    </header>
    <div class="messages" ref=${scroller} onScroll=${onScroll} onClick=${onCopyCode}>
      ${loaded && !messages.length
        ? html`<div class="empty-room">
            <${Treehouse} height=${200} />
            <div class="title-m">${agents.map((a) => a.name).join(', ')}</div>
            <p class="muted">${room.mode === 'auto' ? 'Ask anything. Whoever it suits best answers.' : room.mode === 'lead' && lead ? `${lead.name} answers first and brings in the others.` : 'Everyone answers in turn.'} Mention someone with @ to ask them directly.</p>
          </div>`
        : html`<div class="messages-inner">
            ${messages.map((m) => html`<div class=${`message${m.author.type === 'user' ? ' mine' : ''}`} key=${m.id}>
              ${m.author.type === 'user'
                ? html`<${UserMessage} message=${m} mentions=${mentions} onPhoto=${setViewing} byId=${byId} />`
                : html`<${AgentMessage} message=${m} agent=${byId[m.author.agentId]} showModel=${firstReplies.has(m.id)} mentions=${mentions} />
                  ${(m.created ?? []).map((c) => byId[c.agentId]).filter(Boolean).map((hired) => html`<${NewMember} agent=${hired} onOpen=${() => onDialog({ type: 'agent', agent: hired })} />`)}
                  ${m.crew && html`<${CrewReady} made=${m.crew} crew=${m.crew.agentIds.map((id) => byId[id]).filter(Boolean)} onOpen=${() => onOpenRoom(m.crew.roomId)} />`}`}
              <div class="message-actions">
                ${m.author.type === 'agent' && m.status === 'done' && html`<button onClick=${() => setReplyingTo(m)}><${Icon} name="reply" />Reply</button>`}
                ${m.text && html`<button onClick=${() => { navigator.clipboard.writeText(m.text); notify('Copied'); }}><${Icon} name="copy" />Copy</button>`}
                ${canRetry(m) && html`<button onClick=${() => act(() => api.retry(room.id, m.id))}><${Icon} name="retry" />Ask again</button>`}
                ${m.status !== 'streaming' && html`<button class="danger" onClick=${() => act(() => api.deleteMessage(room.id, m.id))}><${Icon} name="trash" />Delete</button>`}
              </div>
            </div>`)}
          </div>`}
      ${!nearBottom && html`<div class="latest"><button class="pill" onClick=${() => { scroller.current.scrollTop = scroller.current.scrollHeight; }}><${Icon} name="up" size=${16} />Latest</button></div>`}
    </div>
    <${Composer} room=${room} agents=${agents} running=${run.active} notify=${notify} onSent=${() => { stick.current = true; }}
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
};
/** Why an agent wrote on its own, beside its name. */
const REACHED = { checkin: 'Checking in', followup: 'Following up', watch: 'Watching', brief: 'Morning brief' };
const site = (url) => url.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0];
const leaf = (path) => path.replace(/\/$/, '').split('/').pop() || path;
function stepDetail(step) {
  switch (step.kind) {
    case 'page': return site(step.detail);
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
  ].filter(Boolean);
  const text = parts.length <= 1 ? parts[0] ?? `used ${activity.length} tools` : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return text[0].toUpperCase() + text.slice(1);
}

function Trail({ activity, streaming }) {
  const [open, setOpen] = useState(false);
  if (!activity?.length) return null;
  if (!streaming && !open && activity.length > 3) {
    return html`<button class="trail-summary" onClick=${() => setOpen(true)}><${Icon} name=${STEPS[activity[0].kind]?.[3] ?? 'more'} />${summary(activity)}<${Icon} name="chevron" size=${15} /></button>`;
  }
  return html`<div class="trail">${activity.map((step) => {
    const [live, done, failed, icon] = STEPS[step.kind] ?? ['Working', 'Used a tool', 'Used a tool', 'more'];
    const isLive = streaming && !step.done;
    const verb = isLive ? live : step.failed ? failed : done;
    const detail = stepDetail(step);
    return html`<div class="trail-line"><${Icon} name=${icon} />${isLive
      ? html`<span class="shimmer">${verb} ${detail}</span>`
      : html`<span>${verb}</span>${detail && html`<span class="detail">${detail}</span>`}`}</div>`;
  })}</div>`;
}

function AgentMessage({ message, agent, showModel, mentions }) {
  const streaming = message.status === 'streaming';
  const text = streaming ? closeOpenMarkup(message.text) : message.text;
  const rendered = useMemo(() => markdown(text, mentions), [text]);
  return html`<div class="agent-message">
    <${Avatar} spec=${agent?.avatar} size=${34} thinking=${streaming} />
    <div class="body">
      <div class="agent-head">
        <span class="name" style=${`color:${inkColor(agent?.avatar)}`}>${agent?.name ?? message.author.name}</span>
        ${message.proactive && html`<span class="reached"><${Icon} name="bell" size=${13} />${REACHED[message.proactive.kind] ?? 'Checking in'}</span>`}
        ${showModel && !message.proactive && message.author.model && html`<span class="mono faint">${message.author.model}</span>`}
      </div>
      <${Trail} activity=${message.activity} streaming=${streaming} />
      ${message.text && html`<div class="md" dangerouslySetInnerHTML=${{ __html: rendered }}></div>`}
      ${streaming && !message.text && (message.activity ?? []).every((a) => a.done) && html`<div class="shimmer">Thinking</div>`}
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

function Composer({ room, agents, running, notify, onSent, replyingTo = null, replyAgent = null, onCancelReply = () => {} }) {
  const [draft, setDraft] = useState('');
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
    <div class=${`composer${dragging ? ' dragging' : ''}`}
      onDragOver=${(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave=${() => setDragging(false)}
      onDrop=${(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}>
      ${matches.length > 0 && html`<div class="mention-chips">${matches.map((a) => html`<${Pill} label=${a.name} small onClick=${() => insertMention(a)}><${Avatar} spec=${a.avatar} size=${20} /><//>`)}</div>`}
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
        <textarea ref=${box} rows="1" placeholder=${agents.length === 1 ? `Message ${agents[0].name}` : 'Message the crew'} value=${draft} onInput=${onInput}
          onPaste=${(e) => e.clipboardData.files.length && (e.preventDefault(), add(e.clipboardData.files))}
          onKeyDown=${(e) => {
            if (e.key === 'Escape' && replyingTo) onCancelReply();
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              if (matches.length) insertMention(matches[0]);
              else send();
            }
          }} aria-label="Message"></textarea>
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
