import type { HostErrorCode } from "@memex/shared";

export type ProviderName = "claude" | "openai" | "ollama";

export interface ProviderStreamCallbacks {
  onChunk(text: string): void;
  onDone(totalMs: number): void;
  onError(code: HostErrorCode, message: string, details?: unknown): void;
}

export interface AiProvider {
  readonly name: ProviderName;
  /** Streaming completion for an arbitrary prompt. Implementations should
   *  respect signal.aborted when cancellation arrives. */
  stream(prompt: string, signal: AbortSignal, cb: ProviderStreamCallbacks): void;
}
