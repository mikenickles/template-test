import { marked } from '/vendor/marked.js';
import DOMPurify from '/vendor/purify.js';
import { icon } from '/icons.js';
import { api, h, S, toast } from '/lib.js';
import { openMenu } from '/sheet.js';

// Replies are rendered as Markdown, then stripped of anything that could load
// from another site or run code. Links open in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});
function render(text) {
  const html = marked.parse(text ?? '', { gfm: true, breaks: true });
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['img', 'picture', 'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset', 'background'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
  });
}

// ---------- State ----------

const thread = document.getElementById('thread');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const composer = document.getElementById('composer');

const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160;
function toBottom(force) {
  if (force || nearBottom()) requestAnimationFrame(() => (thread.scrollTop = thread.scrollHeight));
}

// ---------- Conversation ----------

function messageRows(m) {
  if (m.role === 'user') return [h('div', { class: 'row user' }, h('div', { class: 'bubble' }, m.text))];
  if (m.role === 'note') return [h('div', { class: 'row note' }, m.text)];
  const rows = [];
  if (m.text.trim()) {
    const body = h('div', { class: 'row arlo' });
    if (m.kind === 'routine') body.append(h('div', {}, h('span', { class: 'pill accent tag', html: `${icon('clock')}<span></span>` })));
    body.append(h('div', { html: render(m.text) }));
    if (m.kind === 'routine') body.querySelector('.tag span').textContent = m.title || 'Routine';
    rows.push(body);
  }
  if (m.actions.length) {
    rows.push(h('div', { class: `row caption${m.text.trim() ? ' tight' : ''}` },
      m.actions.map((a) => h('span', { html: icon('check') }, a))));
  }
  return rows;
}

function approvalEl(a) {
  const el = h('div', { class: 'row', 'data-approval': a.id });
  if (a.status === 'pending') {
    const act = async (decision, button) => {
      el.querySelectorAll('button').forEach((b) => (b.disabled = true));
      button.textContent = decision === 'approve' ? 'Working…' : 'OK';
      try {
        await api(`/api/approvals/${a.id}`, { method: 'POST', body: { decision } });
      } catch (err) {
        toast(err.message);
        el.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    };
    el.append(h('div', { class: 'card' },
      h('h3', {}, a.card.title),
      a.card.rows.length ? h('dl', {}, a.card.rows.flatMap((r) => [h('dt', {}, r.label), h('dd', {}, r.value)])) : null,
      a.card.body ? h('div', { class: 'body' }, a.card.body) : null,
      a.card.warning ? h('div', { class: 'caution', html: icon('alert') }, h('span', {}, a.card.warning)) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: (e) => act('approve', e.currentTarget) }, a.card.confirmLabel),
        h('button', { class: 'btn plain', onclick: (e) => act('decline', e.currentTarget) }, 'Not now')),
    ));
    return el;
  }
  const good = a.status === 'done' || a.status === 'approved';
  const text =
    a.status === 'done' ? a.card.done
    : a.status === 'approved' ? 'Approved'
    : a.status === 'failed' ? `${a.card.title.replace(/\?$/, '')}: didn't go through`
    : a.status === 'expired' ? `${a.card.title.replace(/\?$/, '')}: expired, nothing happened`
    : `${a.card.title.replace(/\?$/, '')}: declined`;
  el.classList.add('tight');
  el.append(h('div', { class: `settled ${good ? 'good' : a.status === 'failed' ? 'bad' : ''}`, html: icon(good ? 'check' : 'close') }, h('span', {}, text)));
  return el;
}

function upsertApproval(a) {
  const existing = thread.querySelector(`[data-approval="${CSS.escape(a.id)}"]`);
  const el = approvalEl(a);
  if (existing) existing.replaceWith(el);
  else thread.insertBefore(el, tail());
  S.count++;
  toBottom();
}

/** The live reply and the status line always sit at the very end. */
function tail() {
  let el = document.getElementById('tail');
  if (!el) {
    el = h('div', { id: 'tail' }, h('div', { class: 'row arlo', id: 'live', hidden: true }), h('div', { class: 'row status', id: 'status', hidden: true }));
    thread.append(el);
  }
  return el;
}

function addMessage(m, animate = true) {
  if (S.seen.has(m.id)) return;
  S.seen.add(m.id);
  if (!S.count) thread.querySelector('.welcome')?.remove();
  S.count++;
  for (const row of messageRows(m)) {
    if (!animate) row.style.animation = 'none';
    thread.insertBefore(row, tail());
  }
}

let liveFrame = 0;
function setLive(text) {
  S.live = text;
  if (liveFrame) return;
  liveFrame = requestAnimationFrame(() => {
    liveFrame = 0;
    const el = document.getElementById('live');
    if (!el) return;
    el.hidden = !S.live.trim();
    el.innerHTML = render(S.live);
    toBottom();
  });
}

function setStatus(text) {
  tail();
  const el = document.getElementById('status');
  el.hidden = !text;
  el.replaceChildren(h('span', { class: 'dots' }, h('i'), h('i'), h('i')), text === true ? '' : h('span', {}, text));
  toBottom();
}

function setBusy(busy) {
  S.busy = busy;
  document.body.classList.toggle('busy', busy);
  if (!busy) {
    setLive('');
    setStatus('');
  }
  paintSend();
}

function paintSend() {
  const has = input.value.trim().length > 0;
  sendBtn.className = `send ${S.busy && !has ? 'stop' : has ? '' : 'idle'}`;
  sendBtn.innerHTML = icon(S.busy && !has ? 'stop' : 'up');
  sendBtn.setAttribute('aria-label', S.busy && !has ? 'Stop' : 'Send');
  micBtn.hidden = !canListen || has || S.busy;
}

// ---------- Welcome and first-run setup ----------

const SUGGESTIONS = [
  ['google', 'What does my day look like?'],
  ['google', 'Anything in my inbox that needs me?'],
  ['spotify', 'Play something calm'],
];

function welcome() {
  thread.querySelector('.welcome')?.remove();
  const s = S.state;
  composer.hidden = !s.ready || !s.userName;
  if (S.count) return;
  const box = h('section', { class: 'welcome' });

  if (!s.ready) {
    box.append(h('h1', {}, `Hi, I'm ${s.agentName}.`));
    if (s.seat !== 'local') {
      box.append(h('p', {}, 'I\'m not set up yet. Open me on your computer first and add an API key there.'));
    } else {
      let provider = null;
      const field = h('input', { class: 'input', type: 'password', placeholder: 'Paste your API key', 'aria-label': 'API key', autocomplete: 'off' });
      const picks = h('div', { class: 'chips', hidden: true },
        [['anthropic', 'Claude'], ['openai', 'OpenAI'], ['gemini', 'Gemini']].map(([id, label]) =>
          h('button', { type: 'button', class: 'chip', 'data-id': id, onclick: () => choose(id) }, label)));
      const choose = (id) => {
        provider = id;
        picks.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
      };
      const guess = (key) => (key.startsWith('sk-ant-') ? 'anthropic' : key.startsWith('sk-') ? 'openai' : key.startsWith('AIza') ? 'gemini' : null);
      field.addEventListener('input', () => {
        const g = guess(field.value.trim());
        picks.hidden = !field.value.trim() || !!g;
        if (g) provider = g;
      });
      box.append(
        h('p', {}, 'I\'m a personal agent that lives on your computer. To wake me up, paste an API key from Claude, OpenAI or Gemini.'),
        h('form', { onsubmit: async (e) => {
          e.preventDefault();
          const key = field.value.trim();
          if (!key) return;
          if (!provider) {
            picks.hidden = false;
            return toast('Which one is this key for?');
          }
          try {
            S.state = await api('/api/settings', { method: 'POST', body: { keys: { [provider]: key }, providerOrder: [provider] } });
            welcome();
          } catch (err) { toast(err.message); }
        } }, field, picks, h('button', { class: 'btn primary' }, 'Continue')),
        h('p', { class: 'fine' }, 'The key is encrypted and never leaves this computer, except to talk to the service it belongs to.'),
      );
    }
  } else if (!s.userName) {
    const field = h('input', { class: 'input', placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'given-name' });
    box.append(
      h('h1', {}, 'What should I call you?'),
      h('form', { onsubmit: async (e) => {
        e.preventDefault();
        if (!field.value.trim()) return;
        try {
          S.state = await api('/api/settings', { method: 'POST', body: { userName: field.value, onboarded: true } });
          welcome();
          input.focus();
        } catch (err) { toast(err.message); }
      } }, field, h('button', { class: 'btn primary' }, 'That\'s me')),
    );
    setTimeout(() => field.focus(), 50);
  } else {
    const usable = SUGGESTIONS.filter(([need]) => s.connections[need].connected);
    box.append(
      h('h1', {}, `Hi ${s.userName}.`),
      h('p', {}, usable.length ? 'What can I take off your plate?' : 'Connect your accounts and I can handle email, your calendar, files and music. Or just ask me something.'),
      h('div', { class: 'chips' },
        usable.length
          ? usable.map(([, text]) => h('button', { class: 'chip', onclick: () => send(text) }, text))
          : h('button', { class: 'chip', onclick: () => openMenu('connections') }, 'Connect your accounts')),
    );
  }
  thread.insertBefore(box, tail());
}

function paintHeader() {
  const s = S.state;
  document.getElementById('agent-name').textContent = s.agentName;
  document.getElementById('paused-pill').hidden = !s.paused;
  document.title = s.agentName;
  input.placeholder = `Message ${s.agentName}`;
  input.setAttribute('aria-label', input.placeholder);
}

// ---------- Sending ----------

async function send(text) {
  const value = (text ?? input.value).trim();
  if (!value) return;
  input.value = '';
  grow();
  paintSend();
  try {
    await api('/api/chat', { method: 'POST', body: { text: value } });
    toBottom(true);
  } catch (err) {
    toast(err.message);
    input.value = value;
    paintSend();
  }
}

function grow() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  if (S.busy && !input.value.trim()) api('/api/stop', { method: 'POST' }).catch(() => {});
  else send();
});
input.addEventListener('input', () => { grow(); paintSend(); });
input.addEventListener('keydown', (e) => {
  // Enter sends with a keyboard; on a touch keyboard it makes a new line.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
    e.preventDefault();
    send();
  }
});

// ---------- Voice (where the browser or the Android app offers it) ----------

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const canListen = !!window.ArloNative?.listen || !!Recognition;
window.arloVoice = (text) => {
  micBtn.classList.remove('listening');
  if (text) { input.value = text; grow(); paintSend(); input.focus(); }
};
window.arloShare = (text) => { input.value = text; grow(); paintSend(); input.focus(); };
micBtn.innerHTML = icon('mic');
micBtn.addEventListener('click', () => {
  micBtn.classList.add('listening');
  if (window.ArloNative?.listen) return window.ArloNative.listen();
  const r = new Recognition();
  r.lang = navigator.language;
  r.onresult = (e) => window.arloVoice(e.results[0][0].transcript);
  r.onerror = r.onend = () => micBtn.classList.remove('listening');
  r.start();
});

// ---------- Live updates ----------

let unseen = 0;
function nudge() {
  if (!document.hidden) return;
  unseen++;
  document.title = `(${unseen}) ${S.state.agentName}`;
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.state) { unseen = 0; document.title = S.state.agentName; }
});

function onEvent(e) {
  if (e.type === 'turn_start') { setBusy(true); setStatus(true); }
  else if (e.type === 'delta') { setStatus(''); setLive(S.live + e.text); }
  else if (e.type === 'reset_text') setLive('');
  else if (e.type === 'status') setStatus(e.text);
  else if (e.type === 'message') {
    if (e.message.role === 'assistant') setLive('');
    addMessage(e.message);
    if (S.busy && e.message.role !== 'user') setStatus(true);
    if (e.message.kind === 'routine') nudge();
    toBottom(e.message.role === 'user');
  } else if (e.type === 'approval') {
    upsertApproval(e.approval);
    if (e.approval.status === 'pending') nudge();
  } else if (e.type === 'turn_end') setBusy(false);
  else if (e.type === 'state') refreshState();
}

async function refreshState() {
  S.state = await api('/api/state');
  paintHeader();
  welcome();
  document.dispatchEvent(new CustomEvent('arlo:state'));
}

async function load() {
  const data = await api('/api/thread');
  // Messages and approval cards share one timeline, ordered by when they happened.
  const items = [
    ...data.messages.filter((m) => !S.seen.has(m.id)).map((m) => ({ at: m.at, m })),
    ...data.approvals.map((a) => ({ at: a.at, a })),
  ].sort((x, y) => x.at - y.at);
  for (const item of items) {
    if (item.m) addMessage(item.m, false);
    else upsertApproval(item.a);
  }
  setBusy(!!data.live);
  if (data.live) { setLive(data.live.text); if (!data.live.text) setStatus(true); }
  welcome();
  toBottom(true);
}

function connect() {
  let opened = false;
  const es = new EventSource('/api/events');
  es.onopen = () => { if (opened) load().catch(() => {}); opened = true; };
  es.onmessage = (e) => onEvent(JSON.parse(e.data));
}

document.getElementById('menu-btn').innerHTML = icon('menu');
document.getElementById('menu-btn').addEventListener('click', () => openMenu());

(async function start() {
  try {
    await refreshState();
    await load();
    connect();
    paintSend();
    const notice = new URLSearchParams(location.search).get('notice');
    if (notice) {
      history.replaceState(null, '', '/');
      toast(notice);
      openMenu('connections');
    }
    if (S.state.ready && S.state.userName && !matchMedia('(pointer: coarse)').matches) input.focus();
  } catch (err) {
    thread.replaceChildren(h('section', { class: 'welcome' }, h('h1', {}, 'I can\'t reach the hub.'), h('p', {}, 'Check that Arlo is running on your computer, then reload.')));
  }
})();
