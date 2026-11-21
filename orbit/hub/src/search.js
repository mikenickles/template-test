/**
 * Search across every room: rooms whose name or description has all the words, and messages that do,
 * newest first, each with a short snippet around the first word found.
 */

const MAX_WORDS = 8;
const MAX_MESSAGES = 40;

const flat = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
/** Plain words for a snippet: bold and code marks and heading or quote markers dropped. */
const plain = (text) => flat(String(text ?? '').replace(/\*\*|__|`/g, '').replace(/^\s*(?:#{1,6}|>)\s+/gm, ''));

/** About 160 characters around the first match, cut at word edges where it can be. */
export function snippet(text, word) {
  const line = plain(text);
  const at = line.toLowerCase().indexOf(word);
  if (line.length <= 160 || at < 0) return line.length <= 160 ? line : `${line.slice(0, 157).replace(/\s\S*$/, '')}…`;
  let start = Math.max(0, at - 50);
  if (start > 0) start = line.indexOf(' ', start) + 1 || start;
  let end = Math.min(line.length, start + 160);
  if (end < line.length) end = line.lastIndexOf(' ', end) > at ? line.lastIndexOf(' ', end) : end;
  return `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`;
}

export function search(state, query, { roomId = null } = {}) {
  const words = flat(query).toLowerCase().split(' ').filter(Boolean).slice(0, MAX_WORDS);
  if (!words.length) return { query: '', rooms: [], messages: [] };
  const has = (text) => {
    const low = String(text ?? '').toLowerCase();
    return words.every((w) => low.includes(w));
  };
  const agents = new Map(state.agents.map((a) => [a.id, a]));
  // Searching one room finds only its messages.
  const inScope = roomId ? state.rooms.filter((r) => r.id === roomId) : state.rooms;
  const rooms = roomId ? [] : inScope.filter((r) => has(`${r.name} ${r.description ?? ''}`)).map((r) => ({ id: r.id, name: r.name, agentIds: r.agentIds }));
  const messages = [];
  for (const room of inScope) {
    for (const m of state.messages[room.id] ?? []) {
      if (!m.text || !has(m.text)) continue;
      const user = m.author?.type === 'user';
      messages.push({
        roomId: room.id,
        roomName: room.name,
        messageId: m.id,
        agentId: user ? null : m.author?.agentId ?? null,
        author: user ? 'You' : agents.get(m.author?.agentId)?.name ?? m.author?.name ?? 'An agent',
        snippet: snippet(m.text, words[0]),
        at: m.createdAt ?? 0,
      });
    }
  }
  messages.sort((a, b) => b.at - a.at);
  return { query: words.join(' '), rooms, messages: messages.slice(0, MAX_MESSAGES) };
}
