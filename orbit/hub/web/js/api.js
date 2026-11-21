// Talks to the hub this page came from. The desktop app signs in with a cookie the hub sets.

export class HubError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, headers = {}) {
  const isBlob = body instanceof Blob;
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined || isBlob ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
    });
  } catch {
    throw new HubError("Can't reach the hub. Check it's still running on the PC.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HubError(data.error || `The hub answered with an error (${res.status}).`, res.status);
  return data;
}

const local = { 'x-orbit-local': '1' };

export const api = {
  state: () => request('GET', '/api/state'),
  /** On the PC itself, sign in without a code. */
  connectHere: () => request('POST', '/local/token', {}, local),
  pair: (code) => request('POST', '/api/pair', { code, deviceName: deviceName(), web: true }),
  disconnect: () => request('DELETE', '/api/device'),

  messages: (roomId) => request('GET', `/api/rooms/${roomId}/messages`),
  send: (roomId, text, attachments = [], replyTo = null) =>
    request('POST', `/api/rooms/${roomId}/messages`, { text, attachments, ...(replyTo ? { replyTo } : {}) }),
  stop: (roomId) => request('POST', `/api/rooms/${roomId}/stop`, {}),
  clear: (roomId) => request('DELETE', `/api/rooms/${roomId}/messages`),
  deleteMessage: (roomId, id) => request('DELETE', `/api/rooms/${roomId}/messages/${id}`),
  retry: (roomId, id) => request('POST', `/api/rooms/${roomId}/messages/${id}/retry`, {}),
  upload: (blob, name) => request('POST', '/api/files', blob, { 'content-type': blob.type, 'x-file-name': encodeURIComponent(name) }),

  saveAgent: (agent) => (agent.id ? request('PUT', `/api/agents/${agent.id}`, agent) : request('POST', '/api/agents', agent)),
  deleteAgent: (id) => request('DELETE', `/api/agents/${id}`),
  addMemory: (agentId, text) => request('POST', `/api/agents/${agentId}/memory`, { text }),
  removeMemory: (agentId, noteId) => request('DELETE', `/api/agents/${agentId}/memory/${noteId}`),
  saveRoom: (room) => (room.id ? request('PUT', `/api/rooms/${room.id}`, room) : request('POST', '/api/rooms', room)),
  deleteRoom: (id) => request('DELETE', `/api/rooms/${id}`),
  /** "Describe it": the hub sets up a room from the user's own words, and returns it. */
  planRoom: (text) => request('POST', '/api/rooms/plan', { text }),
  models: (providerId) => request('GET', `/api/providers/${providerId}/models`),
  setKey: (providerId, apiKey) => request('PUT', `/api/providers/${providerId}/key`, { apiKey }),
  removeKey: (providerId) => request('DELETE', `/api/providers/${providerId}/key`),
  hubInfo: () => request('GET', '/api/hub'),
  applyUpdate: () => request('POST', '/api/updates/apply', {}),
  checkForUpdates: () => request('POST', '/api/updates/check', {}),
  openUpdates: () => request('POST', '/api/updates/open', {}, local),
  startIntro: () => request('POST', '/api/intro', {}),
  setProfileName: (name) => request('PUT', '/api/profile', { name }),
  addProfileNote: (text) => request('POST', '/api/profile/notes', { text }),
  removeProfileNote: (id) => request('DELETE', `/api/profile/notes/${id}`),
  pullModel: (providerId, model) => request('POST', `/api/providers/${providerId}/pull`, { model }),
  clearDownload: (providerId) => request('DELETE', `/api/providers/${providerId}/pull`),
  usage: (days) => request('GET', `/api/usage?days=${days}`),
  saveSchedule: (s) => (s.id ? request('PUT', `/api/schedules/${s.id}`, s) : request('POST', '/api/schedules', s)),
  deleteSchedule: (id) => request('DELETE', `/api/schedules/${id}`),
  runSchedule: (id) => request('POST', `/api/schedules/${id}/run`, {}),
  stopSharing: (id) => request('DELETE', `/api/folders/${id}`),
  // Agents that speak first: quiet hours, the daily limit and the morning brief; follow-ups, watches and Home's cards.
  saveProactive: (settings) => request('PUT', '/api/proactive', settings),
  deleteFollowUp: (id) => request('DELETE', `/api/followups/${id}`),
  deleteWatch: (id) => request('DELETE', `/api/watches/${id}`),
  dismissNudge: (id) => request('DELETE', `/api/nudges/${id}`),
  disconnectGoogle: () => request('DELETE', '/api/google'),
  // Connecting Google happens only on the PC: the client and the sign-in stay on this machine.
  setGoogleClient: (clientId, clientSecret) => request('PUT', '/local/google/client', { clientId, clientSecret }, local),
  connectGoogle: () => request('POST', '/local/google/connect', {}, local),
  // Sharing a folder is for the PC itself only.
  pairInfo: () => request('GET', '/pair.json'),
  shareFolder: (path) => request('POST', '/local/folders', { path }, local),
  pickFolder: () => request('POST', '/local/folders/pick', {}, local),
};

/** Whether this page is open on the PC running the hub. */
export const onThisPC = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const system = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${system ? ` on ${system}` : ''}`;
}

/**
 * Live updates for one room. Calls handlers[event] with each event's data, and handlers.open on every
 * (re)connect so the caller can reload what it missed. Returns a function that stops listening.
 */
export function roomEvents(roomId, handlers) {
  const source = new EventSource(`/api/rooms/${roomId}/events`);
  source.onopen = () => handlers.open?.();
  for (const name of ['message', 'delta', 'activity', 'reset', 'run', 'cleared', 'removed']) {
    source.addEventListener(name, (e) => handlers[name]?.(JSON.parse(e.data)));
  }
  return () => source.close();
}

/** Every room at once: fires whenever a run starts or ends, or a reply lands. */
export function hubEvents(onChange) {
  const source = new EventSource('/api/events');
  for (const name of ['runs', 'run', 'reply']) source.addEventListener(name, () => onChange());
  return () => source.close();
}

/** Readies a file for upload: photos shrink to the size Claude reads and become JPEG; others go as they are. */
export async function prepare(file) {
  const MAX = 2576;
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return { blob: file, name: file.name };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  return { blob, name: `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg` };
}

export const ATTACHABLE = 'image/*,application/pdf,text/*,.md,.csv,.json';
export const canAttach = (file) =>
  file.type.startsWith('image/') || file.type === 'application/pdf' || file.type.startsWith('text/') || /\.(md|csv|json|txt|log)$/i.test(file.name);
