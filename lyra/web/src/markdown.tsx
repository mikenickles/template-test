import type { ReactNode } from "react";

/**
 * The small slice of Markdown Lyra uses in chat: paragraphs, bullet and
 * numbered lists, quotes, **bold**, *italic*, `code` and links.
 * Builds React elements directly, so message text is never treated as HTML.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\*[^*\s][^*]*\*)/g;

export function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(
        <a key={k} href={href} target="_blank" rel="noreferrer noopener">
          {label}
        </a>,
      );
    } else if (tok.startsWith("http"))
      out.push(
        <a key={k} href={tok} target="_blank" rel="noreferrer noopener">
          {tok.replace(/^https?:\/\//, "")}
        </a>,
      );
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const lines = (nodes: string[], key: string) =>
  nodes.flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)] : inline(l, `${key}-${i}`)));

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const kindOf = (r: string) => (BULLET.test(r) ? "ul" : NUMBER.test(r) ? "ol" : r.startsWith(">") ? "quote" : "p");

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: ReactNode[] = [];
  blocks.forEach((block, b) => {
    const rows = block.split("\n").filter((r) => r.trim() !== "");
    // a block can mix a lead-in line with the list under it ("Three things:" then "- cake"):
    // each run of the same kind of line is its own paragraph or list
    const runs: { kind: string; rows: string[] }[] = [];
    for (const r of rows) {
      const kind = kindOf(r);
      const last = runs[runs.length - 1];
      if (last && last.kind === kind) last.rows.push(r);
      else runs.push({ kind, rows: [r] });
    }
    runs.forEach((run, n) => {
      const key = `b${b}-${n}`;
      if (run.kind === "ul") {
        out.push(
          <ul key={key}>
            {run.rows.map((r, i) => (
              <li key={i}>{inline(r.replace(BULLET, ""), `${key}-${i}`)}</li>
            ))}
          </ul>,
        );
      } else if (run.kind === "ol") {
        const start = Number(run.rows[0].match(/\d+/)![0]);
        out.push(
          <ol key={key} start={start} style={{ counterReset: `n ${start - 1}` }}>
            {run.rows.map((r, i) => (
              <li key={i}>{inline(r.replace(NUMBER, ""), `${key}-${i}`)}</li>
            ))}
          </ol>,
        );
      } else if (run.kind === "quote") {
        out.push(<blockquote key={key}>{lines(run.rows.map((r) => r.replace(/^>\s?/, "")), key)}</blockquote>);
      } else {
        out.push(<p key={key}>{lines(run.rows.map((r) => r.replace(/^#+\s+/, "")), key)}</p>);
      }
    });
  });
  return <>{out}</>;
}

/**
 * Most replies read like a normal text. The first line gets headline styling
 * only on the rare long reply (like a morning brief), where a clear point on
 * top helps: several parts and a lot to read under it.
 */
export function headline(text: string): boolean {
  const blocks = text.trim().split(/\n{2,}/).filter((b) => b.trim());
  if (blocks.length < 3 || text.trim().length < 400) return false;
  const first = blocks[0].trim();
  return first.length <= 120 && !first.includes("\n") && !/^([-*•>]|\d+[.)])\s/.test(first);
}

/**
 * Docs (Phase 13) use more of Markdown than chat: headings, lists (with checkboxes),
 * tables, quotes and dividers. Still React elements only, never HTML.
 */
export function DocMarkdown({ text }: { text: string }) {
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < rows.length) {
    const r = rows[i];
    const key = `d${k++}`;
    if (!r.trim()) {
      i++;
      continue;
    }
    const h = r.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 1, 4);
      const Tag = (`h${level}` as "h2" | "h3" | "h4");
      out.push(<Tag key={key}>{inline(h[2], key)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(r)) {
      out.push(<hr key={key} />);
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(r) && /^\s*\|?\s*:?-{2,}/.test(rows[i + 1] ?? "")) {
      const head = cells(r);
      i += 2;
      const body: string[][] = [];
      while (i < rows.length && /^\s*\|.*\|\s*$/.test(rows[i])) body.push(cells(rows[i++]));
      out.push(
        <div className="doc-table" key={key}>
          <table>
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c, `${key}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>{row.map((c, j) => <td key={j}>{inline(c, `${key}-${ri}-${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*•]\s+/.test(r)) {
      const items: string[] = [];
      while (i < rows.length && /^\s*[-*•]\s+/.test(rows[i])) items.push(rows[i++].replace(/^\s*[-*•]\s+/, ""));
      out.push(
        <ul key={key} className={items.some((t) => /^\[[ xX]\]\s/.test(t)) ? "checklist" : undefined}>
          {items.map((t, j) => {
            const box = t.match(/^\[([ xX])\]\s+(.*)$/);
            return box ? (
              <li key={j} className={box[1] === " " ? "todo" : "done"}>
                <span className="box" aria-label={box[1] === " " ? "Not done" : "Done"} role="img" />
                {inline(box[2], `${key}-${j}`)}
              </li>
            ) : (
              <li key={j}>{inline(t, `${key}-${j}`)}</li>
            );
          })}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(r)) {
      const items: string[] = [];
      const start = Number(r.match(/\d+/)![0]);
      while (i < rows.length && /^\s*\d+[.)]\s+/.test(rows[i])) items.push(rows[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push(
        <ol key={key} start={start} style={{ counterReset: `n ${start - 1}` }}>
          {items.map((t, j) => <li key={j}>{inline(t, `${key}-${j}`)}</li>)}
        </ol>,
      );
      continue;
    }
    if (r.startsWith(">")) {
      const q: string[] = [];
      while (i < rows.length && rows[i].startsWith(">")) q.push(rows[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={key}>{lines(q, key)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < rows.length && rows[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s|>|\s*\|)/.test(rows[i])) para.push(rows[i++]);
    if (!para.length) para.push(rows[i++]);
    out.push(<p key={key}>{lines(para, key)}</p>);
  }
  return <>{out}</>;
}
