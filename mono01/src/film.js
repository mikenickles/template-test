/* MONO-01 — 15 s teaser. Deterministic frame function: renderFrame(i) draws
 * frame i of 900 (1920×1080 @ 60 fps) onto #c. No wall-clock time anywhere,
 * so the headless renderer can step it frame by frame.
 *
 * Timeline (seconds)            beat grid = 120 BPM, shared with audio/make_audio.py
 *   0.0 –  2.5  hook            "SOUND, DISTILLED."
 *   2.5 –  6.0  product reveal
 *   6.0 – 10.5  three spec cuts (6.0 / 7.5 / 9.0)
 *  10.5 – 13.0  acoustic finale
 *  13.0 – 15.0  end card
 */
'use strict';

const W = 1920, H = 1080, FPS = 60, TOTAL_FRAMES = 900;
const SAFE = { l: 192, t: 108, r: 1728, b: 972 };          // 10 % title-safe
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

const C = {
  paper: '#ECE8E1', paperHi: '#F5F2EC',
  char: '#1B1A19', charSoft: '#2B2A28',
  orange: '#FF4D00',
};
const F = { disp: '"Inter Display"', text: 'Inter', mono: '"JetBrains Mono"' };

/* ------------------------------------------------------------------ easing */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, t0, d) => clamp((t - t0) / d);

function bez(x1, y1, x2, y2) {                 // CSS cubic-bezier(x1,y1,x2,y2)
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (u) => ((ax * u + bx) * u + cx) * u;
  const fy = (u) => ((ay * u + by) * u + cy) * u;
  const dfx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = fx(u) - x, d = dfx(u);
      if (Math.abs(e) < 1e-7) return fy(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0, hi = 1;                          // bisection fallback
    for (let i = 0; i < 40; i++) {
      u = (lo + hi) / 2;
      if (fx(u) < x) lo = u; else hi = u;
    }
    return fy(u);
  };
}
const E = {
  out: bez(0.16, 1, 0.3, 1),          // expo-out: snappy entrance, long settle
  in: bez(0.7, 0, 0.84, 0),           // expo-in: exits
  slam: bez(0.32, 0, 0.67, 0),        // cubic-in: wipes that accelerate into the cut but stay readable
  inOut: bez(0.65, 0, 0.35, 1),
  hardInOut: bez(0.76, 0, 0.24, 1),
  snap: bez(0.2, 0.9, 0.1, 1),
  soft: bez(0.25, 0.1, 0.25, 1),
  build: bez(0.4, 0, 0.9, 0.75),
};
/** Under-damped spring step response 0 → 1 (w = natural freq rad/s, z = damping ratio). */
function spring(t, w = 12, z = 0.7) {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mixHex(a, b, p) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(p)))).join(',')})`;
}
function rgba(hex, a) { const c = hexRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/* ------------------------------------------------------------------ type
 * All text is rasterised once into sprites and then moved as bitmaps, so
 * animated type is resampled smoothly instead of snapping glyphs to pixels. */
const _mctx = mkCanvas(8, 8).getContext('2d');
const _sprites = new Map();
function sprite(text, font, color, ls = 0) {
  const key = `${text}|${font}|${color}|${ls}`;
  let s = _sprites.get(key);
  if (s) return s;
  _mctx.font = font; _mctx.letterSpacing = ls + 'px';
  const m = _mctx.measureText(text);
  const pad = 10;
  const asc = Math.ceil(m.fontBoundingBoxAscent), desc = Math.ceil(m.fontBoundingBoxDescent);
  const c = mkCanvas(Math.ceil(m.width) + pad * 2, asc + desc + pad * 2);
  const g = c.getContext('2d');
  g.font = font; g.letterSpacing = ls + 'px'; g.fillStyle = color; g.textBaseline = 'alphabetic';
  g.fillText(text, pad, pad + asc);
  s = { c, w: m.width - ls, asc, desc, pad,
        inkL: m.actualBoundingBoxLeft, inkR: m.actualBoundingBoxRight - ls,
        inkA: m.actualBoundingBoxAscent, inkD: m.actualBoundingBoxDescent };
  _sprites.set(key, s);
  return s;
}
/** Draw sprite with its left edge at x and baseline at y. */
function drawS(s, x, y, alpha = 1) {
  if (alpha <= 0.004) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * clamp(alpha);
  ctx.drawImage(s.c, x - s.pad, y - s.asc - s.pad);
  ctx.globalAlpha = a;
}
/** Kerning-aware per-character layout (positions come from prefix widths). */
function layoutChars(text, font, color, ls) {
  _mctx.font = font; _mctx.letterSpacing = ls + 'px';
  const chars = [];
  for (let i = 0; i < text.length; i++) {
    const wPre = _mctx.measureText(text.slice(0, i + 1)).width;
    const wCh = _mctx.measureText(text[i]).width;
    chars.push({ ch: text[i], x: wPre - wCh, adv: wCh - ls, s: text[i] === ' ' ? null : sprite(text[i], font, color, 0) });
  }
  return { chars, w: _mctx.measureText(text).width - ls, whole: sprite(text, font, color, ls) };
}
/** Line that rises out of / exits through a mask. p: 0 hidden below → 1 at rest. exitP: 0 → 1 gone above. */
function maskLine(s, x, base, em, p, exitP = 0, alpha = 1) {
  if (p <= 0 || exitP >= 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 24, base - 0.86 * em, s.w + 48, 1.08 * em);
  ctx.clip();
  drawS(s, x, base + (1 - p) * 1.08 * em - exitP * 1.12 * em, alpha);
  ctx.restore();
}

/* text boxes at rest, for the automated title-safe audit */
const TEXT_BOXES = [];
function regText(name, s, x, base) {
  TEXT_BOXES.push({ name, l: x - s.inkL, r: x + s.inkR, t: base - s.inkA, b: base + s.inkD });
}

/* ------------------------------------------------------------------ static plates */
const BG = {};
function buildPlates() {
  // matte off-white with a soft key light and a touch of edge falloff
  let c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  let gr = g.createRadialGradient(960, 430, 80, 960, 430, 1150);
  gr.addColorStop(0, 'rgba(255,255,255,0.38)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(960, 540, 620, 960, 540, 1300);
  gr.addColorStop(0, 'rgba(110,96,78,0)'); gr.addColorStop(1, 'rgba(110,96,78,0.13)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  BG.paper = c;

  // deep charcoal
  c = mkCanvas(W, H); g = c.getContext('2d');
  g.fillStyle = C.char; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(960, 480, 60, 960, 480, 1200);
  gr.addColorStop(0, 'rgba(255,248,236,0.055)'); gr.addColorStop(1, 'rgba(255,248,236,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  BG.char = c;

  // brushed aluminium plate
  c = mkCanvas(W, H); g = c.getContext('2d');
  let lg = g.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, '#DCDDDE'); lg.addColorStop(0.55, '#CDCFD1'); lg.addColorStop(1, '#BDBFC2');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  brush(g, W, H, 5200, 0.055, 11);
  lg = g.createLinearGradient(300, 0, 1500, H);
  lg.addColorStop(0.18, 'rgba(255,255,255,0)'); lg.addColorStop(0.42, 'rgba(255,255,255,0.26)');
  lg.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  BG.alu = c;

  // static matte tooth: breaks up gradient banding in the H.264 encode
  c = mkCanvas(W, H); g = c.getContext('2d');
  const id = g.createImageData(W, H), rnd = mulberry32(2026);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = rnd() < 0.5 ? 0 : 255;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = Math.floor(rnd() * 9);
  }
  g.putImageData(id, 0, 0);
  BG.tooth = c;
}
function brush(g, w, h, n, maxA, seed) {      // horizontal brushed-metal streaks
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(rnd() * h), len = w * (0.15 + rnd() * 0.9), x = rnd() * w - len / 2;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * maxA})` : `rgba(40,42,46,${rnd() * maxA})`;
    g.fillRect(x, y, len, 1);
  }
}

/* ------------------------------------------------------------------ chrome (editorial furniture) */
const CH_FONT = `500 22px ${F.mono}`, CH_LS = 2.6, CH_BASE = 134;
function chrome(fg, rightText, pLeft = 1, pRight = 1, pRightExit = 0) {
  const sL = sprite('MONO-01', CH_FONT, fg, CH_LS);
  const sR = sprite(rightText, CH_FONT, fg, CH_LS);
  ctx.save();
  ctx.beginPath(); ctx.rect(SAFE.l - 10, CH_BASE - 24, SAFE.r - SAFE.l + 20, 32); ctx.clip();
  drawS(sL, SAFE.l, CH_BASE + (1 - pLeft) * 30, 0.72);
  drawS(sR, SAFE.r - sR.w, CH_BASE + (1 - pRight) * 30 - pRightExit * 30, 0.72);
  ctx.restore();
}

/* ================================================================== BEAT 1 — hook */
let HOOK;
function buildHook() {
  const size = 208, ls = -0.022 * size, font = `800 ${size}px ${F.disp}`;
  const l1 = layoutChars('SOUND,', font, C.char, ls), l2 = layoutChars('DISTILLED', font, C.char, ls);
  const dotR = 20, gap = 15;
  const x0 = Math.round((W - (l2.w + gap + dotR * 2)) / 2);
  const b1 = 512, b2 = 712;
  HOOK = { size, l1, l2, x0, b1, b2, dotR, dot: { x: x0 + l2.w + gap + dotR, y: b2 - dotR + 2 } };
  regText('hook/SOUND,', l1.whole, x0, b1);
  regText('hook/DISTILLED', l2.whole, x0, b2);
  TEXT_BOXES.push({ name: 'hook/period', l: HOOK.dot.x - dotR, r: HOOK.dot.x + dotR, t: HOOK.dot.y - dotR, b: HOOK.dot.y + dotR });
}
const RING_PULSES = [0.09, 1.25];                 // bell pings in the soundtrack
function hookRings(t) {
  const { dot } = HOOK;
  for (const t0 of RING_PULSES) {
    for (let k = 0; k < 3; k++) {
      const p = prog(t, t0 + k * 0.13, 2.3);
      if (p <= 0 || p >= 1) continue;
      const r = 22 + 1500 * E.out(p);
      const fade = Math.pow(1 - p, 1.6) * smooth(p * 14);
      ctx.beginPath(); ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
      ctx.lineWidth = lerp(3, 1.2, p);
      ctx.strokeStyle = k === 0 ? rgba(C.orange, 0.62 * fade) : rgba(C.char, 0.22 * fade);
      ctx.stroke();
    }
  }
}
function hookLine(L, x, base, t, tIn, tOut) {
  const em = HOOK.size;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 30, base - 0.86 * em, L.w + 60, 1.08 * em); ctx.clip();
  L.chars.forEach((c, i) => {
    if (!c.s) return;
    const p = spring(t - tIn - i * 0.028, 17, 0.8);
    const ex = E.in(prog(t, tOut + i * 0.01, 0.32));
    if (p <= 0 || ex >= 1) return;
    drawS(c.s, x + c.x, base + (1 - p) * 1.08 * em - ex * 1.12 * em);
  });
  ctx.restore();
}
/** The orange period: pops in, pulses, then flies off to become the dial. */
const BODY_DROP = 840;                             // top edge of the body sits just under the frame at 2.5
const bodyOffset = (t) => (t < 2.5 ? BODY_DROP : BODY_DROP * (1 - spring(t - 2.5, 7.88, 0.78)));   // crosses rest at 3.0
function dotState(t) {
  const P = HOOK.dot;
  const p = E.inOut(prog(t, 2.12, 0.83));
  let r = lerp(HOOK.dotR, SP.dr, p);
  if (t < 2.2) {
    r *= spring(t + 0.07, 22, 0.45);            // already arriving on frame 0, peaks on the 0.09 ping
    const tb = t - 1.25;
    if (tb > 0) r *= 1 + 0.28 * Math.exp(-9 * tb) * Math.sin(24 * tb);
  }
  return { x: lerp(P.x, SP.dx, p), y: P.y + p * (SP.dy + bodyOffset(t) - P.y), r: Math.max(0, r) };
}
function sceneHook(t) {
  ctx.drawImage(BG.paper, 0, 0);
  hookRings(t);
  hookLine(HOOK.l1, HOOK.x0, HOOK.b1, t, 0.16, 1.98);
  hookLine(HOOK.l2, HOOK.x0, HOOK.b2, t, 0.50, 2.04);
  const d = dotState(t);
  ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fillStyle = C.orange; ctx.fill();
  chrome(C.char, '01 — INTRODUCING', E.out(prog(t, 0.04, 0.5)), E.out(prog(t, 0.12, 0.5)), E.in(prog(t, 2.3, 0.2)));
}

/* ================================================================== BEAT 2 — product */
const SP = { cx: 960, cy: 492, w: 880, h: 500, r: 60, gx: 764, gy: 492, gR: 188, gr: 174, dx: 1190, dy: 520, dr: 80 };
const DIAL = { t0: 3.7, w: 5.0, z: 0.85, min: 135, sweep: 270 * 0.72, max: 72 };   // mirrored in make_audio.py
let PRODUCT;
function buildProduct() {
  const face = mkCanvas(SP.w, SP.h);
  brush(face.getContext('2d'), SP.w, SP.h, 1500, 0.07, 5);
  const holes = [{ r: 0, a: 0, k: 0 }];
  for (let k = 1; k <= 12; k++) {
    const n = 6 * k;
    for (let j = 0; j < n; j++) holes.push({ r: k * 13.2, a: (j / n) * Math.PI * 2 + (k % 2 ? 0 : Math.PI / n), k });
  }
  const capL = sprite('MODEL', `500 20px ${F.mono}`, C.char, 2.4);
  const capM = sprite('Wireless speaker', `600 34px ${F.disp}`, C.char, 0);
  const volL = sprite('VOLUME', `500 20px ${F.mono}`, C.char, 2.4);
  const digits = '0123456789'.split('').map((d) => sprite(d, `500 34px ${F.mono}`, C.char, 0));
  PRODUCT = { face, holes, capL, capM, volL, digits, label: sprite('MONO-01', `600 19px ${F.disp}`, 'rgba(27,26,25,0.66)', 2.6) };
  regText('product/MODEL', capL, SAFE.l, 908);
  regText('product/Wireless speaker', capM, SAFE.l, 952);
  regText('product/VOLUME', volL, SAFE.r - volL.w, 908);
  regText('product/vol-digits', digits[8], SAFE.r - digits[0].w, 952);
}
function bandsAt(t) {                               // interpolated spectrum frame
  const A = window.AUDIO_BANDS, f = clamp(t * FPS, 0, A.length - 1), i = Math.floor(f), u = f - i;
  const a = A[i], b = A[Math.min(i + 1, A.length - 1)];
  return a.map((v, k) => lerp(v, b[k], u));
}
const lowAt = (t) => { const b = bandsAt(t); return (b[0] + b[1] + b[2] + b[3]) / 4; };

function drawDial(x, y, r, phiDeg, detail) {
  ctx.save();
  ctx.translate(x, y);
  if (detail > 0) {                                 // contact shadow on the body
    ctx.save();
    ctx.shadowColor = `rgba(70,24,0,${0.42 * detail})`; ctx.shadowBlur = 30; ctx.shadowOffsetY = 16;
    ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2); ctx.fillStyle = C.orange; ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = C.orange; ctx.fill();
  if (detail > 0) {
    ctx.globalAlpha = detail;
    let g = ctx.createRadialGradient(-r * 0.3, -r * 0.36, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#FF8244'); g.addColorStop(0.55, '#FF4D00'); g.addColorStop(1, '#DB3D00');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.save();                                     // knurled rim + pointer turn with the dial
    ctx.rotate(phiDeg * Math.PI / 180);
    ctx.strokeStyle = 'rgba(120,32,0,0.42)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.865, Math.sin(a) * r * 0.865);
      ctx.lineTo(Math.cos(a) * r * 0.985, Math.sin(a) * r * 0.985); ctx.stroke();
    }
    ctx.restore();
    g = ctx.createLinearGradient(-r * 0.6, -r * 0.6, r * 0.6, r * 0.6);   // top cap
    g.addColorStop(0, '#FF6F2B'); g.addColorStop(1, '#F04600');
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,214,190,0.55)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, Math.PI * 0.95, Math.PI * 1.75); ctx.stroke();
    ctx.strokeStyle = 'rgba(110,30,0,0.38)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, -0.05 * Math.PI, Math.PI * 0.75); ctx.stroke();
    ctx.rotate(phiDeg * Math.PI / 180);             // pointer
    ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = C.paperHi;
    ctx.shadowColor = 'rgba(90,24,0,0.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
    ctx.beginPath(); ctx.moveTo(r * 0.36, 0); ctx.lineTo(r * 0.66, 0); ctx.stroke();
  }
  ctx.restore();
}

function drawSpeaker(t) {
  const off = bodyOffset(t);
  const landed = 1 - clamp(off / BODY_DROP);
  const push = 1 + 0.03 * E.soft(prog(t, 3.0, 3.0));
  const x0 = SP.cx - SP.w / 2, y0 = SP.cy - SP.h / 2;

  // floor contact shadow
  ctx.save();
  ctx.translate(SP.cx, y0 + SP.h + 46 + off * 0.08); ctx.scale(1, 0.07);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 500);
  sg.addColorStop(0, `rgba(27,26,25,${0.34 * landed * landed})`); sg.addColorStop(1, 'rgba(27,26,25,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 500, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(SP.cx, SP.cy + off); ctx.scale(push, push); ctx.translate(-SP.cx, -SP.cy);

  // body: soft drop shadow, extruded lower edge, brushed face
  ctx.save();
  ctx.shadowColor = 'rgba(27,26,25,0.26)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 34;
  ctx.beginPath(); ctx.roundRect(x0, y0 + 14, SP.w, SP.h, SP.r);
  let g = ctx.createLinearGradient(0, y0, 0, y0 + SP.h + 14);
  g.addColorStop(0, '#9B9DA0'); g.addColorStop(1, '#76787B');
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.roundRect(x0, y0, SP.w, SP.h, SP.r);
  g = ctx.createLinearGradient(0, y0, 0, y0 + SP.h);
  g.addColorStop(0, '#EEEFF0'); g.addColorStop(0.5, '#D9DBDD'); g.addColorStop(1, '#C3C5C8');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.drawImage(PRODUCT.face, x0, y0);
  g = ctx.createLinearGradient(x0 + 100, y0, x0 + SP.w - 60, y0 + SP.h);     // diagonal sheen
  g.addColorStop(0.2, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.30)'); g.addColorStop(0.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x0, y0, SP.w, SP.h);
  ctx.restore();
  ctx.beginPath(); ctx.roundRect(x0 + 1.5, y0 + 1.5, SP.w - 3, SP.h - 3, SP.r - 1.5);       // bevel
  g = ctx.createLinearGradient(0, y0, 0, y0 + SP.h);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(60,62,66,0.30)');
  ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.stroke();

  // grille: recessed bezel, darker well, perforations
  g = ctx.createLinearGradient(SP.gx - SP.gR, SP.gy - SP.gR, SP.gx + SP.gR, SP.gy + SP.gR);
  g.addColorStop(0, '#8E9093'); g.addColorStop(0.5, '#C9CBCD'); g.addColorStop(1, '#FAFAFA');
  ctx.beginPath(); ctx.arc(SP.gx, SP.gy, SP.gR, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(SP.gx, SP.gy, SP.gr, 0, Math.PI * 2);
  g = ctx.createRadialGradient(SP.gx + 30, SP.gy + 40, 20, SP.gx, SP.gy, SP.gr);
  g.addColorStop(0, '#BDBFC2'); g.addColorStop(1, '#A4A6A9');
  ctx.fillStyle = g; ctx.fill(); ctx.clip();
  ctx.shadowColor = 'rgba(20,20,22,0.55)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12; ctx.shadowOffsetX = 6;
  ctx.beginPath(); ctx.arc(SP.gx, SP.gy, SP.gr + 16, 0, Math.PI * 2); ctx.lineWidth = 30; ctx.strokeStyle = '#555'; ctx.stroke();
  ctx.restore();

  const tau = t - 3.04;
  if (tau > 0) {
    for (const hdl of PRODUCT.holes) {
      const sIn = spring(tau - hdl.k * 0.03, 24, 0.6);
      if (sIn <= 0.01) continue;
      const pulse = 1 + 0.30 * smooth((lowAt(t - hdl.k * 0.011) - 0.42) / 0.5);    // cone excursion ripples outward
      const hr = 4.3 * sIn * pulse;
      const hx = SP.gx + Math.cos(hdl.a) * hdl.r, hy = SP.gy + Math.sin(hdl.a) * hdl.r;
      ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fillStyle = '#201F1E'; ctx.fill();
      ctx.beginPath(); ctx.arc(hx, hy, hr + 0.7, 0.12 * Math.PI, 0.72 * Math.PI);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.1; ctx.stroke();
    }
  }

  // dial scale ticks, engraved mark, status LED
  const s = t >= DIAL.t0 ? spring(t - DIAL.t0, DIAL.w, DIAL.z) : 0;
  const phi = DIAL.min + DIAL.sweep * s;
  const detail = E.out(prog(t, 2.98, 0.4));
  ctx.lineCap = 'round';
  for (let i = 0; i <= 12; i++) {
    const a = 135 + 270 * i / 12, ar = a * Math.PI / 180;
    const pIn = E.out(prog(t, 3.1 + i * 0.022, 0.3));
    if (pIn <= 0) continue;
    const lit = clamp((phi - a) / 10 + 0.6);
    const r1 = SP.dr + 24, r2 = r1 + (i % 3 === 0 ? 17 : 11) * pIn;
    ctx.beginPath(); ctx.moveTo(SP.dx + Math.cos(ar) * r1, SP.dy + Math.sin(ar) * r1);
    ctx.lineTo(SP.dx + Math.cos(ar) * r2, SP.dy + Math.sin(ar) * r2);
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(C.char, lerp(0.22, 0.9, lit) * pIn); ctx.stroke();
  }
  drawS(PRODUCT.label, SP.dx - 104, y0 + 76, detail);
  const led = smooth(prog(t, 3.62, 0.12));
  ctx.beginPath(); ctx.arc(SP.dx + 98, y0 + 69, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = mixHex('#8C8E91', C.orange, led); ctx.fill();
  if (led > 0) {
    ctx.beginPath(); ctx.arc(SP.dx + 98, y0 + 69, 11, 0, Math.PI * 2); ctx.fillStyle = rgba(C.orange, 0.18 * led); ctx.fill();
  }
  if (t >= 2.95) drawDial(SP.dx, SP.dy, SP.dr, phi, detail);
  ctx.restore();

  if (t < 2.95) { const d = dotState(t); drawDial(d.x, d.y, d.r, DIAL.min, 0); }
  return s;
}

function sceneProduct(t) {
  ctx.drawImage(BG.paper, 0, 0);
  const s = drawSpeaker(t);

  // reactive waveform: real spectrum of the soundtrack, low bands at the centre
  const b = bandsAt(t), cy = 926;
  ctx.fillStyle = C.char;
  for (let i = 0; i < 47; i++) {
    const j = Math.abs(i - 23);
    const pIn = spring(t - 3.25 - j * 0.014, 22, 0.6);
    if (pIn <= 0) continue;
    const h = (5 + 58 * Math.pow(b[j], 1.35)) * pIn;
    ctx.globalAlpha = lerp(0.9, 0.42, j / 23);
    ctx.beginPath(); ctx.roundRect(960 + (i - 23) * 14 - 2.5, cy - h / 2, 5, h, 2.5); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // captions
  const pc = E.out(prog(t, 3.3, 0.55)), pc2 = E.out(prog(t, 3.38, 0.55));
  maskLine(PRODUCT.capL, SAFE.l, 908, 26, pc, 0, 0.55);
  maskLine(PRODUCT.capM, SAFE.l, 952, 40, pc2);
  maskLine(PRODUCT.volL, SAFE.r - PRODUCT.volL.w, 908, 26, pc, 0, 0.55);
  if (pc2 > 0) {
    const v = Math.min(DIAL.max, Math.round(DIAL.max * s)), dw = PRODUCT.digits[0].w;
    ctx.save(); ctx.beginPath(); ctx.rect(SAFE.r - dw * 2 - 10, 952 - 36, dw * 2 + 20, 46); ctx.clip();
    drawS(PRODUCT.digits[Math.floor(v / 10)], SAFE.r - dw * 2, 952 + (1 - pc2) * 44);
    drawS(PRODUCT.digits[v % 10], SAFE.r - dw, 952 + (1 - pc2) * 44);
    ctx.restore();
  }
  chrome(C.char, '02 — THE OBJECT', 1, E.out(prog(t, 2.5, 0.45)));
  slamWipe(t, 6.0, 'up', () => specBody(0, t));
}

/* ------------------------------------------------------------------ slam wipes (finish exactly on the cut) */
function slamWipe(t, tEnd, dir, drawIncoming) {
  const p = E.slam(prog(t, tEnd - 0.24, 0.24));
  if (p <= 0) return;
  let rc, edge;
  if (dir === 'up') { const y = H * (1 - p); rc = [0, y, W, H - y]; edge = [0, y - 6, W, 6]; }
  else if (dir === 'right') { const x = W * p; rc = [0, 0, x, H]; edge = [x, 0, 6, H]; }
  else { const y = H * p; rc = [0, 0, W, y]; edge = [0, y, W, 6]; }
  ctx.save(); ctx.beginPath(); ctx.rect(...rc); ctx.clip(); drawIncoming(); ctx.restore();
  ctx.fillStyle = C.orange; ctx.fillRect(...edge);
}

/* ================================================================== BEAT 3 — spec callouts */
const SPECS = [
  { cut: 6.0, plate: 'char', fg: C.paper, lines: ['40H', 'BATTERY'], desc: 'UP TO 40 HOURS PER CHARGE' },
  { cut: 7.5, plate: 'paper', fg: C.char, lines: ['LOSSLESS', 'WIRELESS'], desc: '24-BIT / 96 KHZ · ZERO COMPRESSION' },
  { cut: 9.0, plate: 'alu', fg: C.char, lines: ['MACHINED', 'ALUMINUM'], desc: 'CNC-MILLED FROM A SINGLE BLOCK' },
];
const SPEC = { tx: 920, ix: 552, iy: 540, idxBase: 372 };
function buildSpecs() {
  // one shared size so the three cuts sit on identical baselines
  const probe = (txt, size) => { _mctx.font = `800 ${size}px ${F.disp}`; _mctx.letterSpacing = (-0.02 * size) + 'px'; return _mctx.measureText(txt).width + 0.02 * size; };
  const widest = Math.max(...SPECS.flatMap((s) => s.lines.map((l) => probe(l, 150))));
  const size = Math.min(150, Math.floor(150 * 780 / widest));
  SPEC.size = size;
  SPEC.b1 = SPEC.idxBase + 40 + Math.round(0.727 * size);
  SPEC.b2 = SPEC.b1 + Math.round(size * 1.02);
  SPEC.db = SPEC.b2 + 62;
  const font = `800 ${size}px ${F.disp}`, ls = -0.02 * size;
  SPECS.forEach((sp, k) => {
    sp.l1 = layoutChars(sp.lines[0], font, sp.fg, ls);
    sp.l2 = sprite(sp.lines[1], font, sp.fg, ls);
    sp.d = sprite(sp.desc, `500 23px ${F.mono}`, sp.fg, 1.6);
    sp.idx = sprite('0' + (k + 1), `600 26px ${F.mono}`, C.orange, 1);
    sp.of = sprite('/ 03', `500 26px ${F.mono}`, sp.fg, 1);
    regText(`spec${k + 1}/line1`, sp.l1.whole, SPEC.tx, SPEC.b1);
    regText(`spec${k + 1}/line2`, sp.l2, SPEC.tx, SPEC.b2);
    regText(`spec${k + 1}/desc`, sp.d, SPEC.tx, SPEC.db);
    regText(`spec${k + 1}/index`, sp.idx, SPEC.tx, SPEC.idxBase);
  });
  SPECS[0].digits = '0123456789'.split('').map((d) => sprite(d, font, SPECS[0].fg, 0));
}
function strokeTrim(build, len, p, lw, color) {      // trim-path draw-on
  if (p <= 0) return;
  ctx.save();
  ctx.beginPath(); build();
  ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (p < 1) ctx.setLineDash([len * p, len * 2]);
  ctx.stroke();
  ctx.restore();
}
const beatBump = (tau, at) => { const d = tau - at; return d <= 0 ? 0 : Math.exp(-9 * d) * smooth(d / 0.03); };

function iconBattery(tau, fg) {
  const { ix, iy } = SPEC, w = 372, h = 184, x = ix - w / 2 - 12, y = iy - h / 2;
  strokeTrim(() => ctx.roundRect(x, y, w, h, 30), 2 * (w + h), E.out(prog(tau, 0, 0.5)), 9, fg);
  const nub = spring(tau - 0.16, 26, 0.55);
  if (nub > 0) { ctx.fillStyle = fg; ctx.beginPath(); ctx.roundRect(x + w + 13, iy - 34 * nub, 20 * nub, 68 * nub, 7); ctx.fill(); }
  const cw = 56, gap = 12, ch = 140, cx0 = x + 22, cyB = iy + ch / 2;
  for (let c = 0; c < 5; c++) {
    const p = spring(tau - 0.22 - c * 0.065, 30, 0.55);
    if (p <= 0) continue;
    const last = c === 4;
    const bump = last ? 1 + 0.06 * (beatBump(tau, 0.5) + beatBump(tau, 1.0)) : 1;
    const hh = ch * p * bump;
    // charge current keeps travelling through the cells on the beat, so the hold is never frozen
    const ph = (tau * 2 - c * 0.13) % 1, wave = Math.pow(Math.sin(Math.PI * clamp(ph / 0.6)), 2) * smooth(prog(tau, 0.55, 0.2));
    ctx.fillStyle = last ? C.orange : rgba(fg, 1 - 0.30 * wave);
    ctx.beginPath(); ctx.roundRect(cx0 + c * (cw + gap), cyB - hh - 5 * wave * (last ? 1 : 0.6), cw, Math.max(0, hh), 8); ctx.fill();
  }
}
function iconBroadcast(tau, fg) {
  const { ix, iy } = SPEC;
  const dp = spring(tau, 24, 0.5) * (1 + 0.10 * (beatBump(tau, 0.5) + beatBump(tau, 1.0)));
  ctx.beginPath(); ctx.arc(ix, iy, 24 * Math.max(0, dp), 0, Math.PI * 2); ctx.fillStyle = C.orange; ctx.fill();
  for (let j = 0; j < 3; j++) {
    const tj = tau - 0.10 - j * 0.075;
    const sw = spring(tj, 22, 0.58);
    if (sw <= 0.01) continue;
    const breathe = smooth(prog(tau, 0.45, 0.25)) * Math.sin(Math.PI * 2 * (tau * 2 - j * 0.17));
    const r = 78 + j * 54 - 26 * (1 - E.out(prog(tj, 0, 0.4))) + 5 * breathe;
    const half = (40 * Math.PI / 180) * sw;
    ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(fg, 0.78 + 0.22 * breathe);
    ctx.beginPath(); ctx.arc(ix, iy, r, -half, half); ctx.stroke();
    ctx.beginPath(); ctx.arc(ix, iy, r, Math.PI - half, Math.PI + half); ctx.stroke();
  }
}
function iconMachined(tau, fg) {
  const { ix, iy } = SPEC, S = 320, x = ix - S / 2, y = iy - S / 2, R = 104;
  strokeTrim(() => ctx.roundRect(x, y, S, S, 40), 4 * S, E.out(prog(tau, 0, 0.45)), 9, fg);
  for (let j = 0; j < 4; j++) {                       // corner bores
    const p = spring(tau - 0.28 - j * 0.06, 28, 0.55);
    if (p <= 0) continue;
    const px = ix + (j % 2 ? 1 : -1) * (S / 2 - 46), py = iy + (j < 2 ? -1 : 1) * (S / 2 - 46);
    ctx.beginPath(); ctx.arc(px, py, 9 * p, 0, Math.PI * 2); ctx.fillStyle = fg; ctx.fill();
  }
  const lap = E.inOut(prog(tau, 0.10, 0.62));         // tool path around the main bore
  if (lap > 0) {
    ctx.beginPath(); ctx.arc(ix, iy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lap);
    ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.strokeStyle = fg; ctx.stroke();
  }
  const turn = 1.4 * E.soft(prog(tau, 0.62, 0.9));     // inner tool-path trace keeps turning
  const p2 = E.out(prog(tau, 0.62, 0.4));
  if (p2 > 0) {
    ctx.save(); ctx.translate(ix, iy); ctx.rotate(turn);
    ctx.setLineDash([10, 12]); ctx.lineWidth = 4; ctx.strokeStyle = rgba(fg, 0.6 * p2);
    ctx.beginPath(); ctx.arc(0, 0, 66 * lerp(0.8, 1, p2), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const cross = E.out(prog(tau, 0.5, 0.35));
  if (cross > 0) {
    ctx.lineWidth = 4; ctx.strokeStyle = fg; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ix - 24 * cross, iy); ctx.lineTo(ix + 24 * cross, iy);
    ctx.moveTo(ix, iy - 24 * cross); ctx.lineTo(ix, iy + 24 * cross); ctx.stroke();
  }
  const dim = E.out(prog(tau, 0.4, 0.45));             // dimension line
  if (dim > 0) {
    const yy = y - 44, hw = S / 2 * dim;
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(fg, 0.65); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(ix - hw, yy); ctx.lineTo(ix + hw, yy);
    ctx.moveTo(ix - hw, yy - 11); ctx.lineTo(ix - hw, yy + 11); ctx.moveTo(ix + hw, yy - 11); ctx.lineTo(ix + hw, yy + 11); ctx.stroke();
  }
  if (lap > 0) {                                      // the cutter: the one orange mark
    const a = -Math.PI / 2 + Math.PI * 2 * lap;
    const park = 1 + 0.35 * beatBump(tau, 0.72);
    ctx.beginPath(); ctx.arc(ix + Math.cos(a) * R, iy + Math.sin(a) * R, 14 * smooth(lap * 12) * park, 0, Math.PI * 2);
    ctx.fillStyle = C.orange; ctx.fill();
  }
}
/* Title type pre-rolls under the incoming wipe so line 1 crosses its rest position exactly on the cut
 * (spring(w=20, z=0.74) first crosses 1.0 at 0.18 s): the click lands on the arrival, not the start.
 * Icons run on the un-shifted clock so their foley stays locked to the soundtrack. */
const SPEC_PREROLL = 0.20;
function specBody(k, t) {
  const sp = SPECS[k], tauI = t - sp.cut + 3 / FPS, tau = t - sp.cut + SPEC_PREROLL;
  const { tx, size } = SPEC;
  ctx.drawImage(BG[sp.plate], 0, 0);
  [iconBattery, iconBroadcast, iconMachined][k](tauI, sp.fg);

  // index row
  const pi = E.out(prog(tau, 0, 0.35));
  drawS(sp.idx, tx - 26 * (1 - pi), SPEC.idxBase, pi);
  const hl = E.out(prog(tau, 0.08, 0.45));
  ctx.fillStyle = rgba(sp.fg, 0.5); ctx.fillRect(tx + 54, SPEC.idxBase - 10, 96 * hl, 2);
  drawS(sp.of, tx + 166 - 16 * (1 - hl), SPEC.idxBase, 0.5 * hl);

  // title: two masked lines on a snappy spring
  const p1 = spring(tau - 0.0, 20, 0.74), p2 = spring(tau - 0.05, 20, 0.74);
  if (k === 0) {
    const v = Math.round(40 * E.out(prog(tauI, 0, 0.6)));
    const L = sp.l1, ds = [Math.floor(v / 10), v % 10];
    ctx.save(); ctx.beginPath(); ctx.rect(tx - 24, SPEC.b1 - 0.86 * size, L.w + 48, 1.08 * size); ctx.clip();
    const yy = SPEC.b1 + (1 - p1) * 1.08 * size;
    ds.forEach((d, i) => { const g = sp.digits[d]; drawS(g, tx + L.chars[i].x + (L.chars[i].adv - g.w) / 2, yy); });
    drawS(L.chars[2].s, tx + L.chars[2].x, yy);
    ctx.restore();
  } else {
    maskLine(sp.l1.whole, tx, SPEC.b1, size, p1);
  }
  maskLine(sp.l2, tx, SPEC.b2, size, p2);
  const pd = E.out(prog(tau, 0.30, 0.45));
  drawS(sp.d, tx, SPEC.db + 14 * (1 - pd), 0.66 * pd);

  chrome(sp.fg, '03 — THE DETAILS');
}
function sceneSpec(k, t) {
  specBody(k, t);
  if (k === 0) slamWipe(t, 7.5, 'right', () => specBody(1, t));
  if (k === 1) slamWipe(t, 9.0, 'down', () => specBody(2, t));
  if (k === 2 && t > 10.27) {                          // EQ columns close like shutters, the finale already idling inside them
    ctx.save(); ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const p = E.in(prog(t, 10.28 + Math.abs(i - 15.5) / 15.5 * 0.07, 0.15));
      if (p > 0) ctx.rect(i * 60, 540 - H * p / 2, 60, H * p);
    }
    ctx.clip(); sceneFinale(t); ctx.restore();
  }
}

/* ================================================================== BEAT 4 — finale */
const FINALE_HITS = [10.75, 11.0, 11.25, 11.5, 11.625, 11.75, 11.875,
  12.0, 12.0625, 12.125, 12.1875, 12.25, 12.3125, 12.375, 12.4375];        // same list as make_audio.py
const NB = 48, PITCH = W / NB, BARW = 22, T_SNAP = 12.5, T_MERGE = 12.6;
function sceneFinale(t) {
  ctx.drawImage(BG.char, 0, 0);
  const tau = t - 10.5 + 1 / FPS;

  const rp = prog(tau, 0, 0.9);                         // shock ring off the bass pulse
  if (rp > 0 && rp < 1) {
    ctx.beginPath(); ctx.arc(960, 540, 40 + 1300 * E.out(rp), 0, Math.PI * 2);
    ctx.lineWidth = lerp(4, 1, rp); ctx.strokeStyle = rgba(C.paper, 0.5 * Math.pow(1 - rp, 2)); ctx.stroke();
  }

  const build = E.build(prog(tau, 0.1, 1.75));
  let amp = 120 + 440 * build + 330 * Math.exp(-tau / 0.17) * smooth(tau / 0.035);
  let bump = 0;
  for (const th of FINALE_HITS) { const d = t - th + 1 / FPS; if (d > 0) bump += Math.exp(-d / 0.065) * smooth(d / 0.025); }
  amp *= 1 + 0.30 * Math.min(bump, 1.4);

  const snap = E.snap(prog(t + 1 / FPS, T_SNAP, 0.12)); // bars collapse to a line, already moving on the 12.5 frame …
  const merge = E.hardInOut(prog(t, T_MERGE, 0.33));     // … the line condenses into the hyphen
  const hyW = END.hyW, hyH = END.hyH, kx = lerp(1, hyW / W, merge);
  ctx.fillStyle = mixHex(C.paper, C.orange, merge);
  for (let i = 0; i < NB; i++) {
    const win = lerp(0.55 + 0.45 * Math.pow(Math.cos(Math.PI * (i - 23.5) / 54), 2), 1, build * build);
    const n = (0.5 + 0.5 * Math.sin(i * 0.61 + tau * 7.3)) * (0.55 + 0.45 * Math.sin(i * 0.23 - tau * 4.1 + 1.7));
    const half = lerp(Math.min(560, amp * win * (0.36 + 0.64 * n)), 3, snap);
    const hh = lerp(half, hyH / 2, merge);
    const bx = 960 + ((i + 0.5) * PITCH - 960) * kx, bw = lerp(BARW, PITCH * hyW / W + 2, merge);
    ctx.fillRect(bx - bw / 2, END.hyY - hh + (540 - END.hyY) * (1 - merge), bw, hh * 2);
  }
}

/* ================================================================== BEAT 5 — end card */
let END;
function buildEnd() {
  const size = 220, font = `800 ${size}px ${F.disp}`, ls = -0.02 * size;
  const sM = sprite('MONO', font, C.char, ls), s01 = sprite('01', font, C.char, ls);
  const hyW = Math.round(0.30 * size), hyH = Math.round(0.105 * size), gap = Math.round(0.065 * size);
  const total = sM.w + gap + hyW + gap + s01.w;
  const x0 = Math.round((W - total) / 2), base = 566;
  const sub = sprite('Listen Closer.', `500 46px ${F.text}`, C.char, 0.2);
  END = { size, sM, s01, hyW, hyH, gap, x0, base, hyX: x0 + sM.w + gap + hyW / 2, hyY: base - Math.round(0.345 * size), sub, subBase: base + 104 };
  regText('end/MONO', sM, x0, base);
  regText('end/01', s01, END.hyX + hyW / 2 + gap, base);
  regText('end/Listen Closer.', sub, Math.round(960 - sub.w / 2), END.subBase);
}
function sceneEnd(t) {
  ctx.drawImage(BG.paper, 0, 0);
  const tau = t - 13.0 + 1 / FPS;
  const p = E.out(prog(tau, 0, 0.85));                   // one curve drives the whole unfold
  const hx = lerp(960, END.hyX, p);

  const rp = prog(tau, 0.02, 1.5);                       // single quiet ring: callback to the hook
  if (rp > 0 && rp < 1) {
    ctx.beginPath(); ctx.arc(hx, END.hyY, 40 + 980 * E.out(rp), 0, Math.PI * 2);
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(C.char, 0.2 * Math.pow(1 - rp, 2)); ctx.stroke();
  }
  // MONO slides out leftward from behind the hyphen, 01 rightward
  const edgeL = hx - END.hyW / 2 - END.gap, edgeR = hx + END.hyW / 2 + END.gap;
  ctx.save(); ctx.beginPath(); ctx.rect(0, END.base - END.size, edgeL + 4, END.size * 1.3); ctx.clip();
  drawS(END.sM, edgeL - END.sM.w + END.sM.w * (1 - p), END.base);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(edgeR - 4, END.base - END.size, W, END.size * 1.3); ctx.clip();
  drawS(END.s01, edgeR - END.s01.w * (1 - p), END.base);
  ctx.restore();
  const lock = 1 + 0.5 * Math.exp(-tau / 0.06);          // hyphen flashes wide on the hit, settles
  ctx.fillStyle = C.orange;
  ctx.fillRect(hx - END.hyW / 2, END.hyY - END.hyH / 2 * lock, END.hyW, END.hyH * lock);

  const ps = E.out(prog(tau, 0.45, 0.7));
  maskLine(END.sub, Math.round(960 - END.sub.w / 2), END.subBase, 46, ps, 0, 0.8 * smooth(ps * 1.6));
}

/* ================================================================== master */
function renderFrame(i) {
  const t = i / FPS;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (t < 2.5) sceneHook(t);
  else if (t < 6.0) sceneProduct(t);
  else if (t < 7.5) sceneSpec(0, t);
  else if (t < 9.0) sceneSpec(1, t);
  else if (t < 10.5) sceneSpec(2, t);
  else if (t < 13.0) sceneFinale(t);
  else sceneEnd(t);
  ctx.drawImage(BG.tooth, 0, 0);
}

async function init() {
  await Promise.all([
    `800 200px ${F.disp}`, `600 34px ${F.disp}`, `500 46px ${F.text}`, `500 22px ${F.mono}`, `600 26px ${F.mono}`,
  ].map((f) => document.fonts.load(f)));
  buildPlates(); buildHook(); buildProduct(); buildSpecs(); buildEnd();
  window.TEXT_BOXES = TEXT_BOXES; window.SAFE = SAFE; window.TOTAL_FRAMES = TOTAL_FRAMES;
  window.renderFrame = renderFrame;
  window.READY = true;
}
init();
