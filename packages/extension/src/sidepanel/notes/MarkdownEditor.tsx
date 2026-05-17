import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { effectiveTheme, onThemeChange, type EffectiveTheme } from "../../lib/theme";

const baseTheme = (mode: EffectiveTheme) =>
  EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        color: mode === "dark" ? "#e8eaed" : "#18181b",
        height: "100%",
      },
      ".cm-content": {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: "13px",
        padding: "4px 0",
        caretColor: mode === "dark" ? "#8b5cf6" : "#7c3aed",
      },
      ".cm-scroller": { fontFamily: "inherit" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: mode === "dark" ? "#5a6071" : "#a1a1aa",
        border: "none",
      },
      ".cm-activeLineGutter, .cm-activeLine": {
        backgroundColor: mode === "dark" ? "rgba(139,92,246,0.06)" : "rgba(124,58,237,0.05)",
      },
      ".cm-cursor": { borderLeftColor: mode === "dark" ? "#8b5cf6" : "#7c3aed" },
      "&.cm-focused": { outline: "none" },
      ".cm-selectionBackground, ::selection": {
        backgroundColor: mode === "dark" ? "#3b4252 !important" : "#e0d4f7 !important",
      },
    },
    { dark: mode === "dark" },
  );

const mdHighlight = (mode: EffectiveTheme) => HighlightStyle.define([
  { tag: t.heading1, color: mode === "dark" ? "#8b5cf6" : "#7c3aed", fontWeight: "700", fontSize: "1.2em" },
  { tag: t.heading2, color: mode === "dark" ? "#8b5cf6" : "#7c3aed", fontWeight: "700" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: mode === "dark" ? "#c084fc" : "#9333ea", fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: mode === "dark" ? "#8b5cf6" : "#7c3aed", textDecoration: "underline" },
  { tag: t.url, color: mode === "dark" ? "#4ade80" : "#16a34a" },
  { tag: [t.monospace, t.literal], color: mode === "dark" ? "#fbbf24" : "#d97706" },
  { tag: t.quote, color: mode === "dark" ? "#a1a1aa" : "#71717a", fontStyle: "italic" },
  { tag: t.list, color: mode === "dark" ? "#c084fc" : "#9333ea" },
  { tag: t.atom, color: mode === "dark" ? "#f87171" : "#dc2626" },
]);

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function MarkdownEditor({ value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const [, forceTick] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const mode = effectiveTheme();
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        markdown(),
        themeCompartment.current.of([
          baseTheme(mode),
          syntaxHighlighting(mdHighlight(mode)),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ]),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // intentionally only init once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reactively swap the CodeMirror theme when the user changes app theme.
  useEffect(() => {
    return onThemeChange((mode) => {
      const v = view.current;
      if (!v) return;
      v.dispatch({
        effects: themeCompartment.current.reconfigure([
          baseTheme(mode),
          syntaxHighlighting(mdHighlight(mode)),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ]),
      });
      forceTick((n) => n + 1);
    });
  }, []);

  // External updates to `value` (eg. AI streaming appended) → push into the editor
  // without breaking undo history if avoidable.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === value) return;
    v.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div ref={host} className="cm-host" />;
}
