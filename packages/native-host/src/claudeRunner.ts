import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HostErrorCode, InvokePayload } from "@notepad-ai/shared";
import { log } from "./logger.js";

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
 * Spawn `claude --print` with the prompt piped over stdin and stream
 * stdout back chunk-by-chunk. We use plain text mode (not --output-format
 * stream-json) because it works across CLI versions and the user wants
 * raw token streaming in the editor.
 */
export function runClaude(payload: InvokePayload, cb: RunCallbacks): RunHandle {
  const start = Date.now();
  const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn("claude", ["--print", ...(payload.cliArgs ?? [])], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
  } catch (err) {
    cb.onError("INTERNAL", `Failed to spawn claude: ${(err as Error).message}`);
    return { cancel() {} };
  }

  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn();
  };

  const timer = setTimeout(() => {
    settle(() => {
      child.kill("SIGTERM");
      cb.onError("TIMEOUT", `claude timed out after ${timeoutMs}ms`);
    });
  }, timeoutMs);

  child.on("error", (err) => {
    settle(() => {
      const msg = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? "claude CLI not found on PATH"
        : err.message;
      const code: HostErrorCode = msg.includes("not found") ? "CLI_NOT_FOUND" : "INTERNAL";
      cb.onError(code, msg);
    });
  });

  let stderrBuf = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d: string) => {
    stderrBuf += d;
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d: string) => cb.onChunk(d));

  child.on("close", (code) => {
    settle(() => {
      const totalMs = Date.now() - start;
      if (code === 0) {
        cb.onDone(0, totalMs);
      } else {
        const looksLikeAuth = /auth|login|api[_-]?key/i.test(stderrBuf);
        const errCode: HostErrorCode = looksLikeAuth ? "CLI_AUTH" : "INTERNAL";
        cb.onError(errCode, `claude exited with code ${code ?? "?"}`, {
          stderrTail: stderrBuf,
        });
      }
    });
  });

  try {
    const full = payload.context
      ? `${payload.context}\n\n${payload.prompt}`
      : payload.prompt;
    child.stdin.end(full, "utf8");
  } catch (err) {
    log("error", "stdin write failed", { err: (err as Error).message });
  }

  return {
    cancel() {
      settle(() => {
        child.kill("SIGTERM");
        cb.onError("CANCELLED", "Cancelled by client");
      });
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
