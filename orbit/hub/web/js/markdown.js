// The Markdown models write in chat, turned into safe HTML: every piece of text is escaped, and
// only http and https links become links. Matches what the phone shows.

const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const INLINE = new RegExp(
  [
    /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/.source,
    /\*\*(.+?)\*\*/.source,
    /~~(.+?)~~/.source,
    /`([^`\n]+)`/.source,
    /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/.source,
    /(https?:\/\/[^\s<>()\[\]]+[^\s<>()\[\].,;:!?'"])/.source,
    /(?<![\w@])@([\p{L}\p{N}_]+)/.source,
  ].join('|'),
  'gu',
);

const link = (url, text) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;

/** Inline marks: links, bold, struck, code, italic, bare addresses and @mentions in their agent's color. */
export function inline(text, mentions = {}) {
  let out = '';
  let cursor = 0;
  for (const m of text.matchAll(INLINE)) {
    out += escape(text.slice(cursor, m.index));
    if (m[1]) out += link(m[2], escape(m[1]));
    else if (m[3]) out += `<strong>${inline(m[3], mentions)}</strong>`;
    else if (m[4]) out += `<del>${escape(m[4])}</del>`;
    else if (m[5]) out += `<code>${escape(m[5])}</code>`;
    else if (m[6]) out += `<em>${escape(m[6])}</em>`;
    else if (m[7]) out += link(m[7], escape(m[7].replace(/^https?:\/\/(www\.)?/, '')));
    else {
      const color = mentions[m[8].toLowerCase()];
      out += color ? `<strong style="color:${color}">${escape(m[0])}</strong>` : `<strong>${escape(m[0])}</strong>`;
    }
    cursor = m.index + m[0].length;
  }
  return out + escape(text.slice(cursor));
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const alignOf = (c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left');

/** Markdown to HTML. Copes with half-arrived text, since replies render as they stream. */
export function markdown(source, mentions = {}) {
  const lines = source.split('\n');
  const out = [];
  let paragraph = [];
  let quote = [];
  let list = null; // { tag, items: [{ level, html }] }
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map((l) => inline(l, mentions)).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map((l) => inline(l, mentions)).join('<br>')}</blockquote>`);
    quote = [];
  };
  const flushList = () => {
    if (!list) return;
    // Nested items become nested lists of the same kind.
    let html = '';
    let depth = -1;
    for (const item of list.items) {
      while (depth < item.level) { html += `<${list.tag}>`; depth++; }
      while (depth > item.level) { html += `</${list.tag}>`; depth--; }
      html += `<li>${item.html}</li>`;
    }
    while (depth >= 0) { html += `</${list.tag}>`; depth--; }
    out.push(html);
    list = null;
  };
  const flushAll = () => { flushParagraph(); flushQuote(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      flushAll();
      const language = line.trimStart().slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) code.push(lines[i++]);
      out.push(
        `<div class="code-block"><div class="code-head"><span class="lang">${escape(language || 'code')}</span>` +
          `<button class="copy" data-copy><svg class="icon" viewBox="0 0 24 24"><rect x="8.9" y="8.9" width="10.8" height="10.8" rx="2.4"/><path d="M5 14.9V7.2q0-2.2 2.2-2.2h7.7"/></svg><span>Copy</span></button></div>` +
          `<pre><code>${escape(code.join('\n'))}</code></pre></div>`,
      );
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && SEPARATOR.test(lines[i + 1])) {
      flushAll();
      const header = cells(line);
      const align = cells(lines[i + 1]).map(alignOf);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      i--;
      const cell = (tag, c, k) => `<${tag} style="text-align:${align[k] ?? 'left'}">${inline(c, mentions)}</${tag}>`;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${header.map((c, k) => cell('th', c, k)).join('')}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${header.map((_, k) => cell('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`,
      );
      continue;
    }
    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
    flushQuote();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^(\s*)[-*•+]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line) && !paragraph.length) { flushAll(); out.push('<hr>'); continue; }
    if (heading) { flushAll(); const n = Math.min(heading[1].length, 6); out.push(`<h${n}>${inline(heading[2], mentions)}</h${n}>`); continue; }
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag && (bullet ? bullet[1] : numbered[1]).length === 0) flushList();
      list ??= { tag, items: [] };
      const indent = (bullet ? bullet[1] : numbered[1]).length;
      list.items.push({ level: Math.min(Math.floor(indent / 2), 3), html: inline(bullet ? bullet[2] : numbered[3], mentions) });
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushAll();
  return out.join('');
}

/**
 * While a reply is still arriving, hides a half-typed marker at the very end and closes any bold or
 * code span it has opened, so raw ** and backticks never flash on screen.
 */
export function closeOpenMarkup(text) {
  if ((text.match(/```/g) ?? []).length % 2 === 1) return text;
  let out = text.replace(/\*+$/, '').replace(/(^|\n)[ \t]*(?:[-*•]|\d{1,3}[.)])[ \t]*$/, '$1');
  if ((out.match(/`/g) ?? []).length % 2 === 1) out = out.endsWith('`') ? out.slice(0, -1) : `${out}\``;
  if ((out.match(/\*\*/g) ?? []).length % 2 === 1) out += '**';
  return out;
}
