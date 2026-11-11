import { FakeProvider } from "./fake.ts";
import type { ModelProvider } from "./types.ts";

export type ProviderId = "anthropic" | "openai" | "gemini" | "fake";
export const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "fake"];

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-haiku-5-5",
  openai: "gpt-6-astra",
  gemini: "gemini-3.8-flash",
  fake: "fake",
};

export interface ProviderChoice {
  provider: ProviderId;
  model: string;
}

export interface Keys {
  anthropic?: string;
  openai?: string;
  gemini?: string;
  /** Any OpenAI-compatible server, e.g. a local model on your network. */
  openaiBaseUrl?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  ready: boolean;
  defaultModel: string;
  hint?: string;
}

export function listProviders(keys: Keys): ProviderInfo[] {
  return [
    { id: "anthropic", label: "Claude", ready: !!keys.anthropic, defaultModel: DEFAULT_MODELS.anthropic, hint: "Add a Claude API key below" },
    {
      id: "openai",
      label: "OpenAI",
      ready: !!keys.openai || !!keys.openaiBaseUrl,
      defaultModel: DEFAULT_MODELS.openai,
      hint: "Add an OpenAI API key below",
    },
    { id: "gemini", label: "Gemini", ready: !!keys.gemini, defaultModel: DEFAULT_MODELS.gemini, hint: "Add a Gemini API key below" },
    { id: "fake", label: "Practice", ready: true, defaultModel: "fake" },
  ];
}

/** Each provider's SDK is loaded only when it's first used, so the app starts fast. */
export async function createProvider(keys: Keys, choice: ProviderChoice): Promise<ModelProvider> {
  switch (choice.provider) {
    case "anthropic": {
      if (!keys.anthropic) throw new Error("Add a Claude API key in Settings first.");
      const { AnthropicProvider } = await import("./anthropic.ts");
      return new AnthropicProvider(keys.anthropic, choice.model);
    }
    case "openai": {
      if (!keys.openai && !keys.openaiBaseUrl) throw new Error("Add an OpenAI API key in Settings first.");
      const { OpenAIProvider } = await import("./openai.ts");
      return new OpenAIProvider(keys.openai ?? "local", choice.model, keys.openaiBaseUrl);
    }
    case "gemini": {
      if (!keys.gemini) throw new Error("Add a Gemini API key in Settings first.");
      const { GeminiProvider } = await import("./gemini.ts");
      return new GeminiProvider(keys.gemini, choice.model);
    }
    case "fake":
      return new FakeProvider();
  }
}
