import type { AiMode } from "@memex/shared";

/**
 * Provider abstraction so we can swap Claude CLI for OpenAI, Ollama, etc.
 * in Phase 3 without touching call sites in the UI.
 */
export interface AiProvider {
  readonly name: string;
  stream(args: {
    mode: AiMode;
    prompt: string;
    onChunk: (text: string) => void;
    onDone: () => void;
    onError: (code: string, message: string) => void;
  }): { cancel: () => void };
}
