import { icon } from '/icons.js';
import { api, h, S, toast } from '/lib.js';

const sheet = document.getElementById('sheet');
const scrim = document.getElementById('scrim');
let stack = [];

const local = () => S.state.seat === 'local';
const cash = (cents, currency = S.state.wallet.currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const ago = (ms) => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function field(label, input, hint) {
  return h('div', { class: 'group' }, h('label', {}, label), input, hint ? h('span', { class: 'label' }, hint) : null);
}
function toggle(checked, onchange, { caution = false, disabled = false } = {}) {
  return h('label', { class: `switch${caution ? ' caution' : ''}` },
    h('input', { type: 'checkbox', checked, disabled, onchange: (e) => onchange(e.target.checked, e.target) }), h('span'));
}
const onlyHere = () => h('p', {}, 'For safety, this can only be changed on your computer.');
async function save(body, done) {
  try {
    S.state = await api('/api/settings', { method: 'POST', body });
    document.dispatchEvent(new CustomEvent('arlo:state'));
    if (done) toast(done);
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

// ---------- Views ----------

function home(body) {
  const s = S.state;
  const connected = [['google', 'Google'], ['spotify', 'Spotify'], ['stripe', 'Stripe']].filter(([id]) => s.connections[id].connected).map(([, n]) => n);
  const rows = [
    ['connections', 'link', 'Connections', connected.length ? connected.join(', ') : 'Nothing connected yet'],
    ['memory', 'memory', 'Memory', 'What I know about you'],
    ['routines', 'clock', 'Routines', 'Reminders and things I do on a schedule'],
    ['wallet', 'wallet', 'Wallet', s.wallet.enabled ? `Up to ${cash(s.wallet.perPurchase)} a purchase, always with your OK` : 'Off'],
    ['activity', 'activity', 'Activity', 'Everything I\'ve done'],
    ['phone', 'phone', 'Phone', s.remoteAccess ? 'Phone access is on' : 'Use me from your phone'],
    ['settings', 'settings', 'Settings', 'Names, voice, models'],
  ];
  body.append(
    h('div', { class: 'list' }, rows.map(([id, ic, title, sub]) =>
      h('button', { class: 'item', onclick: () => go(id) },
        h('span', { class: 'lead', html: icon(ic) }),
        h('span', { class: 'main' }, h('span', { class: 'title' }, title), h('span', { class: 'sub' }, sub)),
        h('span', { class: 'trail', html: icon('right') })))),
    h('div', { class: 'list' },
      h('div', { class: 'item' },
        h('span', { class: 'lead', html: icon('pause') }),
        h('span', { class: 'main' }, h('span', { class: 'title' }, `Pause ${s.agentName}`),
          h('span', { class: 'sub' }, 'Stops everything at once. Nothing runs until you switch this off.')),
        toggle(s.paused, async (paused) => {
          await api('/api/pause', { method: 'POST', body: { paused } }).catch((e) => toast(e.message));
        }, { caution: true }))),
  );
}

async function connections(body) {
  const s = S.state;
  const c = s.connections;
  const start = async (service, settings) => {
    if (settings && !(await save(settings))) return;
    try {
      const { url } = await api(`/api/connect/${service}`, { method: 'POST' });
      location.href = url;
    } catch (err) { toast(err.message); }
  };
  const drop = async (service) => {
    await api(`/api/connect/${service}`, { method: 'DELETE' }).catch((e) => toast(e.message));
  };
  const connectedBox = (title, account, can, service) =>
    h('div', { class: 'box' },
      h('h3', {}, title, h('span', { class: 'pill good' }, 'Connected')),
      h('p', {}, account && account !== 'Connected' ? `Signed in as ${account}.` : 'Signed in.'),
      h('p', {}, can),
      local() ? h('div', {}, h('button', { class: 'btn danger', onclick: () => drop(service) }, 'Disconnect')) : null);

  if (!local()) body.append(h('p', {}, 'Accounts are connected and disconnected on your computer.'));

  // Google
  if (c.google.connected) {
    body.append(connectedBox('Google', c.google.account,
      'I can read your mail, calendar and Drive. Sending email, inviting people and deleting anything always asks you first. In Drive I can only change files I created.', 'google'));
  } else if (local()) {
    const id = h('input', { class: 'input', placeholder: 'Client ID', value: s.googleClientId || '', autocomplete: 'off' });
    const secret = h('input', { class: 'input', type: 'password', placeholder: c.google.configured ? 'Client secret (saved)' : 'Client secret', autocomplete: 'off' });
    body.append(h('div', { class: 'box' },
      h('h3', {}, 'Google'),
      h('p', {}, 'Gmail, Calendar and Drive. Google asks you to register a small app of your own first, which takes about five minutes:'),
      h('ol', {},
        h('li', {}, 'In ', h('a', { href: 'https://console.cloud.google.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Google Cloud Console'), ', create a project and switch on the Gmail, Calendar and Drive APIs.'),
        h('li', {}, 'Set up the consent screen as External, then publish it so sign-in doesn\'t expire every week.'),
        h('li', {}, 'Create an OAuth client of type Desktop app and paste its ID and secret below.')),
      id, secret,
      h('button', { class: 'btn primary', onclick: () => start('google', { googleClientId: id.value, ...(secret.value ? { googleClientSecret: secret.value } : {}) }) }, 'Connect Google')));
  } else body.append(h('div', { class: 'box' }, h('h3', {}, 'Google', h('span', { class: 'pill' }, 'Not connected'))));

  // Spotify
  if (c.spotify.connected) {
    body.append(connectedBox('Spotify', c.spotify.account, 'I can search, see what\'s playing, control playback and make playlists. Playback needs Spotify Premium.', 'spotify'));
  } else if (local()) {
    const id = h('input', { class: 'input', placeholder: 'Client ID', value: s.spotifyClientId || '', autocomplete: 'off' });
    body.append(h('div', { class: 'box' },
      h('h3', {}, 'Spotify'),
      h('ol', {},
        h('li', {}, 'In the ', h('a', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noopener noreferrer' }, 'Spotify developer dashboard'), ', create an app that uses the Web API.'),
        h('li', {}, 'Add this redirect URI exactly: ', h('code', {}, c.spotify.redirect)),
        h('li', {}, 'Paste the app\'s Client ID below. Controlling playback needs Spotify Premium.')),
      id,
      h('button', { class: 'btn primary', onclick: () => start('spotify', { spotifyClientId: id.value }) }, 'Connect Spotify')));
  } else body.append(h('div', { class: 'box' }, h('h3', {}, 'Spotify', h('span', { class: 'pill' }, 'Not connected'))));

  // Stripe
  if (c.stripe.connected) {
    body.append(connectedBox('Stripe', null, 'I can see your balance and payments. Payment links and refunds always ask you first.', 'stripe'));
  } else if (local()) {
    const key = h('input', { class: 'input', type: 'password', placeholder: 'Restricted key (rk_…)', autocomplete: 'off' });
    body.append(h('div', { class: 'box' },
      h('h3', {}, 'Stripe'),
      h('p', {}, 'For your own Stripe account: balance, payments, payment links and refunds. Create a restricted key in the Stripe Dashboard with only the permissions you want me to have.'),
      key,
      h('button', { class: 'btn primary', onclick: async () => {
        try {
          await api('/api/connect/stripe', { method: 'POST', body: { key: key.value } });
          toast('Stripe connected.');
        } catch (err) { toast(err.message); }
      } }, 'Connect Stripe')));
  } else body.append(h('div', { class: 'box' }, h('h3', {}, 'Stripe', h('span', { class: 'pill' }, 'Not connected'))));

  if (local()) {
    body.append(h('div', {}, h('button', { class: 'btn danger', onclick: async () => {
      if (!confirm('Disconnect every account and unpair every phone?')) return;
      await api('/api/disconnect-everything', { method: 'POST' }).catch((e) => toast(e.message));
      toast('Everything is disconnected.');
    } }, 'Disconnect everything')));
  }
}

async function memory(body) {
  const { memories } = await api('/api/memory');
  const text = h('input', { class: 'input', placeholder: 'Something I should remember', 'aria-label': 'New memory' });
  body.append(
    h('p', {}, 'This is everything I carry between conversations. Remove anything you\'d rather I didn\'t keep.'),
    h('form', { class: 'rowline', onsubmit: async (e) => {
      e.preventDefault();
      if (!text.value.trim()) return;
      try { await api('/api/memory', { method: 'POST', body: { text: text.value } }); paint(); } catch (err) { toast(err.message); }
    } }, text, h('button', { class: 'btn primary', 'aria-label': 'Add', html: icon('plus') })),
    memories.length
      ? h('div', { class: 'list' }, memories.map((m) =>
          h('div', { class: 'item' },
            h('span', { class: 'main' }, h('span', { class: 'title' }, m.text),
              h('span', { class: 'sub' }, `${m.source === 'you' ? 'Added by you' : 'Saved by me'} · ${ago(m.created_at)}`)),
            h('button', { class: 'icon-btn quiet', 'aria-label': 'Forget this', html: icon('trash'), onclick: async () => {
              await api(`/api/memory/${m.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
              paint();
            } }))))
      : h('div', { class: 'empty' }, 'Nothing yet. Tell me things worth keeping and they\'ll show up here.'),
  );
  if (local()) {
    body.append(h('div', { class: 'rowline' },
      h('a', { class: 'btn outline', href: '/api/export', download: 'arlo-export.json' }, 'Export'),
      memories.length ? h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm('Forget everything I remember?')) return;
        await api('/api/memory', { method: 'DELETE' }).catch((e) => toast(e.message));
        paint();
      } }, 'Forget everything') : null));
  }
}

async function routines(body) {
  const { routines: list } = await api('/api/routines');
  body.append(h('p', {}, 'Things I do on a schedule. Set them up by asking me in the chat.'));
  body.append(list.length
    ? h('div', { class: 'list' }, list.map((r) =>
        h('div', { class: 'item' },
          h('span', { class: 'lead', html: icon('clock') }),
          h('span', { class: 'main' }, h('span', { class: 'title' }, r.title), h('span', { class: 'sub' }, r.when)),
          h('button', { class: 'icon-btn quiet', 'aria-label': 'Cancel this routine', html: icon('trash'), onclick: async () => {
            await api(`/api/routines/${r.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
            paint();
          } }))))
    : h('div', { class: 'empty' }, 'Nothing scheduled. Try: “Every weekday at 7:30, brief me on my day.”'));
}

async function wallet(body) {
  const w = await api('/api/wallet');
  const pct = w.perDay ? Math.min(100, Math.round((w.spentToday / w.perDay) * 100)) : 0;
  body.append(
    h('div', { class: 'stat' },
      h('span', { class: 'label' }, 'Committed today'),
      h('div', { class: 'value' }, cash(w.spentToday, w.currency)),
      h('span', { class: 'label' }, `of your ${cash(w.perDay, w.currency)} daily limit`)),
    h('div', { class: 'meter' }, h('i', { style: `width:${pct}%` })),
    h('p', {}, 'I never see card numbers. When you approve a payment I set up a one-time card for that exact amount, and you finish the checkout.'),
  );

  if (local()) {
    const each = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: w.perPurchase / 100, 'aria-label': 'Per purchase' });
    const day = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: w.perDay / 100, 'aria-label': 'Per day' });
    body.append(h('div', { class: 'box' },
      h('div', { class: 'rowline' }, h('h3', {}, 'Let me prepare payments'),
        toggle(w.enabled, async (enabled) => { await save({ wallet: { enabled } }); paint(); })),
      h('div', { class: 'split' }, field('Most per purchase', each), field('Most per day', day)),
      h('div', {}, h('button', { class: 'btn outline', onclick: () =>
        save({ wallet: { perPurchase: Math.round(Number(each.value) * 100), perDay: Math.round(Number(day.value) * 100) } }, 'Limits saved.').then(paint) }, 'Save limits')),
      h('p', {}, w.rail === 'link' ? 'Cards come from your Link wallet.'
        : w.rail === 'issuing' ? 'Cards come from Stripe Issuing on your connected Stripe account.'
        : 'No card source yet. Install Stripe\'s Link CLI for personal use, or connect a Stripe account that has Issuing. The README has the steps.')));
  } else body.append(onlyHere());

  if (w.payments.length) {
    body.append(h('div', { class: 'group' }, h('h3', {}, 'Payments'),
      h('div', { class: 'list' }, w.payments.map((p) => {
        const open = p.status === 'ready' || p.status === 'requested';
        const slot = h('span', { class: 'sub mono' });
        return h('div', { class: 'item stack' },
          h('span', { class: 'main' },
            h('span', { class: 'title' }, `${cash(p.amount, p.currency)} · ${p.merchant}`),
            h('span', { class: 'sub' }, `${p.status === 'requested' ? 'Waiting for you in the Link app' : p.status === 'ready' ? 'Card ready' : p.status === 'cancelled' ? 'Cancelled' : 'Failed'} · ${ago(p.at)}`),
            slot),
          open ? h('span', { class: 'trail' },
            h('button', { class: 'btn plain', onclick: async () => {
              try {
                const r = await api(`/api/wallet/${p.id}/card`);
                slot.textContent = r.card
                  ? `${r.card.number.replace(/(.{4})/g, '$1 ').trim()}  ·  ${String(r.card.exp_month).padStart(2, '0')}/${String(r.card.exp_year).slice(-2)}  ·  ${r.card.cvc}`
                  : 'Not approved in the Link app yet.';
              } catch (err) { toast(err.message); }
            } }, 'Show card'),
            h('button', { class: 'btn danger', onclick: async () => {
              await api(`/api/wallet/${p.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
              paint();
            } }, 'Cancel card')) : null);
      }))));
  }
}

async function activity(body) {
  const { activity: list } = await api('/api/activity');
  const mark = { done: ['check', 'good'], failed: ['close', 'bad'], declined: ['close', ''], waiting: ['clock', ''] };
  body.append(h('p', {}, 'A record of every time I used one of your accounts, newest first.'));
  body.append(list.length
    ? h('div', { class: 'list' }, list.map((a) =>
        h('div', { class: 'item' },
          h('span', { class: `lead settled ${mark[a.status]?.[1] ?? ''}`, html: icon(mark[a.status]?.[0] ?? 'check') }),
          h('span', { class: 'main' }, h('span', { class: 'title' }, a.summary),
            h('span', { class: 'sub' }, `${a.status === 'done' ? 'Done' : a.status === 'failed' ? 'Didn\'t work' : a.status === 'declined' ? 'You declined' : 'Waiting for you'} · ${ago(a.at)}`)))))
    : h('div', { class: 'empty' }, 'Nothing yet. Once I do something for you, it\'s listed here.'));
}

async function phone(body) {
  const s = S.state;
  if (!local()) {
    body.append(h('p', {}, 'This phone is paired. Pair or remove phones from your computer.'));
    return;
  }
  body.append(
    h('div', { class: 'box' },
      h('div', { class: 'rowline' }, h('h3', {}, 'Let my phone connect'),
        toggle(s.remoteAccess, async (remoteAccess) => { await save({ remoteAccess }); setTimeout(paint, 600); })),
      h('p', {}, 'While this is off, I only answer on this computer. With it on, phones you pair can reach me over your Wi‑Fi. Windows may ask to allow this through the firewall.')),
  );
  if (!s.remoteAccess) return;

  const slot = h('div', { class: 'box' },
    h('h3', {}, 'Pair a phone'),
    h('p', {}, 'Install the Arlo app on your Android phone, then scan a code. Any phone browser works too.'),
    h('div', {}, h('button', { class: 'btn primary', onclick: async () => {
      try {
        const p = await api('/api/pair/start', { method: 'POST' });
        slot.replaceChildren(
          h('h3', {}, 'Scan this with your phone'),
          p.qr ? h('img', { class: 'qr', src: p.qr, alt: 'Pairing code' }) : null,
          h('div', { class: 'code' }, p.code),
          h('p', {}, p.addresses.length
            ? `Or open ${p.addresses[0]} on the phone and type the code. It works once, for ten minutes.`
            : 'This computer doesn\'t seem to be on a network right now.'));
      } catch (err) { toast(err.message); }
    } }, 'Show pairing code')));
  body.append(slot);

  const { devices } = await api('/api/devices');
  if (devices.length) {
    body.append(h('div', { class: 'group' }, h('h3', {}, 'Paired phones'),
      h('div', { class: 'list' }, devices.map((d) =>
        h('div', { class: 'item' },
          h('span', { class: 'lead', html: icon('phone') }),
          h('span', { class: 'main' }, h('span', { class: 'title' }, d.name),
            h('span', { class: 'sub' }, d.last_seen ? `Last used ${ago(d.last_seen)}` : 'Not used yet')),
          h('button', { class: 'btn danger', onclick: async () => {
            await api(`/api/devices/${d.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
            paint();
          } }, 'Remove'))))));
  }
  body.append(h('p', {}, 'Away from home? Put Tailscale on this computer and your phone, then use this computer\'s Tailscale address instead. Your connection stays private and encrypted.'));
}

async function settings(body) {
  const s = S.state;
  const you = h('input', { class: 'input', value: s.userName, autocomplete: 'given-name' });
  const agent = h('input', { class: 'input', value: s.agentName, autocomplete: 'off' });
  const persona = h('textarea', { class: 'input', placeholder: 'For example: Keep it short. A little dry humour is welcome. Don\'t use emoji.' }, s.persona);
  const quietStart = h('input', { class: 'input', type: 'time', value: s.quietStart });
  const quietEnd = h('input', { class: 'input', type: 'time', value: s.quietEnd });
  body.append(
    h('div', { class: 'split' }, field('Your name', you), field('My name', agent)),
    field('How I should talk', persona, 'Leave empty for my usual voice. You can also just tell me in the chat.'),
    h('div', { class: 'group' }, h('label', {}, 'Quiet hours'),
      h('div', { class: 'split' }, quietStart, quietEnd),
      h('span', { class: 'label' }, 'Routines won\'t buzz your phone between these times. Reminders you asked for still do.')),
    h('div', {}, h('button', { class: 'btn primary', onclick: () => save({
      userName: you.value, agentName: agent.value, persona: persona.value, quietStart: quietStart.value, quietEnd: quietEnd.value,
    }, 'Saved.') }, 'Save')),
  );

  if (local()) {
    const names = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini' };
    const keys = {};
    const models = {};
    const first = h('select', { class: 'input' }, s.providerOrder.map((id) => h('option', { value: id }, names[id])));
    const effort = h('select', { class: 'input' },
      [['low', 'Quick'], ['medium', 'Balanced'], ['high', 'Thorough']].map(([v, label]) => h('option', { value: v, selected: s.effort === v }, label)));
    body.append(h('div', { class: 'box' },
      h('h3', {}, 'Models'),
      h('p', {}, 'Add a key for any of these. I use the first one and fall back to the others if it\'s unavailable.'),
      Object.entries(names).map(([id, label]) => {
        keys[id] = h('input', { class: 'input', type: 'password', placeholder: s.providers[id].hasKey ? 'Key saved. Paste to replace' : 'API key', autocomplete: 'off', 'aria-label': `${label} API key` });
        models[id] = h('input', { class: 'input mono', value: s.providers[id].model, 'aria-label': `${label} model` });
        return h('div', { class: 'group' },
          h('label', {}, label, s.providers[id].hasKey ? ' · ready' : ''),
          h('div', { class: 'split' }, keys[id], models[id]));
      }),
      h('div', { class: 'split' }, field('Use first', first), field('Thinking', effort)),
      h('div', {}, h('button', { class: 'btn outline', onclick: async () => {
        const order = [first.value, ...s.providerOrder.filter((id) => id !== first.value)];
        const typed = Object.fromEntries(Object.entries(keys).filter(([, el]) => el.value.trim()).map(([id, el]) => [id, el.value]));
        const ok = await save({
          keys: typed, providerOrder: order, effort: effort.value,
          models: Object.fromEntries(Object.entries(models).map(([id, el]) => [id, el.value])),
        }, 'Models saved.');
        if (ok) paint();
      } }, 'Save models'))));
  }

  body.append(h('div', { class: 'box' },
    h('h3', {}, 'Fresh start'),
    h('p', {}, 'Begin a new conversation. I keep my memories and routines but stop carrying this chat forward.'),
    h('div', {}, h('button', { class: 'btn outline', onclick: async () => {
      await api('/api/fresh-start', { method: 'POST' }).catch((e) => toast(e.message));
      toast('Fresh start. I still remember what matters.');
    } }, 'Start fresh'))));
}

const VIEWS = {
  home: [() => S.state.agentName, home],
  connections: ['Connections', connections],
  memory: ['Memory', memory],
  routines: ['Routines', routines],
  wallet: ['Wallet', wallet],
  activity: ['Activity', activity],
  phone: ['Phone', phone],
  settings: ['Settings', settings],
};

// ---------- Sheet mechanics ----------

async function paint() {
  if (!stack.length) return;
  const id = stack[stack.length - 1];
  const [title, view] = VIEWS[id];
  const body = h('div', { class: 'sheet-body' });
  sheet.replaceChildren(
    h('div', { class: 'sheet-head' },
      stack.length > 1 ? h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('left'), onclick: back }) : null,
      h('h2', {}, typeof title === 'function' ? title() : title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('close'), onclick: close })),
    body);
  try {
    await view(body);
  } catch (err) {
    body.append(h('div', { class: 'empty' }, err.message));
  }
}

function go(id) {
  stack.push(id);
  paint();
}
function back() {
  stack.pop();
  paint();
}
function hide() {
  stack = [];
  sheet.hidden = true;
  scrim.hidden = true;
}
function close() {
  if (stack.length) history.back(); // the entry added in openMenu
}

export function openMenu(view) {
  const wasOpen = stack.length > 0;
  stack = view && view !== 'home' ? ['home', view] : ['home'];
  sheet.hidden = false;
  scrim.hidden = false;
  if (!wasOpen) history.pushState({ arloMenu: true }, '');
  paint();
}

// The phone's back button steps back through the menu before leaving it.
window.addEventListener('popstate', () => {
  if (!stack.length) return;
  if (stack.length > 1) {
    stack.pop();
    history.pushState({ arloMenu: true }, '');
    paint();
  } else hide();
});
scrim.addEventListener('click', () => { stack = stack.slice(0, 1); close(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) { stack = stack.slice(0, 1); close(); } });
document.addEventListener('arlo:state', () => { if (stack.length) paint(); });
