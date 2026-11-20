/**
 * Token use and its estimated cost, per agent and room, kept by day on the hub so it outlives cleared
 * rooms and deleted messages.
 *
 * Prices are US dollars per million tokens, from Anthropic's published rates. Cache writes cost 1.25x
 * input (five-minute cache). Other providers' models have no built-in price; add one in config.json
 * under "prices", e.g. "prices": { "gpt-large": { "input": 1.25, "output": 10 } }.
 */
export const PRICES = {
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.2 },
  'claude-mythos-5-2': { input: 8, output: 40, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-mythos-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  // Haiku 5.5 costs more once a prompt passes 100K tokens.
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, above: { tokens: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 } },
};

const CACHE_WRITE = 1.25;
const KEEP_DAYS = 400;

/** One request's tokens, as every provider reports them here. */
export function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, requests: 0, estimated: false };
}

export function addUsage(into, usage) {
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'searches', 'requests']) into[key] += usage[key] ?? 0;
  into.estimated ||= Boolean(usage.estimated);
  return into;
}

/** A model's price, matching dated ids ("claude-opus-5-5-20261001") to their family. */
export function priceOf(model, overrides = {}) {
  if (overrides[model]) return overrides[model];
  if (PRICES[model]) return PRICES[model];
  const dated = /^(.+)-\d{8}$/.exec(model ?? '');
  return (dated && PRICES[dated[1]]) || null;
}

/** Dollars for one request's usage, or null when the model has no known price. */
export function costOf(model, usage, overrides = {}) {
  const price = priceOf(model, overrides);
  if (!price) return null;
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
  const rate = price.above && prompt > price.above.tokens ? { ...price, ...price.above } : price;
  const cacheRead = rate.cacheRead ?? rate.input;
  return (usage.input * rate.input + usage.cacheWrite * rate.input * CACHE_WRITE + usage.cacheRead * cacheRead + usage.output * rate.output) / 1e6;
}

const day = (time) => new Date(time).toISOString().slice(0, 10);

export class Ledger {
  /**
   * @param {import('./store.js').Store} store  Usage lives in store.state.usage: day -> "agent|room|model" -> totals.
   * @param {Record<string, object>} prices  Extra or replacement prices from config.json.
   */
  constructor(store, prices = {}) {
    this.store = store;
    this.prices = prices;
    store.state.usage ??= {};
  }

  /** Adds one request's usage. Returns its estimated cost, or null if the model has no price. */
  record({ agentId, roomId, model, usage, at = Date.now() }) {
    const cost = costOf(model, usage, this.prices);
    const days = this.store.state.usage;
    const today = (days[day(at)] ??= {});
    const key = `${agentId}|${roomId}|${model}`;
    const entry = (today[key] ??= { ...emptyUsage(), cost: 0, priced: true });
    addUsage(entry, usage);
    if (cost === null) entry.priced = false;
    else entry.cost += cost;
    // Old days fall away so the file stays small.
    const cutoff = day(at - KEEP_DAYS * 86_400_000);
    for (const d of Object.keys(days)) if (d < cutoff) delete days[d];
    this.store.save();
    return cost;
  }

  /** Totals for the last `days` days, overall and per agent and room, biggest spend first. */
  summary(days = 30, now = Date.now()) {
    const since = day(now - (days - 1) * 86_400_000);
    const total = { ...emptyUsage(), cost: 0, priced: true };
    const agents = new Map();
    const rooms = new Map();
    const bucket = (map, id, extra) => {
      if (!map.has(id)) map.set(id, { ...extra, ...emptyUsage(), cost: 0, priced: true });
      return map.get(id);
    };
    for (const [d, entries] of Object.entries(this.store.state.usage)) {
      if (d < since) continue;
      for (const [key, entry] of Object.entries(entries)) {
        const [agentId, roomId] = key.split('|');
        for (const target of [total, bucket(agents, agentId, { agentId }), bucket(rooms, roomId, { roomId })]) {
          addUsage(target, entry);
          target.cost += entry.cost;
          target.priced &&= entry.priced;
        }
      }
    }
    const named = (list, name) => list.map((row) => ({ ...row, name: name(row) }));
    const order = (a, b) => b.cost - a.cost || b.input + b.output - (a.input + a.output);
    return {
      days,
      since,
      total,
      agents: named([...agents.values()], (r) => this.store.agent(r.agentId)?.name ?? 'Deleted agent').sort(order),
      rooms: named([...rooms.values()], (r) => this.store.room(r.roomId)?.name ?? 'Deleted room').sort(order),
    };
  }
}
