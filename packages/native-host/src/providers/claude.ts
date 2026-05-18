import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { AiProvider } from "./types.js";
import { getMediaDir } from "../paths.js";
import { mediaPathIfExists } from "../media.js";

/**
 * Pre-process: rewrite every `memex-media://<id>` reference in the prompt
 * to the absolute file path on disk, and surface a small hint so the model
 * knows to actually open them with its Read tool.
 *
 * Returns the rewritten prompt plus any extra args claude needs (`--add-dir`
 * to grant Read access to the media directory).
 */
function resolveMediaRefs(prompt: string): { prompt: string; extraArgs: string[] } {
  const tokenRe = /!\[([^\]]*)\]\(memex-media:\/\/([^)]+)\)/g;
  const resolvedPaths = new Set<string>();
  const rewritten = prompt.replace(tokenRe, (_match, alt: string, id: string) => {
    const full = mediaPathIfExists(id);
    if (!full) return `_[image unavailable: ${alt}]_`;
    resolvedPaths.add(full);
    return `![${alt}](${full})`;
  });
  if (resolvedPaths.size === 0) return { prompt: rewritten, extraArgs: [] };
  const list = Array.from(resolvedPaths).map((p) => `- ${p}`).join("\n");
  const hint = `\n\n---\n**Image attachments**\nThe note above references ${resolvedPaths.size} image${resolvedPaths.size === 1 ? "" : "s"} stored locally. Open each path with your Read tool to analyze the actual image content before responding:\n${list}\n`;
  return { prompt: rewritten + hint, extraArgs: ["--add-dir", getMediaDir()] };
}

export const claudeProvider: AiProvider = {
  name: "claude",
  stream(prompt, signal, cb) {
    const start = Date.now();
    const { prompt: finalPrompt, extraArgs } = resolveMediaRefs(prompt);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn("claude", ["--print", ...extraArgs], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
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
      child.stdin.end(finalPrompt, "utf8");
    } catch (err) {
      if (!settled) {
        settled = true;
        cb.onError("INTERNAL", `stdin write failed: ${(err as Error).message}`);
      }
    }
  },
};
