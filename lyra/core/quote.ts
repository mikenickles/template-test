// Replying to one message (0.49.1): the user picks an earlier message and answers it. The quote
// travels inside their message as a first line starting with "> ", so the model reads it like
// any quoted text and nothing else about storing, syncing or sending changes.

/** A short, single-line excerpt of the message being answered. */
export function excerptOf(content: string, max = 140): string {
  const flat = content.replace(/[*_`#>|]/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** The message as sent: the quote on its own first line, then what the user wrote. */
export function withQuote(excerpt: string, text: string): string {
  const q = excerptOf(excerpt);
  return q ? `> ${q}\n\n${text.trim()}` : text.trim();
}

/** Splits a stored message into the quote it answers (if any) and the user's own words. */
export function splitQuote(content: string): { quote: string | null; text: string } {
  const m = content.match(/^> ([^\n]+)\n\n([\s\S]*)$/);
  return m ? { quote: m[1], text: m[2] } : { quote: null, text: content };
}
