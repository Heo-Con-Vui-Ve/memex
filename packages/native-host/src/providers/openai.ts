import type { AiProvider } from "./types.js";
import { getSetting } from "../db.js";

/**
 * OpenAI Chat Completions provider. Streams via SSE. Reads model + key from
 * the settings table (set via the extension Options page).
 */
export const openaiProvider: AiProvider = {
  name: "openai",
  stream(prompt, signal, cb) {
    const apiKey = getSetting("ai.openai.apiKey");
    const model = getSetting("ai.openai.model") || "gpt-4o-mini";
    if (!apiKey) {
      cb.onError("CLI_AUTH", "OpenAI API key not set. Add it in Options → AI provider.");
      return;
    }

    const start = Date.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    (async () => {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: true,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          cb.onError(res.status === 401 ? "CLI_AUTH" : "INTERNAL", `OpenAI HTTP ${res.status}`, { body: text.slice(0, 500) });
          return;
        }
        if (!res.body) {
          cb.onError("INTERNAL", "OpenAI response has no body");
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
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") { cb.onDone(Date.now() - start); return; }
            try {
              const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) cb.onChunk(delta);
            } catch { /* ignore malformed sse line */ }
          }
        }
        cb.onDone(Date.now() - start);
      } catch (err) {
        if ((err as Error).name === "AbortError") cb.onError("CANCELLED", "Cancelled by client");
        else cb.onError("INTERNAL", `OpenAI request failed: ${(err as Error).message}`);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    })();
  },
};
