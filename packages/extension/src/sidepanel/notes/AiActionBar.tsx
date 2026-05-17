import { useEffect, useRef, useState } from "react";
import { MODE_SPECS, MVP_ENABLED_MODES } from "@memex/shared";
import type { AiMode } from "@memex/shared";
import { stream } from "../../lib/rpc";
import { Icon } from "../../lib/Icons";
import { aiLanguageDirective, useT } from "../../lib/i18n";

/** Source the prompt should be built from. Captured at the moment the user
 *  clicks a mode button, so subsequent typing doesn't shift the target. */
export type AiContext =
  | { kind: "selection"; text: string }
  | { kind: "whole"; text: string };

/** How the user wants to fold AI output back into the note. */
export type AiApplyMode =
  | "append"               // append at end of note
  | "replace-whole"        // overwrite whole note
  | "replace-selection"    // overwrite the captured selection
  | "insert-after-selection"; // insert right after the selection

interface Props {
  /** Called at run-time to capture the current AI context (selection or whole). */
  getContext: () => AiContext;
  /** Called when the user accepts AI output. */
  onApply: (text: string, mode: AiApplyMode) => void;
  /** Optional: invoked when Auto title / tags returns parsed JSON. */
  onAutoMetadata?: (meta: { title?: string; tags?: string[] }) => void;
}

type StreamState =
  | { kind: "idle" }
  | { kind: "running"; mode: AiMode; ctx: AiContext; output: string }
  | { kind: "done"; mode: AiMode; ctx: AiContext; output: string }
  | { kind: "error"; mode: AiMode | "auto-meta"; message: string };

/**
 * AI panel that:
 *  1. Streams a chosen "mode" prompt through the active provider, against the
 *     current selection if any, otherwise the whole note
 *  2. Buffers output in a dedicated preview panel (NOT into the note doc)
 *  3. On done, surfaces context-appropriate Apply buttons (replace selection
 *     / insert after / append / replace whole / copy / discard)
 */
export function AiActionBar({ getContext, onApply, onAutoMetadata }: Props) {
  const tr = useT();
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
    const ctx = getContext();
    if (!ctx.text.trim()) return;

    setState({ kind: "running", mode, ctx, output: "" });
    const prompt = `${aiLanguageDirective()}\n\n${MODE_SPECS[mode].defaultPromptTemplate(ctx.text)}`;

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
              ? { kind: "done", mode, ctx: prev.ctx, output: prev.output }
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
    const ctx = getContext();
    // Auto-meta always operates on the whole note; selection doesn't make sense here.
    const body = ctx.kind === "selection" ? "" : ctx.text;
    if (!body.trim()) return;

    setAutoMetaRunning(true);
    const prompt = `${aiLanguageDirective()}

Read the note below and respond with ONLY a JSON object of the form:
{"title": "...", "tags": ["...", "..."]}

The title should be ≤ 60 chars. Tags should be 1-5 lowercase single-word labels.

Note:
---
${body}
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
            setState({ kind: "error", mode: "auto-meta", message: tr.autoMetaParseErr((err as Error).message) });
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

  function apply(mode: AiApplyMode) {
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

  const modeLabelFor = (m: AiMode | "auto-meta"): string =>
    m === "auto-meta" ? tr.autoTitleTags : tr.modeLabel[m];

  const ctxLabel = (ctx: AiContext): string =>
    ctx.kind === "selection" ? tr.selectionLabel(ctx.text.length) : tr.wholeNoteLabel;

  // Preserve the editor's selection when clicking buttons: without
  // preventDefault, the focus shift on mousedown clears the highlight before
  // our onClick can read it via getContext().
  const noBlur = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="ai-wrap">
      {state.kind !== "idle" && (
        <div className={"ai-panel ai-panel-" + state.kind}>
          <div className="ai-panel-head">
            <strong>
              {state.kind === "running" && (
                <>
                  <Icon.Loader size={12} /> {modeLabelFor(state.mode)} · {ctxLabel(state.ctx)} · {tr.streaming}
                </>
              )}
              {state.kind === "done" && (
                <>
                  <Icon.Sparkles size={12} /> {modeLabelFor(state.mode)} · {ctxLabel(state.ctx)}
                </>
              )}
              {state.kind === "error" && (
                <>⚠ {modeLabelFor(state.mode)}</>
              )}
            </strong>
            <button
              className="ghost ai-panel-x"
              onClick={isRunning ? () => cancelRef.current?.cancel() : discard}
              title={isRunning ? tr.cancel : tr.discard}
            >
              {isRunning ? tr.cancel : <Icon.X size={12} />}
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
              {state.ctx.kind === "selection" ? (
                <>
                  <button className="primary" onClick={() => apply("replace-selection")}>
                    <Icon.Sparkles size={12} /> {tr.replaceSelection}
                  </button>
                  <button onClick={() => apply("insert-after-selection")}>{tr.insertAfter}</button>
                  <button onClick={() => apply("append")}>{tr.appendToEnd}</button>
                </>
              ) : (
                <>
                  <button className="primary" onClick={() => apply("append")}>
                    <Icon.Plus size={12} /> {tr.appendToNote}
                  </button>
                  <button onClick={() => apply("replace-whole")}>{tr.replaceNote}</button>
                </>
              )}
              <button className="ghost" onClick={() => void copy()}>{tr.copy}</button>
            </div>
          )}
        </div>
      )}

      <div className="ai-bar">
        {MVP_ENABLED_MODES.map((mode) => {
          const active = isRunning && state.mode === mode;
          return (
            <button
              key={mode}
              className={"ai-btn" + (active ? " is-running" : "")}
              onMouseDown={noBlur}
              onClick={() => run(mode)}
              disabled={isAnyRunning && !active}
              title={tr.modeHint[mode]}
            >
              {active ? tr.cancel : tr.modeLabel[mode]}
            </button>
          );
        })}
        {onAutoMetadata && (
          <button
            className={"ai-btn" + (autoMetaRunning ? " is-running" : "")}
            onMouseDown={noBlur}
            onClick={runAutoMeta}
            disabled={isAnyRunning && !autoMetaRunning}
            title={tr.autoTitleTagsTitle}
          >
            <Icon.Sparkles size={12} />
            {autoMetaRunning ? tr.cancel : tr.autoTitleTags}
          </button>
        )}
      </div>
    </div>
  );
}
