import { claudeProvider } from "./claude.js";
import { openaiProvider } from "./openai.js";
import { ollamaProvider } from "./ollama.js";
import { getSetting } from "../db.js";
import type { AiProvider, ProviderName } from "./types.js";

const REGISTRY: Record<ProviderName, AiProvider> = {
  claude: claudeProvider,
  openai: openaiProvider,
  ollama: ollamaProvider,
};

export function getActiveProvider(): AiProvider {
  const raw = (getSetting("ai.provider") || "claude") as ProviderName;
  return REGISTRY[raw] ?? claudeProvider;
}

export function getProviderByName(name: ProviderName): AiProvider {
  return REGISTRY[name] ?? claudeProvider;
}

export { type AiProvider, type ProviderName } from "./types.js";
