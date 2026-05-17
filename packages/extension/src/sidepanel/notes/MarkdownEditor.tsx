import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const dark = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "#e8eaed", height: "100%" },
    ".cm-content": { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: "13px", padding: "4px 0", caretColor: "#7aa2f7" },
    ".cm-scroller": { fontFamily: "inherit" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#5a6071", border: "none" },
    ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "rgba(122,162,247,0.06)" },
    ".cm-cursor": { borderLeftColor: "#7aa2f7" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#3b4252 !important" },
  },
  { dark: true },
);

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, color: "#7aa2f7", fontWeight: "700", fontSize: "1.2em" },
  { tag: t.heading2, color: "#7aa2f7", fontWeight: "700" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: "#bb9af7", fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "#7aa2f7", textDecoration: "underline" },
  { tag: t.url, color: "#9ece6a" },
  { tag: [t.monospace, t.literal], color: "#e0af68", fontFamily: "var(--mono)" },
  { tag: t.quote, color: "#9aa0a6", fontStyle: "italic" },
  { tag: t.list, color: "#bb9af7" },
  { tag: t.atom, color: "#f7768e" },
]);

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function MarkdownEditor({ value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        markdown(),
        syntaxHighlighting(mdHighlight),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        dark,
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
