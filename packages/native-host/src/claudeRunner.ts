import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HostErrorCode, InvokePayload } from "@memex/shared";
import { getActiveProvider } from "./providers/index.js";

const execFileP = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface RunHandle {
  cancel(): void;
}

export interface RunCallbacks {
  onChunk(text: string): void;
  onDone(exitCode: number, totalMs: number): void;
  onError(code: HostErrorCode, message: string, details?: unknown): void;
}

/**
 * Run an AI completion through the currently-configured provider (claude by
 * default, openai or ollama if the user switched in Options).
 */
export function runClaude(payload: InvokePayload, cb: RunCallbacks): RunHandle {
  const provider = getActiveProvider();
  const controller = new AbortController();
  const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let settled = false;
  const settle = () => {
    if (settled) return true;
    settled = true;
    clearTimeout(timer);
    return false;
  };

  const fullPrompt = payload.context ? `${payload.context}\n\n${payload.prompt}` : payload.prompt;

  provider.stream(fullPrompt, controller.signal, {
    onChunk: (text) => {
      if (settled) return;
      cb.onChunk(text);
    },
    onDone: (totalMs) => {
      if (settle()) return;
      cb.onDone(0, totalMs);
    },
    onError: (code, message, details) => {
      if (settle()) return;
      // A timeout fires by aborting the controller, which the provider then
      // surfaces as CANCELLED — rewrite back to TIMEOUT for the UI.
      const finalCode: HostErrorCode = code === "CANCELLED" && timedOut ? "TIMEOUT" : code;
      cb.onError(finalCode, message, details);
    },
  });

  return {
    cancel() {
      controller.abort();
    },
  };
}

export async function detectClaude(): Promise<{ path: string | null; version: string | null }> {
  try {
    const { stdout: which } = await execFileP("/bin/sh", ["-c", "command -v claude"]);
    const path = which.trim() || null;
    if (!path) return { path: null, version: null };
    const { stdout: ver } = await execFileP(path, ["--version"], { timeout: 5000 });
    return { path, version: ver.trim().split("\n")[0] ?? null };
  } catch {
    return { path: null, version: null };
  }
}
