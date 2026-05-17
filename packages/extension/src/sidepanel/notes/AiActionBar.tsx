import { useEffect, useRef, useState } from "react";
import { MODE_SPECS, MVP_ENABLED_MODES } from "@memex/shared";
import type { AiMode } from "@memex/shared";
import { stream } from "../../lib/rpc";
import { Icon } from "../../lib/Icons";

interface Props {
  /** Live note body (markdown) — used to build the prompt. */
  noteBody: string;
  /** Called when the user accepts AI output into the note. */
  onApply: (text: string, mode: "append" | "replace") => void;
  /** Called when the AI returns parsed {title, tags} — used by Auto title / tags. */
  onAutoMetadata?: (meta: { title?: string; tags?: string[] }) => void;
}

type RunningKind = AiMode | "auto-meta";
type StreamState =
  | { kind: "idle" }
  | { kind: "running"; mode: AiMode; output: string }
  | { kind: "done"; mode: AiMode; output: string }
  | { kind: "error"; mode: RunningKind; message: string };

/**
 * AI panel that:
 *  1. Streams a chosen "mode" prompt through the active provider
 *  2. Buffers output in a dedicated preview panel (NOT into the note doc)
 *  3. On done, surfaces Append / Replace / Copy / Discard so the user
 *     decides whether (and how) to fold the suggestion into their note
 */
export function AiActionBar({ noteBody, onApply, onAutoMetadata }: Props) {
  const [state, setState] = useState<StreamState>({ kind: "idle" });
  const [autoMetaRunning, setAutoMetaRunning] = useState(false);
  const cancelRef = useRef<{ cancel: () => void } | null>(null);
  const previewRef = useRef<HTMLPreElement>(null);

  // Auto-scroll preview as new tokens stream in.
  useEffect(() => {
    if (state.kind === "running" && previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [state]);

  function run(mode: AiMode) {
    if (state.kind === "running") {
      cancelRef.current?.cancel();
      return;
    }
    if (!noteBody.trim()) return;

    setState({ kind: "running", mode, output: "" });
    const prompt = MODE_SPECS[mode].defaultPromptTemplate(noteBody);

    cancelRef.current = stream(
      { type: "claude.invoke", payload: { mode, prompt } },
      {
        onChunk: (text) => {
          setState((prev) =>
            prev.kind === "running" && prev.mode === mode
              ? { ...prev, output: prev.output + text }
              : prev,
          );
        },
        onDone: () => {
          cancelRef.current = null;
          setState((prev) =>
            prev.kind === "running" && prev.mode === mode
              ? { kind: "done", mode, output: prev.output }
              : prev,
          );
        },
        onError: (code, message) => {
          cancelRef.current = null;
          setState({ kind: "error", mode, message: `${code}: ${message}` });
        },
      },
    );
  }

  function runAutoMeta() {
    if (!onAutoMetadata) return;
    if (autoMetaRunning) {
      cancelRef.current?.cancel();
      return;
    }
    if (!noteBody.trim()) return;

    setAutoMetaRunning(true);
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
        onChunk: (text) => { buffered += text; },
        onDone: () => {
          cancelRef.current = null;
          setAutoMetaRunning(false);
          try {
            const match = buffered.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("no JSON in response");
            const parsed = JSON.parse(match[0]) as { title?: string; tags?: string[] };
            onAutoMetadata(parsed);
          } catch (err) {
            setState({ kind: "error", mode: "auto-meta", message: `auto-meta parse: ${(err as Error).message}` });
          }
        },
        onError: (code, message) => {
          cancelRef.current = null;
          setAutoMetaRunning(false);
          setState({ kind: "error", mode: "auto-meta", message: `${code}: ${message}` });
        },
      },
    );
  }

  function discard() {
    setState({ kind: "idle" });
  }

  function apply(mode: "append" | "replace") {
    if (state.kind !== "done") return;
    onApply(state.output, mode);
    setState({ kind: "idle" });
  }

  async function copy() {
    if (state.kind !== "done") return;
    try {
      await navigator.clipboard.writeText(state.output);
    } catch { /* clipboard write can fail under restricted permissions; harmless */ }
  }

  const isRunning = state.kind === "running";
  const isAnyRunning = isRunning || autoMetaRunning;

  return (
    <div className="ai-wrap">
      {state.kind !== "idle" && (
        <div className={"ai-panel ai-panel-" + state.kind}>
          <div className="ai-panel-head">
            <strong>
              {state.kind === "running" && (
                <>
                  <Icon.Loader size={12} /> {MODE_SPECS[state.mode].label} · streaming…
                </>
              )}
              {state.kind === "done" && (
                <>
                  <Icon.Sparkles size={12} /> {MODE_SPECS[state.mode].label}
                </>
              )}
              {state.kind === "error" && (
                <>⚠ {state.mode === "auto-meta" ? "Auto title / tags" : MODE_SPECS[state.mode as AiMode].label}</>
              )}
            </strong>
            <button
              className="ghost ai-panel-x"
              onClick={isRunning ? () => cancelRef.current?.cancel() : discard}
              title={isRunning ? "Cancel" : "Discard"}
            >
              {isRunning ? "Cancel" : <Icon.X size={12} />}
            </button>
          </div>
          {state.kind === "error" ? (
            <div className="ai-panel-err">{state.message}</div>
          ) : (
            <pre ref={previewRef} className="ai-panel-body">
              {state.kind === "running" && state.output.length === 0 ? "…" : state.output}
            </pre>
          )}
          {state.kind === "done" && state.output.trim().length > 0 && (
            <div className="ai-panel-actions">
              <button className="primary" onClick={() => apply("append")}>
                <Icon.Plus size={12} /> Append to note
              </button>
              <button onClick={() => apply("replace")}>Replace note</button>
              <button className="ghost" onClick={() => void copy()}>Copy</button>
            </div>
          )}
        </div>
      )}

      <div className="ai-bar">
        {MVP_ENABLED_MODES.map((mode) => {
          const spec = MODE_SPECS[mode];
          const active = isRunning && state.mode === mode;
          return (
            <button
              key={mode}
              className={"ai-btn" + (active ? " is-running" : "")}
              onClick={() => run(mode)}
              disabled={!noteBody.trim() || (isAnyRunning && !active)}
              title={spec.systemHint}
            >
              {active ? "Cancel" : spec.label}
            </button>
          );
        })}
        {onAutoMetadata && (
          <button
            className={"ai-btn" + (autoMetaRunning ? " is-running" : "")}
            onClick={runAutoMeta}
            disabled={!noteBody.trim() || (isAnyRunning && !autoMetaRunning)}
            title="Auto title + tags via Claude"
          >
            <Icon.Sparkles size={12} />
            {autoMetaRunning ? "Cancel" : "Auto title / tags"}
          </button>
        )}
      </div>
    </div>
  );
}
