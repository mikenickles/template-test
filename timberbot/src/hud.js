import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);

const ICON = {
  wood: '<svg viewBox="0 0 32 32"><ellipse cx="22" cy="16" rx="6" ry="9" fill="#e3b877" stroke="#5b3a1c" stroke-width="2"/><path d="M22 7H9a6 9 0 0 0 0 18h13" fill="#8a5a2e" stroke="#5b3a1c" stroke-width="2"/><ellipse cx="22" cy="16" rx="2.6" ry="4.2" fill="none" stroke="#a97a43" stroke-width="1.4"/><path d="M9 12h7M8 17h9M10 21h5" stroke="#5b3a1c" stroke-width="1.4" stroke-linecap="round"/></svg>',
  stone: '<svg viewBox="0 0 32 32"><path d="M5 22 8 11l8-5 9 4 3 9-5 7H10z" fill="#9aa3a8" stroke="#3d4448" stroke-width="2" stroke-linejoin="round"/><path d="M8 11l7 5 10-6M15 16l-1 10M15 16l8 3" fill="none" stroke="#5c666b" stroke-width="1.5"/><path d="M9 12l6-4" stroke="#cfd6d9" stroke-width="1.6" stroke-linecap="round"/></svg>',
  wall: '<svg viewBox="0 0 40 32"><g fill="#9a6a38" stroke="#4a2f17" stroke-width="1.6" stroke-linejoin="round"><path d="M4 29V9l4-5 4 5v20zM12 29V8l4-5 4 5v21zM20 29V10l4-5 4 5v19zM28 29V8l4-5 4 5v21z"/></g><path d="M3 15h34M3 23h34" stroke="#3a2412" stroke-width="2.2"/></svg>',
  campfire: '<svg viewBox="0 0 40 32"><path d="M20 3c5 6 8 9 8 14a8 8 0 0 1-16 0c0-3 2-5 3-8 2 2 3 3 3 5 2-3 3-6 2-11z" fill="#ff9a2e" stroke="#a03b06" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 12c2 3 4 4 4 7a4 4 0 0 1-8 0c0-2 2-3 4-7z" fill="#ffe08a"/><path d="M7 28l26-5M7 23l26 5" stroke="#5b3a1c" stroke-width="3.4" stroke-linecap="round"/></svg>',
  beacon: '<svg viewBox="0 0 40 32"><path d="M13 30l2-16h10l2 16z" fill="#9aa3a8" stroke="#3d4448" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 20h10M14.4 25h11.2" stroke="#5c666b" stroke-width="1.3"/><path d="M11 14h18" stroke="#6b4423" stroke-width="2.6" stroke-linecap="round"/><path d="M14 14V9M26 14V9" stroke="#6b4423" stroke-width="1.8"/><path d="M10 9l10-7 10 7z" fill="#7a5a3c" stroke="#3a2412" stroke-width="1.6" stroke-linejoin="round"/><circle cx="20" cy="11.6" r="2.6" fill="#ffd36a" stroke="#ff8a1e" stroke-width="1.2"/></svg>',
};

export class Hud {
  constructor() {
    this.game = null; this.audio = null; this.qa = null;
    $('icon-wood').innerHTML = ICON.wood;
    $('icon-stone').innerHTML = ICON.stone;
    const bar = $('buildbar');
    this.buttons = {};
    for (const [type, def] of Object.entries(CFG.BUILD)) {
      const b = document.createElement('button');
      b.className = 'build-btn';
      b.tabIndex = -1;
      b.dataset.type = type;
      const dims = type === 'wall' ? `${def.width} × ${def.height} m` : type === 'campfire' ? `⌀ ${def.diameter} m` : `${def.width} × ${def.depth} × ${def.height} m`;
      const cost = [];
      if (def.cost.wood) cost.push(`<span class="c c-wood">${ICON.wood}<i>${def.cost.wood}</i></span>`);
      if (def.cost.stone) cost.push(`<span class="c c-stone">${ICON.stone}<i>${def.cost.stone}</i></span>`);
      b.innerHTML = `<kbd>${def.key}</kbd><span class="b-icon">${ICON[type]}</span><span class="b-name">${def.name}</span><span class="b-dims">${dims}</span><span class="b-cost">${cost.join('')}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); this.game && this.game.toggleBuild(type); });
      bar.appendChild(b);
      this.buttons[type] = b;
    }
    // HUD interactions must never leak into the world (no accidental placement / harvest)
    for (const el of document.querySelectorAll('#hud button, #hud .panel')) {
      for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel', 'contextmenu']) el.addEventListener(ev, (e) => e.stopPropagation());
    }
    $('btn-mute').addEventListener('click', (e) => { e.currentTarget.blur(); this.toggleMute(); });
    $('btn-qa').addEventListener('click', (e) => { e.currentTarget.blur(); this.toggleQA(); });
    $('btn-help').addEventListener('click', (e) => { e.currentTarget.blur(); this.toggleHelp(); });
    this.toastTimer = 0;
    this._prompt = null; this._hint = null;
  }

  bind(game, audio, qa) {
    this.game = game; this.audio = audio; this.qa = qa;
    this._syncMute();
  }

  setInventory(inv, changed) {
    $('n-wood').textContent = inv.wood;
    $('n-stone').textContent = inv.stone;
    if (changed) {
      const el = $(changed === 'wood' ? 'slot-wood' : 'slot-stone');
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
  }

  setBuildState(active, afford) {
    for (const [type, b] of Object.entries(this.buttons)) {
      b.classList.toggle('active', type === active);
      b.classList.toggle('poor', !afford[type]);
    }
    document.body.classList.toggle('building', !!active);
  }

  setBuildHint(text, ok) {
    const key = text ? text + ok : null;
    if (key === this._hint) return;
    this._hint = key;
    const el = $('buildhint');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('bad', !ok);
    const def = this.game && this.game.build.type ? CFG.BUILD[this.game.build.type] : null;
    el.innerHTML = `<b>${def ? def.name : 'Build'}</b> — ${text}<small>Left-click place · R rotate · Right-click / Esc cancel</small>`;
  }

  setPrompt(html) {
    if (html === this._prompt) return;
    this._prompt = html;
    const el = $('prompt');
    if (!html) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = html;
  }

  toast(msg, ms = 1500, err = false) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('err', err);
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  toggleQA() { const on = $('qa').classList.toggle('hidden') === false; $('btn-qa').classList.toggle('on', on); document.body.classList.toggle('qa-open', on); if (this.qa) this.qa.setVisible(on); }
  toggleHelp() { $('help').classList.toggle('hidden'); }
  toggleMute() { if (!this.audio) return; this.audio.setMuted(!this.audio.muted); this._syncMute(); }
  _syncMute() {
    const m = this.audio && this.audio.muted;
    $('btn-mute').classList.toggle('on', !m);
    $('btn-mute').innerHTML = (m
      ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>')
      + `<span>${m ? 'Muted' : 'Sound'}</span><kbd>M</kbd>`;
    $('btn-mute').setAttribute('aria-pressed', String(!m));
  }
}
