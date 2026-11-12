/**
 * The models an API key can use, straight from each provider, so nobody has to
 * look up and type a model name. Only chat models are kept, newest first.
 */
import type { Keys, ProviderId } from "./index.ts";

export interface ModelOption {
  id: string;
  /** a friendlier name when the provider gives one */
  label: string;
}

const NOT_CHAT = /embed|tts|whisper|audio|realtime|image|dall-e|moderation|transcribe|speech|sora|veo|imagen|aqa|search|instruct|computer-use|robotics|native-audio|live/i;

async function getJson(fetchFn: typeof fetch, url: string, headers: Record<string, string>): Promise<unknown> {
  const r = await fetchFn(url, { headers });
  if (r.status === 401 || r.status === 403) throw new Error("That API key was refused. Check it and save it again.");
  if (!r.ok) throw new Error(`Couldn't load the model list (${r.status}).`);
  return r.json();
}

export async function listModels(keys: Keys, provider: ProviderId, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<ModelOption[]> {
  if (provider === "anthropic") {
    if (!keys.anthropic) return [];
    const j = (await getJson(fetchFn, "https://api.anthropic.com/v1/models?limit=100", {
      "x-api-key": keys.anthropic,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    })) as { data: { id: string; display_name?: string; created_at?: string }[] };
    return j.data
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((m) => ({ id: m.id, label: m.display_name || m.id }));
  }
  if (provider === "openai") {
    const own = keys.openaiBaseUrl;
    if (!keys.openai && !own) return [];
    const base = (own || "https://api.openai.com/v1").replace(/\/+$/, "");
    const j = (await getJson(fetchFn, `${base}/models`, keys.openai ? { Authorization: `Bearer ${keys.openai}` } : {})) as {
      data: { id: string; created?: number }[];
    };
    return j.data
      // your own server: everything it offers; OpenAI itself: the chat models
      .filter((m) => own || (/^(gpt-|o\d|chatgpt-)/.test(m.id) && !NOT_CHAT.test(m.id)))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, label: m.id }));
  }
  if (provider === "gemini") {
    if (!keys.gemini) return [];
    const j = (await getJson(fetchFn, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { "x-goog-api-key": keys.gemini })) as {
      models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return j.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/.test(m.name) && !NOT_CHAT.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName || m.name.replace(/^models\//, "") }))
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  }
  return [];
}
