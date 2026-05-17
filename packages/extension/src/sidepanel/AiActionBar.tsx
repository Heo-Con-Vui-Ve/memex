import { useRef, useState } from "react";
import { MODE_SPECS, MVP_ENABLED_MODES } from "@notepad-ai/shared";
import type { AiMode } from "@notepad-ai/shared";
import { stream } from "../lib/rpc";

interface Props {
  noteBody: string;
  onChunk: (text: string) => void;
  onDone: () => void;
}

export function AiActionBar({ noteBody, onChunk, onDone }: Props) {
  const [running, setRunning] = useState<AiMode | null>(null);
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
        onChunk(text) {
          onChunk(text);
        },
        onDone() {
          setRunning(null);
          cancelRef.current = null;
          onDone();
        },
        onError(code, message) {
          setRunning(null);
          cancelRef.current = null;
          setError(`${code}: ${message}`);
          onChunk(`\n\n_⚠ ${code}: ${message}_\n`);
          onDone();
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
      {error && <span className="ai-error">{error}</span>}
    </div>
  );
}
