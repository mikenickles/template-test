import type { ReactNode } from "react";

/**
 * The small slice of Markdown Lyra uses in chat: paragraphs, bullet and
 * numbered lists, quotes, **bold**, *italic*, `code` and links.
 * Builds React elements directly, so message text is never treated as HTML.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\*[^*\s][^*]*\*)/g;

function inline(text: string, key: string): ReactNode[] {
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

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: ReactNode[] = [];
  blocks.forEach((block, b) => {
    const rows = block.split("\n").filter((r) => r.trim() !== "");
    if (!rows.length) return;
    const key = `b${b}`;
    if (rows.every((r) => /^\s*[-*•]\s+/.test(r))) {
      out.push(
        <ul key={key}>
          {rows.map((r, i) => (
            <li key={i}>{inline(r.replace(/^\s*[-*•]\s+/, ""), `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
    } else if (rows.every((r) => /^\s*\d+[.)]\s+/.test(r))) {
      const start = Number(rows[0].match(/\d+/)![0]);
      out.push(
        <ol key={key} start={start} style={{ counterReset: `n ${start - 1}` }}>
          {rows.map((r, i) => (
            <li key={i}>{inline(r.replace(/^\s*\d+[.)]\s+/, ""), `${key}-${i}`)}</li>
          ))}
        </ol>,
      );
    } else if (rows.every((r) => r.startsWith(">"))) {
      out.push(<blockquote key={key}>{lines(rows.map((r) => r.replace(/^>\s?/, "")), key)}</blockquote>);
    } else {
      out.push(<p key={key}>{lines(rows.map((r) => r.replace(/^#+\s+/, "")), key)}</p>);
    }
  });
  return <>{out}</>;
}

/**
 * The first line gets headline styling only when the reply has a point plus
 * supporting detail: more than one part, and a short first sentence.
 * Quick answers stay plain, like a normal text.
 */
export function headline(text: string): boolean {
  const blocks = text.trim().split(/\n{2,}/).filter((b) => b.trim());
  if (blocks.length < 2) return false;
  const first = blocks[0].trim();
  return first.length <= 120 && !first.includes("\n") && !/^([-*•>]|\d+[.)])\s/.test(first);
}
