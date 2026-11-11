/**
 * Everything that comes from outside the chat (email, web, files) is wrapped
 * before the model sees it, so the model can tell data from instructions.
 * The system prompt explains the envelope; this file makes it unforgeable.
 */

const TAG = "untrusted_data";

/** Stop content from closing the envelope early or opening a fake one. */
export function neutralize(text: string): string {
  return text.replace(/<\s*(\/?)\s*untrusted[\s_-]*data/gi, "<$1untrusted-data-text");
}

export function wrapUntrusted(source: string, content: string): string {
  const src = source.replace(/[^a-z0-9_.-]/gi, "");
  return `<${TAG} source="${src}">\n${neutralize(content)}\n</${TAG}>`;
}
