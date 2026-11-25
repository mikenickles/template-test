// Build "From Chatbots to Autonomous Agents" — a 10-slide, 16:9 executive deck.
// Usage: node build_deck.js            -> writes ai-agents-v1.pptx next to this file
//
// Structure: one theme, three layouts (DARK_TITLE, CONTENT, DARK_CLOSING), four sections.
// Every shape gets an objectName whose prefix encodes its typographic role; audit_deck.py
// reads those prefixes to enforce the size rules (title 28–36pt, body >= 16pt, label >= 12pt).

const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const lu = require("react-icons/lu");
const fs = require("fs");
const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));

const OUT = path.join(__dirname, "ai-agents-v1.pptx");

// pptxgenjs writes Office's stock palette into theme1.xml; replace it with ours so scheme colors
// resolve correctly, then mend the two package faults pptxgenjs is known to emit.
async function applyTheme(file, theme) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const scheme = `<a:clrScheme name="${theme.name}">` + slots.map((k) => `<a:${k}><a:srgbClr val="${theme.colors[k]}"/></a:${k}>`).join("") + "</a:clrScheme>";
  const part = "ppt/theme/theme1.xml";
  const xml = (await zip.file(part).async("string"))
    .replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_, h) => `${h}${theme.name}"`);
  zip.file(part, xml);
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) { delete zip.files[name]; continue; }
    if (!name.endsWith(".xml")) continue;
    let x = await zip.file(name).async("string");
    const bad = x.match(/<a:srgbClr val="((?![0-9A-Fa-f]{6}")[^"]*)"/);
    if (bad) throw new Error(`${name}: scheme color "${bad[1]}" passed to a hex-only option`);
    if (x.includes('<c:crossesAt val="autoZero"/>')) zip.file(name, x.replaceAll('<c:crossesAt val="autoZero"/>', '<c:crosses val="autoZero"/>'));
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

// ---------------------------------------------------------------------------------------------
// Palette — ink + warm paper, one accent (pine) and one highlight (vermilion). Contrast checked:
// ink/paper 14.9:1, slate/paper 5.8:1, pine/white 7.5:1, vermilion/paper 4.6:1.
// ---------------------------------------------------------------------------------------------
const HEX = {
  ink: "1D2125", white: "FFFFFF", night: "15181B", paper: "F7F5F0",
  pine: "0F5F58", verm: "C4461A", slate: "5B6168",
  pineTint: "E4EEEB", vermTint: "FBE9E1", hair: "DAD5CC",
  // extras outside the 12 theme slots
  sand: "EFEBE3", deepPine: "0B4A45", chartGray: "7C858C",
  nightText: "F7F5F0", nightMuted: "9AA3AA", nightPine: "A9D5CC", nightVerm: "F08A5D",
  ring: "2C3238", ringStrong: "3F474F", pineRing: "BCD4CF",
};

const THEME = {
  name: "Plan Act Verify",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: HEX.ink, lt1: HEX.white, dk2: HEX.night, lt2: HEX.paper,
    accent1: HEX.pine, accent2: HEX.verm, accent3: HEX.slate,
    accent4: HEX.pineTint, accent5: HEX.vermTint, accent6: HEX.hair,
    hlink: HEX.pine, folHlink: HEX.slate,
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333" x 7.5"
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "From Chatbots to Autonomous Agents: How Modern AI Systems Plan, Act, and Verify";
pres.subject = "Executive briefing on autonomous AI agents";
pres.author = "AI Strategy Briefing";

const C = pres.SchemeColor;
const S = pres.shapes;
const SERIF = "Cambria"; // heading face, for display text outside title placeholders
const W = 13.333, H = 7.5, MX = 0.65, CW = W - 2 * MX; // content width 12.033"

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function svgToPng(svg, size = 256) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
    .then((b) => "image/png;base64," + b.toString("base64"));
}
function icon(name, hex, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(lu[name], { size: String(size) }))
    .replace(/currentColor/g, "#" + hex);
  return svgToPng(svg, size);
}

let n = 0;
const uid = (role) => `${role}-${++n}`;

// Plain text box: never inherits padding, always flagged as a text box.
function text(slide, role, str, opts) {
  slide.addText(str, { isTextBox: true, margin: 0, objectName: uid(role), ...opts });
}
function shape(slide, role, kind, opts) {
  slide.addShape(kind, { objectName: uid(role), ...opts });
}
function line(slide, x1, y1, x2, y2, lineOpts) {
  // pptxgenjs draws lines top-left -> bottom-right; flip to point the arrowhead the right way
  shape(slide, "arrow", S.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, line: { ...lineOpts },
  });
}
const shadow = () => ({ type: "outer", color: "1D2125", opacity: 0.08, blur: 10, offset: 2, angle: 90 });

// The deck's motif: an orbit (the agent loop) with three nodes — Plan, Act, Verify.
// `sweep` is the vermilion progress arc in degrees (OOXML angles: clockwise from 3 o'clock).
function orbit(slide, cx, cy, R, { sweep, labels = true, ringColor = HEX.ring, orbitColor = HEX.ringStrong, labelColor = HEX.nightMuted }) {
  const ring = (r, color, width) => shape(slide, "deco-ring", S.OVAL, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, line: { color, width } });
  ring(R * 1.32, ringColor, 1);
  ring(R * 0.66, ringColor, 1);
  ring(R, orbitColor, 1.25);
  shape(slide, "deco-arc", S.ARC, {
    x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, angleRange: sweep,
    line: { color: HEX.nightVerm, width: 3, endArrowType: "triangle" },
  });
  const core = Math.max(0.2, R * 0.15);
  shape(slide, "deco-core", S.OVAL, { x: cx - core / 2, y: cy - core / 2, w: core, h: core, fill: { color: HEX.pine } });
  const nodes = [
    { deg: 270, label: "PLAN", fill: HEX.nightPine },
    { deg: 30, label: "ACT", fill: HEX.nightVerm },
    { deg: 150, label: "VERIFY", fill: HEX.nightText },
  ];
  const d = Math.max(0.16, R * 0.085);
  for (const nd of nodes) {
    const a = (nd.deg * Math.PI) / 180;
    const px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
    shape(slide, "deco-node", S.OVAL, { x: px - d / 2, y: py - d / 2, w: d, h: d, fill: { color: nd.fill }, line: { color: HEX.night, width: 2 } });
    if (labels) {
      // Labels ride the outer ring, directly outward from their node; a background-coloured
      // fill masks the ring behind them so no line ever runs through a letter.
      const lr = R * 1.32, lx = cx + lr * Math.cos(a), ly = cy + lr * Math.sin(a);
      const lw = 0.2 + nd.label.length * 0.14;
      text(slide, "label-orbit", nd.label, {
        x: lx - lw / 2, y: ly - 0.15, w: lw, h: 0.3, fontSize: 12, bold: true, charSpacing: 3,
        color: labelColor, align: "center", valign: "middle", fill: { color: HEX.night },
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------
async function main() {
  const glyph = await svgToPng(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="34" r="22" fill="none" stroke="#${HEX.pine}" stroke-width="6"/><circle cx="32" cy="12" r="9" fill="#${HEX.verm}"/></svg>`, 128);
  const I = {};
  const want = {
    exec: ["LuRepeat", HEX.pine], tools: ["LuWrench", HEX.pine], recover: ["LuLifeBuoy", HEX.pine], horizon: ["LuHourglass", HEX.pine],
    chat: ["LuMessageCircle", HEX.slate], agent: ["LuWorkflow", HEX.pine],
    shield: ["LuShieldCheck", HEX.verm],
    ctx: ["LuMessageSquareText", HEX.white], pad: ["LuNotebookPen", HEX.white], db: ["LuDatabase", HEX.white],
    plan: ["LuMap", HEX.pine], build: ["LuHammer", HEX.pine], qa: ["LuFlaskConical", HEX.pine], review: ["LuBadgeCheck", HEX.pine],
  };
  for (const [k, [name, hex]] of Object.entries(want)) I[k] = await icon(name, hex);

  // ---- Layouts --------------------------------------------------------------------------------
  pres.defineSlideMaster({
    title: "DARK_TITLE",
    background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: MX, y: 2.35, w: 6.3, h: 1.5, fontSize: 36, bold: true, color: HEX.nightText, margin: 0, align: "left", valign: "top", lineSpacingMultiple: 0.95 }, text: "" } },
      { placeholder: { options: { name: "subtitle", type: "body", x: MX, y: 4.02, w: 6.3, h: 0.5, fontSize: 22, color: HEX.nightPine, margin: 0, align: "left", valign: "top" }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: C.background2 },
    objects: [
      { image: { x: MX, y: 6.93, w: 0.17, h: 0.17, data: glyph, altText: "Orbit glyph (deck motif)" } },
      { text: { text: "From Chatbots to Autonomous Agents", options: { x: MX + 0.27, y: 6.88, w: 5, h: 0.27, fontSize: 12, color: C.accent3, margin: 0, valign: "middle" } } },
      { placeholder: { options: { name: "kicker", type: "body", x: MX, y: 0.5, w: 9, h: 0.3, fontSize: 12, bold: true, color: C.accent2, margin: 0, align: "left", valign: "middle" }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.84, w: CW, h: 0.7, fontSize: 32, bold: true, color: C.text1, margin: 0, align: "left", valign: "middle" }, text: "" } },
    ],
    slideNumber: { x: W - MX - 0.6, y: 6.88, w: 0.6, h: 0.27, fontFace: "Calibri", fontSize: 12, color: HEX.slate, align: "right", margin: 0 },
  });
  pres.defineSlideMaster({
    title: "DARK_CLOSING",
    background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 1.67, y: 3.25, w: 10, h: 1.4, fontSize: 34, bold: true, color: HEX.nightText, align: "center", valign: "middle", margin: 0 }, text: "" } },
    ],
  });

  const content = (section, kicker, title) => {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
    s.addText(kicker, { placeholder: "kicker", charSpacing: 3, align: "left" });
    s.addText(title, { placeholder: "title", align: "left" });
    return s;
  };

  // ============================================================================================
  // SLIDE 1 — Title
  // ============================================================================================
  pres.addSection({ title: "Opening" });
  {
    const s = pres.addSlide({ masterName: "DARK_TITLE", sectionTitle: "Opening" });
    text(s, "kicker", "EXECUTIVE BRIEFING  ·  NOVEMBER 2026", {
      x: MX, y: 1.9, w: 6.3, h: 0.3, fontSize: 13, bold: true, charSpacing: 3, color: HEX.nightVerm, valign: "middle",
    });
    s.addText("From Chatbots to Autonomous Agents", { placeholder: "title", align: "left" });
    s.addText("How Modern AI Systems Plan, Act, and Verify", { placeholder: "subtitle", align: "left" });
    text(s, "body-desc", "A field guide to the loop, memory, and guardrails behind reliable agents", {
      x: MX, y: 4.72, w: 5.6, h: 0.62, fontSize: 16, color: HEX.nightMuted, valign: "top",
    });
    orbit(s, 9.95, 3.75, 2.1, { sweep: [278, 22] });
    s.addNotes("Open on the shift: AI is moving from answering questions to completing work. Today: how agents plan, act, and verify — and what it takes to run them reliably.");
  }

  // ============================================================================================
  // SLIDE 2 — Big stat: the paradigm shift
  // ============================================================================================
  {
    const s = content("Opening", "THE SHIFT", "The unit of work shifted from reply to task");
    // Left: dominant metric
    text(s, "stat-hero", "100+", { x: MX, y: 1.8, w: 5.4, h: 2.5, fontFace: SERIF, fontSize: 150, bold: true, color: C.accent1, valign: "bottom" });
    text(s, "body-stat", "steps in one agent task", { x: MX, y: 4.42, w: 5.4, h: 0.45, fontSize: 24, bold: true, color: C.text1, valign: "top" });
    text(s, "body-stat", "vs. a single turn for a chat reply", { x: MX, y: 4.92, w: 5.4, h: 0.4, fontSize: 18, color: C.accent3, valign: "top" });
    text(s, "label-note", "Illustrative; varies by task", { x: MX, y: 5.55, w: 5.4, h: 0.28, fontSize: 12, italic: true, color: C.accent3, valign: "middle" });

    // Right: step trace — one dot vs. a 100-dot waffle
    const x0 = 6.75, pitch = 0.296, dot = 0.2;
    text(s, "label-trace", "CHATBOT", { x: x0, y: 2.3, w: 4, h: 0.28, fontSize: 12, bold: true, charSpacing: 2, color: C.accent3, valign: "middle" });
    shape(s, "deco-dot", S.OVAL, { x: x0, y: 2.76, w: dot, h: dot, fill: { color: C.accent1 } });
    text(s, "body-trace", "1 prompt → 1 reply", { x: x0 + 0.38, y: 2.68, w: 4, h: 0.36, fontSize: 16, color: C.text1, valign: "middle" });

    text(s, "label-trace", "AUTONOMOUS AGENT", { x: x0, y: 3.42, w: 4, h: 0.28, fontSize: 12, bold: true, charSpacing: 2, color: C.accent3, valign: "middle" });
    // deterministic plan/act/verify sequence: plan, then runs of 2-5 acts, each closed by a verify
    const seq = [];
    let seed = 7, cycles = 0;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    while (seq.length < 100) {
      if (cycles % 4 === 0) seq.push("plan");
      const acts = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < acts; i++) seq.push("act");
      seq.push("verify");
      cycles++;
    }
    const fillOf = { plan: C.text1, act: C.accent1, verify: C.accent2 };
    seq.slice(0, 100).forEach((kind, i) => {
      const col = i % 20, row = Math.floor(i / 20);
      shape(s, "deco-dot", S.OVAL, { x: x0 + col * pitch, y: 3.84 + row * pitch, w: dot, h: dot, fill: { color: fillOf[kind] } });
    });
    // legend
    const ly = 5.55;
    [["Plan", C.text1], ["Act", C.accent1], ["Verify", C.accent2]].forEach(([lab, col], i) => {
      const lx = x0 + i * 1.12;
      shape(s, "deco-dot", S.OVAL, { x: lx, y: ly + 0.06, w: 0.16, h: 0.16, fill: { color: col } });
      text(s, "label-legend", lab, { x: lx + 0.26, y: ly, w: 0.8, h: 0.28, fontSize: 14, color: C.text1, valign: "middle" });
    });
    text(s, "label-note", "Each dot = one step", { x: x0 + 3.55, y: ly, w: 2.33, h: 0.28, fontSize: 12, italic: true, color: C.accent3, align: "right", valign: "middle" });
    s.addNotes("A chatbot answers in one turn. An agent working a real task — say, fixing a bug — routinely takes dozens to hundreds of model and tool steps, checking its work along the way. The number is illustrative; the order of magnitude is the point.");
  }

  // ============================================================================================
  // SLIDE 3 — Side-by-side comparison
  // ============================================================================================
  pres.addSection({ title: "How Agents Work" });
  {
    const s = content("How Agents Work", "LLM VS. AGENT", "Agents trade one-shot answers for closed loops");
    const top = 1.95, headH = 0.78, rowH = 0.93, rows0 = top + headH;
    const llm = { x: 3.45, w: 4.05 }, agt = { x: 7.9, w: CW - (7.9 - MX) };
    const cardH = headH + 4 * rowH + 0.12;
    shape(s, "card", S.ROUNDED_RECTANGLE, { x: llm.x, y: top, w: llm.w, h: cardH, rectRadius: 0.12, fill: { color: HEX.sand } });
    shape(s, "card", S.ROUNDED_RECTANGLE, { x: agt.x, y: top, w: agt.w, h: cardH, rectRadius: 0.12, fill: { color: C.background1 }, line: { color: C.accent1, width: 1.5 }, shadow: shadow() });
    // column headers
    s.addImage({ data: I.chat, x: llm.x + 0.35, y: top + 0.24, w: 0.32, h: 0.32, objectName: uid("icon"), altText: "Chat bubble icon" });
    text(s, "body-head", "Standard LLM", { x: llm.x + 0.8, y: top + 0.17, w: 3, h: 0.46, fontSize: 20, bold: true, color: C.text1, valign: "middle" });
    s.addImage({ data: I.agent, x: agt.x + 0.35, y: top + 0.24, w: 0.32, h: 0.32, objectName: uid("icon"), altText: "Workflow icon" });
    text(s, "body-head", "Autonomous Agent", { x: agt.x + 0.8, y: top + 0.17, w: 3.5, h: 0.46, fontSize: 20, bold: true, color: C.accent1, valign: "middle" });

    const dims = [
      ["Execution", I.exec, "Single pass", "Loops until the goal is met"],
      ["Tool Use", I.tools, "None, or one fixed call", "Selects and chains tools"],
      ["Error Recovery", I.recover, "User must re-prompt", "Detects and self-corrects"],
      ["Horizon", I.horizon, "One turn, seconds", "Many steps, hours"],
    ];
    dims.forEach(([dim, ic, a, b], i) => {
      const y = rows0 + i * rowH, cy = y + rowH / 2;
      shape(s, "deco-iconbg", S.OVAL, { x: MX, y: cy - 0.27, w: 0.54, h: 0.54, fill: { color: C.accent4 } });
      s.addImage({ data: ic, x: MX + 0.13, y: cy - 0.14, w: 0.28, h: 0.28, objectName: uid("icon"), altText: `${dim} icon` });
      text(s, "body-dim", dim, { x: MX + 0.75, y: cy - 0.22, w: 1.95, h: 0.44, fontSize: 18, bold: true, color: C.text1, valign: "middle" });
      for (const [col, str, colr] of [[llm, a, C.accent3], [agt, b, C.text1]]) {
        shape(s, "rule", S.LINE, { x: col.x + 0.35, y, w: col.w - 0.7, h: 0, line: { color: C.accent6, width: 0.75 } });
        text(s, "body-cell", str, { x: col.x + 0.35, y: cy - 0.22, w: col.w - 0.7, h: 0.44, fontSize: 18, color: colr, valign: "middle" });
      }
    });
    s.addNotes("Four dimensions separate a model from an agent. The agent's defining trait is the closed loop: it acts, observes, and corrects without a human re-prompting it.");
  }

  // ============================================================================================
  // SLIDE 4 — Core agent loop diagram
  // ============================================================================================
  {
    const s = content("How Agents Work", "ARCHITECTURE", "Every agent runs the same core loop");
    const cx = 6.9, cy = 4.3, R = 1.85, nw = 2.1, nh = 0.9;
    const node = (deg) => { const a = (deg * Math.PI) / 180; return { x: cx + R * Math.cos(a) - nw / 2, y: cy + R * Math.sin(a) - nh / 2 }; };
    const nodes = [
      { deg: 270, title: "Plan", sub: "Break into steps" },
      { deg: 0, title: "Tool Call", sub: "Act via APIs, code" },
      { deg: 90, title: "Observe", sub: "Read the results" },
      { deg: 180, title: "Verify", sub: "Check against goal", hot: true },
    ].map((d) => ({ ...d, ...node(d.deg), w: nw, h: nh }));

    // Track arcs: the parts of the circle not covered by a node (with a small gap), each ending in an arrow.
    const pad = 0.09;
    const covered = (deg) => {
      const a = (deg * Math.PI) / 180, px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
      return nodes.some((b) => px > b.x - pad && px < b.x + b.w + pad && py > b.y - pad && py < b.y + b.h + pad);
    };
    const segs = [];
    let start = null;
    for (let t = 0; t <= 360; t += 0.25) {
      const out = !covered(t % 360);
      if (out && start === null) start = t;
      if (!out && start !== null) { segs.push([start, t - 0.25]); start = null; }
    }
    for (const [a, b] of segs) {
      const mid = (a + b) / 2;
      const iterate = mid > 180 && mid < 270; // Verify (left) -> Plan (top)
      shape(s, "arrow", S.ARC, {
        x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, angleRange: [a, b],
        line: { color: iterate ? C.accent2 : C.accent1, width: iterate ? 2.5 : 2, endArrowType: "triangle", dashType: iterate ? "dash" : "solid" },
      });
    }
    for (const nd of nodes) {
      shape(s, "card", S.ROUNDED_RECTANGLE, {
        x: nd.x, y: nd.y, w: nd.w, h: nd.h, rectRadius: 0.1,
        fill: { color: nd.hot ? C.accent5 : C.background1 }, line: { color: nd.hot ? C.accent2 : C.accent6, width: nd.hot ? 1.5 : 1 }, shadow: shadow(),
      });
      text(s, "body-node", nd.title, { x: nd.x, y: nd.y + 0.1, w: nd.w, h: 0.38, fontSize: 18, bold: true, color: nd.hot ? C.accent2 : C.text1, align: "center", valign: "middle" });
      text(s, "label-node", nd.sub, { x: nd.x, y: nd.y + 0.49, w: nd.w, h: 0.3, fontSize: 14, color: C.accent3, align: "center", valign: "middle" });
    }
    // "Iterate" label inside the loop, beside the vermilion arc
    text(s, "label-iterate", "Iterate on failure", { x: cx - 1.22, y: cy - 1.06, w: 1.75, h: 0.3, fontSize: 14, bold: true, italic: true, color: C.accent2, align: "left", valign: "middle" });

    // Input / output column (outside world)
    const plan = nodes[0], verify = nodes[3];
    const io = (y, title, sub, fill) => {
      shape(s, "card", S.ROUNDED_RECTANGLE, { x: MX, y, w: 2.2, h: nh, rectRadius: 0.1, fill: { color: fill } });
      text(s, "body-node", title, { x: MX, y: y + 0.1, w: 2.2, h: 0.38, fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle" });
      text(s, "label-node", sub, { x: MX, y: y + 0.49, w: 2.2, h: 0.3, fontSize: 14, color: C.background1, align: "center", valign: "middle" });
    };
    io(plan.y, "Goal", "User intent", C.text1);
    io(verify.y, "Result", "Checked output", C.accent1);
    line(s, MX + 2.2 + 0.08, plan.y + nh / 2, plan.x - 0.1, plan.y + nh / 2, { color: C.text1, width: 1.75, endArrowType: "triangle" });
    line(s, verify.x - 0.1, verify.y + nh / 2, MX + 2.2 + 0.08, verify.y + nh / 2, { color: C.accent1, width: 1.75, endArrowType: "triangle" });
    text(s, "label-pass", "Pass", { x: MX + 2.3, y: verify.y + nh / 2 - 0.38, w: 1.0, h: 0.3, fontSize: 12, bold: true, color: C.accent1, align: "center", valign: "middle" });

    // Right annotation
    const rx = 10.3, rw = W - MX - rx;
    s.addImage({ data: I.shield, x: rx, y: 2.25, w: 0.46, h: 0.46, objectName: uid("icon"), altText: "Shield with check mark icon" });
    text(s, "body-callout", "The verify step makes autonomy safe to scale", { x: rx, y: 2.9, w: rw, h: 1.35, fontFace: SERIF, fontSize: 20, bold: true, color: C.text1, valign: "top" });
    text(s, "label-checks", "TYPICAL CHECKS", { x: rx, y: 4.42, w: rw, h: 0.28, fontSize: 12, bold: true, charSpacing: 2, color: C.accent3, valign: "middle" });
    ["Tests", "Schemas", "Critic model"].forEach((chip, i) => {
      const cw = 0.35 + chip.length * 0.105;
      shape(s, "card", S.ROUNDED_RECTANGLE, { x: rx, y: 4.82 + i * 0.52, w: cw, h: 0.36, rectRadius: 0.18, fill: { color: C.accent5 } });
      text(s, "label-chip", chip, { x: rx, y: 4.82 + i * 0.52, w: cw, h: 0.36, fontSize: 14, color: C.text1, align: "center", valign: "middle" });
    });
    s.addNotes("Goal in, checked result out. Inside, the loop: plan, call a tool, observe what happened, verify against the goal — and iterate when a check fails. Verification is the step most teams under-invest in.");
  }

  // ============================================================================================
  // SLIDE 5 — Memory: 3-column card grid
  // ============================================================================================
  {
    const s = content("How Agents Work", "MEMORY", "Agents remember on three distinct layers");
    const cards = [
      { tag: "LAYER 01", title: "Short-Term Context", frag: "What the model\nsees right now", ic: I.ctx, life: "One call", pct: 0.18 },
      { tag: "LAYER 02", title: "Working Scratchpad", frag: "Plans and notes\ncarried between steps", ic: I.pad, life: "One task", pct: 0.55 },
      { tag: "LAYER 03", title: "Long-Term Retrieval", frag: "Past knowledge\nrecalled on demand", ic: I.db, life: "Across sessions", pct: 1 },
    ];
    const gap = 0.39, cw = (CW - 2 * gap) / 3, y = 1.95, ch = 4.6;
    cards.forEach((c, i) => {
      const x = MX + i * (cw + gap), ix = x + 0.4, iw = cw - 0.8;
      shape(s, "card", S.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.14, fill: { color: C.background1 }, line: { color: C.accent6, width: 0.75 }, shadow: shadow() });
      shape(s, "deco-iconbg", S.OVAL, { x: ix, y: y + 0.42, w: 0.9, h: 0.9, fill: { color: C.accent1 } });
      s.addImage({ data: c.ic, x: ix + 0.23, y: y + 0.65, w: 0.44, h: 0.44, objectName: uid("icon"), altText: `${c.title} icon` });
      text(s, "label-tag", c.tag, { x: ix, y: y + 1.6, w: iw, h: 0.28, fontSize: 12, bold: true, charSpacing: 3, color: C.accent2, valign: "middle" });
      text(s, "body-cardtitle", c.title, { x: ix, y: y + 1.95, w: iw, h: 0.48, fontFace: SERIF, fontSize: 22, bold: true, color: C.text1, valign: "middle" });
      text(s, "body-frag", c.frag, { x: ix, y: y + 2.5, w: iw, h: 0.8, fontSize: 18, color: C.accent3, valign: "top" });
      shape(s, "rule", S.LINE, { x: ix, y: y + 3.5, w: iw, h: 0, line: { color: C.accent6, width: 0.75 } });
      text(s, "label-persist", "PERSISTS", { x: ix, y: y + 3.68, w: 1.1, h: 0.28, fontSize: 12, bold: true, charSpacing: 2, color: C.accent3, valign: "middle" });
      text(s, "label-life", c.life, { x: ix + 1.2, y: y + 3.68, w: iw - 1.2, h: 0.28, fontSize: 14, bold: true, color: C.text1, align: "right", valign: "middle" });
      shape(s, "deco-meter", S.ROUNDED_RECTANGLE, { x: ix, y: y + 4.08, w: iw, h: 0.12, rectRadius: 0.06, fill: { color: C.accent4 } });
      shape(s, "deco-meter", S.ROUNDED_RECTANGLE, { x: ix, y: y + 4.08, w: Math.max(0.12, iw * c.pct), h: 0.12, rectRadius: 0.06, fill: { color: C.accent1 } });
    });
    s.addNotes("Three layers, three lifetimes. The context window is what the model sees this call; the scratchpad carries plans and intermediate results across steps; retrieval brings back knowledge from past sessions on demand.");
  }

  // ============================================================================================
  // SLIDE 6 — Native chart
  // ============================================================================================
  pres.addSection({ title: "Operating at Scale" });
  {
    const s = content("Operating at Scale", "ECONOMICS  ·  ILLUSTRATIVE MODEL", "Autonomy raises the ceiling—and the bill");
    const labels = ["Single Prompt", "Fixed Workflow", "Autonomous Agent"];
    const data = [
      { name: "Task Complexity", labels, values: [2, 5, 9] },
      { name: "Reliability", labels, values: [8, 9, 6] },
      { name: "Token Cost", labels, values: [1, 3, 8] },
    ];
    const font = "+mn-lt";
    s.addChart(pres.charts.BAR, data, {
      x: 0.5, y: 1.85, w: 8.3, h: 4.75, objectName: uid("chart"),
      barDir: "col", barGrouping: "clustered", barGapWidthPct: 55, barOverlapPct: -8,
      chartColors: [HEX.pine, HEX.chartGray, HEX.verm],
      showTitle: true, title: "Illustrative framework model · relative index (0–10)",
      titleFontFace: font, titleFontSize: 14, titleColor: HEX.slate, titleBold: false,
      showLegend: true, legendPos: "t", legendFontFace: font, legendFontSize: 14, legendColor: HEX.ink,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: font, dataLabelFontSize: 13, dataLabelColor: HEX.ink, dataLabelFontBold: true,
      catAxisLabelFontFace: font, catAxisLabelFontSize: 16, catAxisLabelColor: HEX.ink, catAxisLineShow: true, catAxisLineColor: HEX.hair,
      catGridLine: { style: "none" },
      valAxisMinVal: 0, valAxisMaxVal: 10, valAxisMajorUnit: 2, valAxisHidden: false,
      valAxisLabelFontFace: font, valAxisLabelFontSize: 12, valAxisLabelColor: HEX.slate, valAxisLineShow: false,
      valGridLine: { color: HEX.hair, size: 0.75 },
    });
    // Commentary column
    const rx = 9.3, rw = W - MX - rx;
    const callouts = [
      ["4.5×", "task complexity handled", C.accent1],
      ["8×", "token cost per task", C.accent2],
      ["−2 pts", "reliability—unless\nverification is built in", C.accent3],
    ];
    callouts.forEach(([num, lab, col], i) => {
      const y = 2.0 + i * 1.5;
      if (i > 0) shape(s, "rule", S.LINE, { x: rx, y: y - 0.2, w: rw, h: 0, line: { color: C.accent6, width: 0.75 } });
      text(s, "stat-callout", num, { x: rx, y, w: rw, h: 0.66, fontFace: SERIF, fontSize: 40, bold: true, color: col, valign: "middle" });
      text(s, "body-callout", lab, { x: rx, y: y + 0.66, w: rw, h: 0.62, fontSize: 16, color: C.text1, valign: "top" });
    });
    s.addNotes("An illustrative framework, not benchmark data. Moving from a single prompt to an autonomous agent raises the complexity you can tackle — and the token bill. Reliability dips unless verification is designed in; fixed workflows remain the most predictable tier.");
  }

  // ============================================================================================
  // SLIDE 7 — Multi-agent orchestration pipeline
  // ============================================================================================
  {
    const s = content("Operating at Scale", "ORCHESTRATION", "Specialist agents hand off like a real team");
    const steps = [
      { role: "Planner", frag: "Turns the goal\ninto a spec", ic: I.plan },
      { role: "Builder", frag: "Produces code\nor content", ic: I.build },
      { role: "QA Tester", frag: "Runs tests,\nflags defects", ic: I.qa },
      { role: "Reviewer", frag: "Approves against\nthe goal", ic: I.review },
    ];
    const handoffs = ["Spec", "Draft", "Report"];
    const cw = 2.3, gap = (CW - 4 * cw) / 3, y = 2.0, ch = 2.4, midY = y + ch / 2;
    const xs = steps.map((_, i) => MX + i * (cw + gap));
    steps.forEach((st, i) => {
      const x = xs[i];
      shape(s, "card", S.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.12, fill: { color: C.background1 }, line: { color: C.accent6, width: 0.75 }, shadow: shadow() });
      shape(s, "deco-num", S.OVAL, { x: x + 0.3, y: y + 0.3, w: 0.5, h: 0.5, fill: { color: C.accent1 } });
      text(s, "label-num", String(i + 1), { x: x + 0.3, y: y + 0.3, w: 0.5, h: 0.5, fontFace: SERIF, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle" });
      s.addImage({ data: st.ic, x: x + cw - 0.3 - 0.4, y: y + 0.35, w: 0.4, h: 0.4, objectName: uid("icon"), altText: `${st.role} icon` });
      text(s, "body-role", st.role, { x: x + 0.3, y: y + 1.05, w: cw - 0.6, h: 0.45, fontFace: SERIF, fontSize: 20, bold: true, color: C.text1, valign: "middle" });
      text(s, "body-frag", st.frag, { x: x + 0.3, y: y + 1.55, w: cw - 0.6, h: 0.75, fontSize: 16, color: C.accent3, valign: "top" });
      if (i < 3) {
        const x1 = x + cw + 0.1, x2 = xs[i + 1] - 0.1;
        line(s, x1, midY, x2, midY, { color: C.accent1, width: 1.75, endArrowType: "triangle" });
        text(s, "label-handoff", handoffs[i], { x: x + cw, y: midY - 0.4, w: gap, h: 0.3, fontSize: 12, bold: true, color: C.accent1, align: "center", valign: "middle" });
      }
    });
    // Feedback loop: QA Tester -> Builder
    const qx = xs[2] + cw / 2, bx = xs[1] + cw / 2, yb = y + ch, yl = yb + 0.5;
    line(s, qx, yb + 0.08, qx, yl, { color: C.accent2, width: 1.75 });
    line(s, qx, yl, bx, yl, { color: C.accent2, width: 1.75 });
    line(s, bx, yl, bx, yb + 0.08, { color: C.accent2, width: 1.75, endArrowType: "triangle" });
    text(s, "label-loop", "Defects loop back", { x: bx, y: yl + 0.08, w: qx - bx, h: 0.32, fontSize: 14, italic: true, bold: true, color: C.accent2, align: "center", valign: "middle" });
    // Takeaway
    text(s, "body-takeaway", "Independent roles: no agent grades its own work.", {
      x: MX, y: 5.95, w: CW, h: 0.5, fontFace: SERIF, fontSize: 20, italic: true, color: C.text1, valign: "middle",
    });
    s.addNotes("Split the work across specialists. The planner writes the spec, the builder produces, QA tests and sends defects back, and a reviewer approves against the original goal. The structure matters because no agent grades its own work.");
  }

  // ============================================================================================
  // SLIDE 8 — Failure modes & guardrails table
  // ============================================================================================
  {
    const s = content("Operating at Scale", "GUARDRAILS", "Each failure mode needs a designed guardrail");
    const hair = { pt: 0.75, color: HEX.hair }, none = { type: "none" };
    const head = (t, align = "left") => ({ text: t, options: { bold: true, fontSize: 16, color: C.background1, fill: { color: C.text1 }, align, border: [none, none, none, none] } });
    const rows = [
      ["01", "Hallucinated Tool Args", "Invalid calls", "Strict schemas, argument validation"],
      ["02", "Infinite Loops", "Burned budget", "Step caps, loop detection"],
      ["03", "Context Drift", "Lost objective", "Goal pinning, state summaries"],
      ["04", "Unsafe Execution", "Irreversible harm", "Sandboxing, least privilege, human approval"],
    ];
    const body = rows.map(([num, mode, impact, guard]) => {
      const base = { fill: { color: C.background1 }, border: [none, none, hair, none], valign: "middle" };
      return [
        { text: num, options: { ...base, fontFace: SERIF, fontSize: 22, bold: true, color: C.accent2, align: "center" } },
        { text: mode, options: { ...base, fontSize: 18, bold: true, color: C.text1 } },
        { text: impact, options: { ...base, fontSize: 16, color: C.accent3 } },
        { text: guard, options: { ...base, fontSize: 16, color: C.text1 } },
      ];
    });
    s.addTable([[head("", "center"), head("Failure Mode"), head("Impact"), head("Guardrail")], ...body], {
      x: MX, y: 1.95, w: CW, colW: [0.85, 3.45, 2.75, 4.983], rowH: [0.6, 0.95, 0.95, 0.95, 0.95],
      margin: [0.08, 0.22, 0.08, 0.22], valign: "middle", objectName: uid("table"),
    });
    s.addNotes("Four failure modes cause most agent incidents. Each has a known engineering answer: validate tool arguments against schemas, cap steps and budgets, pin the goal and summarize state, and sandbox anything irreversible behind least privilege and human approval.");
  }

  // ============================================================================================
  // SLIDE 9 — Executive takeaways
  // ============================================================================================
  pres.addSection({ title: "Close" });
  {
    const s = content("Close", "TAKEAWAYS", "Three principles for production-grade agents");
    // Left: pull-quote panel with a faint orbit echo
    const px = MX, py = 1.95, pw = 4.2, ph = 4.6;
    shape(s, "card", S.ROUNDED_RECTANGLE, { x: px, y: py, w: pw, h: ph, rectRadius: 0.14, fill: { color: C.accent4 } });
    const ocx = px + pw - 1.15, ocy = py + ph - 1.15;
    [0.6, 0.38].forEach((r) => shape(s, "deco-ring", S.OVAL, { x: ocx - r, y: ocy - r, w: 2 * r, h: 2 * r, line: { color: HEX.pineRing, width: 1.25 } }));
    shape(s, "deco-arc", S.ARC, { x: ocx - 0.6, y: ocy - 0.6, w: 1.2, h: 1.2, angleRange: [278, 22], line: { color: C.accent2, width: 2.5, endArrowType: "triangle" } });
    shape(s, "deco-node", S.OVAL, { x: ocx - 0.08, y: ocy - 0.68, w: 0.16, h: 0.16, fill: { color: C.accent1 } });
    text(s, "label-quote", "THE BOTTOM LINE", { x: px + 0.45, y: py + 0.45, w: pw - 0.9, h: 0.28, fontSize: 12, bold: true, charSpacing: 3, color: HEX.deepPine, valign: "middle" });
    text(s, "stat-quote", "Reliability is\nengineered,\nnot prompted.", { x: px + 0.45, y: py + 0.9, w: pw - 0.9, h: 1.7, fontFace: SERIF, fontSize: 30, bold: true, color: HEX.deepPine, valign: "top" });

    const rx = 5.35, rw = W - MX - rx;
    const items = [
      ["Earn autonomy in stages", "Start fixed; expand where evals prove value"],
      ["Make verification non-negotiable", "Tests, schemas, or reviewers gate every action"],
      ["Instrument and budget everything", "Trace every step; cap tokens, time, and risk"],
    ];
    const rowH = 1.53;
    items.forEach(([head, frag], i) => {
      const y = py + i * rowH;
      if (i > 0) shape(s, "rule", S.LINE, { x: rx, y: y - 0.04, w: rw, h: 0, line: { color: C.accent6, width: 0.75 } });
      text(s, "stat-num", String(i + 1), { x: rx, y: y + 0.18, w: 0.65, h: 0.75, fontFace: SERIF, fontSize: 40, bold: true, color: C.accent2, valign: "top" });
      text(s, "body-principle", head, { x: rx + 0.85, y: y + 0.26, w: rw - 0.85, h: 0.45, fontFace: SERIF, fontSize: 22, bold: true, color: C.text1, valign: "middle" });
      text(s, "body-frag", frag, { x: rx + 0.85, y: y + 0.76, w: rw - 0.85, h: 0.4, fontSize: 18, color: C.accent3, valign: "middle" });
    });
    s.addNotes("If you remember three things: grant autonomy only where evaluations justify it; never let an agent act without a check; and treat agents like production systems — traced, budgeted, and observable.");
  }

  // ============================================================================================
  // SLIDE 10 — Closing / Q&A
  // ============================================================================================
  {
    const s = pres.addSlide({ masterName: "DARK_CLOSING", sectionTitle: "Close" });
    orbit(s, W / 2, 1.85, 0.8, { sweep: [278, 262], labels: false }); // closed loop, no labels: the statement says it
    s.addText("Agents that plan, act, and verify\nturn AI from answers into outcomes.", { placeholder: "title" });
    text(s, "label-qa", "QUESTIONS & DISCUSSION", { x: 2.67, y: 5.0, w: 8, h: 0.4, fontSize: 18, bold: true, charSpacing: 4, color: HEX.nightVerm, align: "center", valign: "middle" });
    text(s, "label-sign", "From Chatbots to Autonomous Agents  ·  Executive Briefing 2026", { x: 2.67, y: 6.45, w: 8, h: 0.3, fontSize: 14, color: HEX.nightMuted, align: "center", valign: "middle" });
    s.addNotes("Close the loop: the opening showed the loop half-drawn; here it is complete. Invite questions on where to pilot agents first and what guardrails to require.");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("Wrote", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
