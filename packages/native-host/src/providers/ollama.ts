import type { AiProvider } from "./types.js";
import { getSetting } from "../db.js";

/**
 * Ollama provider — talks to a local ollama server (default :11434).
 * Streaming uses Ollama's line-delimited JSON.
 */
export const ollamaProvider: AiProvider = {
  name: "ollama",
  stream(prompt, signal, cb) {
    const baseUrl = (getSetting("ai.ollama.url") || "http://127.0.0.1:11434").replace(/\/$/, "");
    const model = getSetting("ai.ollama.model") || "llama3.2";

    const start = Date.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: true,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          cb.onError("INTERNAL", `Ollama HTTP ${res.status}`, { body: text.slice(0, 500) });
          return;
        }
        if (!res.body) {
          cb.onError("INTERNAL", "Ollama response has no body");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = pending.indexOf("\n")) >= 0) {
            const line = pending.slice(0, nl).trim();
            pending = pending.slice(nl + 1);
            if (!line) continue;
            try {
              const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
              if (json.message?.content) cb.onChunk(json.message.content);
              if (json.done) { cb.onDone(Date.now() - start); return; }
            } catch { /* ignore */ }
          }
        }
        cb.onDone(Date.now() - start);
      } catch (err) {
        if ((err as Error).name === "AbortError") cb.onError("CANCELLED", "Cancelled by client");
        else cb.onError("INTERNAL", `Ollama request failed: ${(err as Error).message}. Is ollama running on ${baseUrl}?`);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    })();
  },
};
