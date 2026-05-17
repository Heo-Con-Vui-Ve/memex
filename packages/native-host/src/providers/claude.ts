import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { AiProvider } from "./types.js";

export const claudeProvider: AiProvider = {
  name: "claude",
  stream(prompt, signal, cb) {
    const start = Date.now();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn("claude", ["--print"], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    } catch (err) {
      cb.onError("INTERNAL", `Failed to spawn claude: ${(err as Error).message}`);
      return;
    }

    let stderr = "";
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGTERM"); } catch {}
      cb.onError("CANCELLED", "Cancelled by client");
    };
    signal.addEventListener("abort", onAbort);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      const msg = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? "claude CLI not found on PATH"
        : err.message;
      cb.onError(msg.includes("not found") ? "CLI_NOT_FOUND" : "INTERNAL", msg);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      stderr += d;
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => cb.onChunk(d));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (code === 0) {
        cb.onDone(Date.now() - start);
      } else {
        const looksLikeAuth = /auth|login|api[_-]?key/i.test(stderr);
        cb.onError(looksLikeAuth ? "CLI_AUTH" : "INTERNAL", `claude exited with code ${code ?? "?"}`, { stderrTail: stderr });
      }
    });
    try {
      child.stdin.end(prompt, "utf8");
    } catch (err) {
      if (!settled) {
        settled = true;
        cb.onError("INTERNAL", `stdin write failed: ${(err as Error).message}`);
      }
    }
  },
};
