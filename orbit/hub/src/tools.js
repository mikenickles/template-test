import dns from 'node:dns/promises';
import { FOLDER_ACTIVITY, FOLDER_TOOLS, runFolderTool } from './folders.js';
import { MEMORY_ACTIVITY, MEMORY_TOOLS } from './memory.js';
import { CREW_TOOL } from './intro.js';
import { AGENT_TOOL } from './recruit.js';
import { GOOGLE_ACTIVITY, GOOGLE_TOOLS, googleDetail, htmlToText } from './google.js';
import { PROACTIVE_ACTIVITY, PROACTIVE_TOOLS } from './proactive.js';
import { SELF_ACTIVITY, SELF_TOOLS, selfDetail } from './self.js';
import { checkUrl, isPublicAddress } from './addresses.js';
import { BROWSER_ACTIVITY, BROWSER_TOOLS, browserDetail } from './browser.js';
import { MAIN_ACTIVITY, MAIN_TOOLS, mainDetail } from './mainchat.js';

export { isPublicAddress };

/**
 * The tools the hub runs itself, whatever the model: shared folders, memory, hiring, Google, follow-ups and
 * watches, the Treehouse guide and changing settings, and the main agent's reading and posting across rooms. Claude gets web search and code from Anthropic's side;
 * other models get web search and page reading from the hub (HUB_WEB_TOOLS).
 */

export const HUB_WEB_TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for anything recent or that you are unsure of. Returns the key facts with their sources.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'What to search for.' } }, required: ['query'] },
  },
  {
    name: 'web_fetch',
    description: 'Read a web page by its address (http or https), as text.',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
];
const HUB_WEB_ACTIVITY = { web_search: 'search', web_fetch: 'page' };

/** Hub-run tools, and what each looks like in the chat. */
export const CLIENT_ACTIVITY = { ...FOLDER_ACTIVITY, ...MEMORY_ACTIVITY, ...GOOGLE_ACTIVITY, ...PROACTIVE_ACTIVITY, ...SELF_ACTIVITY, ...HUB_WEB_ACTIVITY, ...BROWSER_ACTIVITY, ...MAIN_ACTIVITY };

/** The words shown beside a hub-run tool in the chat. */
export function clientDetail(name, input = {}) {
  if (name === 'search_files') return input.query;
  if (MEMORY_ACTIVITY[name]) return input.note;
  if (GOOGLE_ACTIVITY[name]) return googleDetail(name, input);
  if (name === 'follow_up') {
    const at = Number.isInteger(input.in_minutes) ? Date.now() + input.in_minutes * 60_000 : new Date(input.at ?? '').getTime();
    return Number.isNaN(at) ? '' : new Date(at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (name === 'watch') return input.what;
  if (name === 'stop_watching' || name === 'cancel_follow_up') return '';
  if (SELF_ACTIVITY[name]) return selfDetail(name, input);
  if (BROWSER_ACTIVITY[name]) return browserDetail(name, input);
  if (MAIN_ACTIVITY[name]) return mainDetail(name, input);
  if (name === 'web_search') return input.query;
  if (name === 'web_fetch') return input.url;
  return input.path;
}

/** The hub-run tools an agent's abilities turn on (not Anthropic's own web and code tools). */
export function clientTools(abilities = {}) {
  const tools = [];
  if (abilities.hubWeb) tools.push(...HUB_WEB_TOOLS.filter((t) => t.name !== 'web_search' || abilities.hubWeb.canSearch));
  if (abilities.folders?.list().length) tools.push(...FOLDER_TOOLS);
  if (abilities.memory) tools.push(...MEMORY_TOOLS);
  if (abilities.crew) tools.push(CREW_TOOL);
  if (abilities.recruit) tools.push(AGENT_TOOL);
  if (abilities.google) tools.push(...GOOGLE_TOOLS);
  if (abilities.browser) tools.push(...BROWSER_TOOLS);
  if (abilities.proactive) tools.push(...PROACTIVE_TOOLS);
  if (abilities.self) tools.push(...SELF_TOOLS);
  if (abilities.overseer) tools.push(...MAIN_TOOLS);
  return tools;
}

/** Runs a hub-run tool. Resolves with { text, isError } and, for a web search, the pages it found. */
export async function runClientTool(abilities, name, input = {}) {
  if (abilities.hubWeb && name === 'web_search' && abilities.hubWeb.canSearch) {
    const query = String(input.query ?? '').trim();
    if (!query) return { text: 'Say what to search for.', isError: true };
    try {
      return { ...(await abilities.hubWeb.search(query)), isError: false };
    } catch (err) {
      return { text: `The search didn't work: ${err?.message ?? err}`, isError: true };
    }
  }
  if (abilities.hubWeb && name === 'web_fetch') return fetchPage(input.url);
  if (abilities.folders && FOLDER_ACTIVITY[name]) return runFolderTool(abilities.folders, name, input);
  if (abilities.memory && MEMORY_ACTIVITY[name]) return abilities.memory.run(name, input);
  if (abilities.crew && name === CREW_TOOL.name) return abilities.crew.run(input);
  if (abilities.recruit && name === AGENT_TOOL.name) return abilities.recruit.run(input);
  if (abilities.google && GOOGLE_ACTIVITY[name]) return abilities.google.run(name, input);
  if (abilities.browser && BROWSER_ACTIVITY[name]) return abilities.browser.run(name, input);
  if (abilities.proactive && PROACTIVE_ACTIVITY[name]) return abilities.proactive.run(name, input);
  if (abilities.self && SELF_ACTIVITY[name]) return abilities.self.run(name, input);
  if (abilities.overseer && MAIN_ACTIVITY[name]) return abilities.overseer.run(name, input);
  return { text: `There is no tool called "${name}".`, isError: true };
}

// ---------- Reading a web page from the hub ----------

const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_PAGE_TEXT = 40_000;

/** Reads a public web page as text. Errors come back as text for the agent, never as a crash. */
export async function fetchPage(raw, { fetch: doFetch = globalThis.fetch, lookup = dns.lookup } = {}) {
  try {
    let url = await checkUrl(raw, lookup);
    let res;
    for (let hop = 0; ; hop++) {
      res = await doFetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; Treehouse)', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' } });
      if (res.status < 300 || res.status >= 400) break;
      const next = res.headers.get('location');
      if (!next || hop >= 5) throw new Error('That page redirects too many times.');
      url = await checkUrl(new URL(next, url).href, lookup);
    }
    if (!res.ok) throw new Error(`The site answered ${res.status}.`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/|json|xml/.test(type)) throw new Error(`That's a ${type.split(';')[0] || 'file'}, not a page that can be read as text.`);
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_PAGE_BYTES) break;
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.trim();
    // The head holds the title (shown once, above) and nothing worth reading.
    const text = /html/.test(type) ? htmlToText(body.replace(/<head[\s\S]*?<\/head>|<title[\s\S]*?<\/title>/gi, '')) : body;
    const cut = text.length > MAX_PAGE_TEXT ? `${text.slice(0, MAX_PAGE_TEXT)}\n[…the rest of the page is cut off]` : text;
    return { text: `${title ? `${htmlToText(title)}\n` : ''}${url.href}\n\n${cut}`, isError: false };
  } catch (err) {
    const why = err?.name === 'TimeoutError' ? 'The page took too long to load.' : err?.message ?? String(err);
    return { text: `Couldn't read that page: ${why}`, isError: true };
  }
}
