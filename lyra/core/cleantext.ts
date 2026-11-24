/**
 * (0.66.3) Model text, cleaned of machine marks before anyone sees it.
 * OpenAI's built-in web search writes citation markers into the text itself, in private-use
 * characters: "citeturn700572forecast0turn483885search3". The sources
 * already come separately (url_citation annotations), so the markers are dropped. Leftover
 * private-use characters and bare "turn123search0" ids go too.
 */
const MARKED = /[ \t]*[^]*/g;
const PRIVATE = /[-]/g;
const BARE_IDS = /[ \t]*\b(?:cite|filecite|navlist|entity)?(?:turn\d+(?:search|forecast|news|view|fetch|open|find|image|product|finance|sports|time|calc|click)\d+)+\b/gi;

export function cleanModelText(text: string): string {
  if (!text) return text;
  const out = text
    .replace(MARKED, "")
    .replace(PRIVATE, "")
    .replace(BARE_IDS, "")
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
  return out === text ? text : out.replace(/\n{3,}/g, "\n\n");
}

/** The same for streamed pieces: a marker split across pieces is held back until it closes. */
export function streamCleaner(): { push(piece: string): string; flush(): string } {
  let held = "";
  return {
    push(piece) {
      const s = held + piece;
      const open = s.lastIndexOf("");
      if (open >= 0 && s.indexOf("", open) < 0) {
        held = s.slice(open);
        return clean(s.slice(0, open));
      }
      held = "";
      return clean(s);
    },
    flush() {
      const s = held;
      held = "";
      return clean(s.replace(/[^]*$/, ""));
    },
  };
}

// streamed pieces lose only the marks (spacing is fixed in the final text)
const clean = (s: string) => s.replace(MARKED, "").replace(PRIVATE, "");
