import { useRef, useState } from "react";
import { MODE_SPECS, MVP_ENABLED_MODES } from "@notepad-ai/shared";
import type { AiMode } from "@notepad-ai/shared";
import { stream } from "../../lib/rpc";
import { Icon } from "../../lib/Icons";

interface Props {
  noteBody: string;
  onChunk: (text: string) => void;
  onDone: () => void;
  /** Optional: invoke this when the AI returns a JSON {title, tags}. Used by the Auto-title/Tags button. */
  onAutoMetadata?: (meta: { title?: string; tags?: string[] }) => void;
}

export function AiActionBar({ noteBody, onChunk, onDone, onAutoMetadata }: Props) {
  const [running, setRunning] = useState<AiMode | "auto-meta" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<{ cancel: () => void } | null>(null);

  function run(mode: AiMode) {
    if (running) {
      cancelRef.current?.cancel();
      return;
    }
    setError(null);
    setRunning(mode);
    const prompt = MODE_SPECS[mode].defaultPromptTemplate(noteBody);
    const banner = `\n\n---\n**${MODE_SPECS[mode].label}** · streaming…\n\n`;
    onChunk(banner);

    cancelRef.current = stream(
      { type: "claude.invoke", payload: { mode, prompt } },
      {
        onChunk: (text) => onChunk(text),
        onDone: () => {
          setRunning(null);
          cancelRef.current = null;
          onDone();
        },
        onError: (code, message) => {
          setRunning(null);
          cancelRef.current = null;
          setError(`${code}: ${message}`);
          onChunk(`\n\n_⚠ ${code}: ${message}_\n`);
          onDone();
        },
      },
    );
  }

  function runAutoMeta() {
    if (!onAutoMetadata) return;
    if (running) {
      cancelRef.current?.cancel();
      return;
    }
    setError(null);
    setRunning("auto-meta");
    const prompt = `Read the note below and respond with ONLY a JSON object of the form:
{"title": "...", "tags": ["...", "..."]}

The title should be ≤ 60 chars. Tags should be 1-5 lowercase single-word labels.

Note:
---
${noteBody}
---`;
    let buffered = "";
    cancelRef.current = stream(
      { type: "claude.invoke", payload: { mode: "summarize", prompt } },
      {
        onChunk: (text) => {
          buffered += text;
        },
        onDone: () => {
          setRunning(null);
          cancelRef.current = null;
          try {
            const match = buffered.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("no JSON in response");
            const parsed = JSON.parse(match[0]) as { title?: string; tags?: string[] };
            onAutoMetadata(parsed);
          } catch (err) {
            setError(`auto-meta parse: ${(err as Error).message}`);
          }
        },
        onError: (code, message) => {
          setRunning(null);
          cancelRef.current = null;
          setError(`${code}: ${message}`);
        },
      },
    );
  }

  return (
    <div className="ai-bar">
      {MVP_ENABLED_MODES.map((mode) => {
        const spec = MODE_SPECS[mode];
        const active = running === mode;
        return (
          <button
            key={mode}
            className={"ai-btn" + (active ? " is-running" : "")}
            onClick={() => run(mode)}
            disabled={!noteBody.trim() || (running !== null && !active)}
            title={spec.systemHint}
          >
            {active ? "Cancel" : spec.label}
          </button>
        );
      })}
      {onAutoMetadata && (
        <button
          className={"ai-btn" + (running === "auto-meta" ? " is-running" : "")}
          onClick={runAutoMeta}
          disabled={!noteBody.trim() || (running !== null && running !== "auto-meta")}
          title="Auto title + tags via Claude"
        >
          <Icon.Sparkles size={12} />
          {running === "auto-meta" ? "Cancel" : "Auto title / tags"}
        </button>
      )}
      {error && <span className="ai-error">{error}</span>}
    </div>
  );
}
