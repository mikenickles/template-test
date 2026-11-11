import type { Config, ProviderId } from "../config.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { FakeProvider } from "./fake.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAIProvider } from "./openai.ts";
import type { ModelProvider } from "./types.ts";

export interface ProviderChoice {
  provider: ProviderId;
  model: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  ready: boolean;
  defaultModel: string;
  hint?: string;
}

export function listProviders(cfg: Config): ProviderInfo[] {
  return [
    {
      id: "anthropic",
      label: "Claude",
      ready: !!cfg.keys.anthropic,
      defaultModel: cfg.models.anthropic,
      hint: "Add ANTHROPIC_API_KEY to .env",
    },
    {
      id: "openai",
      label: "OpenAI",
      ready: !!cfg.keys.openai || !!cfg.openaiBaseUrl,
      defaultModel: cfg.models.openai,
      hint: "Add OPENAI_API_KEY (or OPENAI_BASE_URL for a local model) to .env",
    },
    {
      id: "gemini",
      label: "Gemini",
      ready: !!cfg.keys.gemini,
      defaultModel: cfg.models.gemini,
      hint: "Add GEMINI_API_KEY to .env",
    },
    { id: "fake", label: "Practice (no key)", ready: true, defaultModel: "fake" },
  ];
}

export function createProvider(cfg: Config, choice: ProviderChoice): ModelProvider {
  switch (choice.provider) {
    case "anthropic":
      if (!cfg.keys.anthropic) throw new Error("No Claude API key. Add ANTHROPIC_API_KEY to .env.");
      return new AnthropicProvider(cfg.keys.anthropic, choice.model);
    case "openai":
      if (!cfg.keys.openai && !cfg.openaiBaseUrl) throw new Error("No OpenAI API key. Add OPENAI_API_KEY to .env.");
      return new OpenAIProvider(cfg.keys.openai ?? "local", choice.model, cfg.openaiBaseUrl);
    case "gemini":
      if (!cfg.keys.gemini) throw new Error("No Gemini API key. Add GEMINI_API_KEY to .env.");
      return new GeminiProvider(cfg.keys.gemini, choice.model);
    case "fake":
      return new FakeProvider();
  }
}
