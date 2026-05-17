import { useImperativeHandle, forwardRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import { useT } from "../../lib/i18n";

export interface SelectionInfo {
  /** Plain-text contents of the current selection (newlines preserved). */
  text: string;
  /** ProseMirror doc positions (kept for callers that want them). */
  from: number;
  to: number;
}

export interface RichEditorHandle {
  /** Replace the entire document by parsing this markdown source. */
  setMarkdown: (md: string) => void;
  /** Get the current document as markdown. */
  getMarkdown: () => string;
  /** Append `text` (parsed as markdown) after the current content. */
  appendMarkdown: (text: string) => void;
  /** Get the current non-empty selection (null if cursor only). */
  getSelection: () => SelectionInfo | null;
  /** Substitute the selection's plain text inside the *markdown source* with
   *  `text` and re-render. Falls back to append when the selection can't be
   *  located in the markdown (e.g. selection spans non-text nodes). */
  replaceSelectionWithMarkdown: (text: string) => void;
  /** Insert `text` into the markdown source immediately after the selection.
   *  Falls back to append when the selection can't be located. */
  insertAfterSelectionInMarkdown: (text: string) => void;
}

interface Props {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { initialMarkdown, onChange },
  ref,
) {
  const tr = useT();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { HTMLAttributes: { class: "rich-code" } } }),
      Placeholder.configure({ placeholder: tr.startWriting }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        linkify: true,
        breaks: true,
        transformPastedText: true,
      }),
    ],
    content: initialMarkdown,
    onUpdate({ editor }) {
      // tiptap-markdown adds a .markdown.getMarkdown() helper to the storage
      const md = (editor.storage as { markdown?: { getMarkdown: () => string } })
        .markdown?.getMarkdown() ?? editor.getText();
      onChange(md);
    },
    editorProps: {
      attributes: { class: "rich-content" },
    },
  });

  function readMarkdown(): string {
    if (!editor) return "";
    return (editor.storage as { markdown?: { getMarkdown: () => string } })
      .markdown?.getMarkdown() ?? editor.getText();
  }

  useImperativeHandle(
    ref,
    () => ({
      setMarkdown(md: string) {
        if (!editor) return;
        editor.commands.setContent(md, { emitUpdate: true });
      },
      getMarkdown: readMarkdown,
      appendMarkdown(text: string) {
        if (!editor) return;
        const current = readMarkdown();
        const sep = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
        editor.commands.setContent(current + sep + text, { emitUpdate: true });
      },
      getSelection() {
        if (!editor) return null;
        const { from, to } = editor.state.selection;
        if (from === to) return null;
        const text = editor.state.doc.textBetween(from, to, "\n", "\n").trim();
        if (!text) return null;
        return { text, from, to };
      },
      replaceSelectionWithMarkdown(text: string) {
        if (!editor) return;
        const sel = (() => {
          const { from, to } = editor.state.selection;
          if (from === to) return null;
          return editor.state.doc.textBetween(from, to, "\n", "\n").trim();
        })();
        const current = readMarkdown();
        if (!sel) {
          // No selection — behave like appendMarkdown.
          const sep = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
          editor.commands.setContent(current + sep + text, { emitUpdate: true });
          return;
        }
        const idx = current.indexOf(sel);
        if (idx < 0) {
          // Selection text didn't match the markdown source (e.g. spans a
          // heading marker stripped by textBetween). Safer to append than to
          // silently lose user content.
          const sep = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
          editor.commands.setContent(current + sep + text, { emitUpdate: true });
          return;
        }
        const next = current.slice(0, idx) + text + current.slice(idx + sel.length);
        editor.commands.setContent(next, { emitUpdate: true });
      },
      insertAfterSelectionInMarkdown(text: string) {
        if (!editor) return;
        const sel = (() => {
          const { from, to } = editor.state.selection;
          if (from === to) return null;
          return editor.state.doc.textBetween(from, to, "\n", "\n").trim();
        })();
        const current = readMarkdown();
        if (!sel) {
          const sep = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
          editor.commands.setContent(current + sep + text, { emitUpdate: true });
          return;
        }
        const idx = current.indexOf(sel);
        if (idx < 0) {
          const sep = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
          editor.commands.setContent(current + sep + text, { emitUpdate: true });
          return;
        }
        const insertAt = idx + sel.length;
        const before = current.slice(0, insertAt);
        const after = current.slice(insertAt);
        const beforeSep = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
        const afterSep = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
        editor.commands.setContent(before + beforeSep + text + afterSep + after, { emitUpdate: true });
      },
    }),
    [editor],
  );

  // Intentionally no useEffect syncing `initialMarkdown` back into the editor.
  // The parent uses `key={note.id}` so switching to a different note remounts
  // this component (fresh `useEditor` with the new initial content). Within a
  // single mount, the editor is the source of truth — re-syncing whenever
  // initialMarkdown changes would clobber in-progress typing every time our
  // own save() round-trip echoes the note back with a stale-by-a-keystroke
  // contentMd.

  return (
    <div className="rich-host">
      <Toolbar editor={editor} />
      <div className="rich-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

function Toolbar({ editor }: { editor: Editor | null }) {
  const tr = useT();
  if (!editor) return null;
  const btn = (
    label: string,
    title: string,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      type="button"
      title={title}
      className={"rich-tb-btn" + (active ? " is-active" : "")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div className="rich-toolbar">
      {btn("H1", tr.rtH1, editor.isActive("heading", { level: 1 }), () =>
        editor.chain().focus().toggleHeading({ level: 1 }).run(),
      )}
      {btn("H2", tr.rtH2, editor.isActive("heading", { level: 2 }), () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      )}
      <span className="rich-tb-sep" />
      {btn("B", tr.rtBold, editor.isActive("bold"), () =>
        editor.chain().focus().toggleBold().run(),
      )}
      {btn("I", tr.rtItalic, editor.isActive("italic"), () =>
        editor.chain().focus().toggleItalic().run(),
      )}
      {btn("S", tr.rtStrike, editor.isActive("strike"), () =>
        editor.chain().focus().toggleStrike().run(),
      )}
      {btn("</>", tr.rtCode, editor.isActive("code"), () =>
        editor.chain().focus().toggleCode().run(),
      )}
      <span className="rich-tb-sep" />
      {btn("•", tr.rtBullet, editor.isActive("bulletList"), () =>
        editor.chain().focus().toggleBulletList().run(),
      )}
      {btn("1.", tr.rtNumbered, editor.isActive("orderedList"), () =>
        editor.chain().focus().toggleOrderedList().run(),
      )}
      {btn("☐", tr.rtTodo, editor.isActive("taskList"), () =>
        editor.chain().focus().toggleList("taskList", "taskItem").run(),
      )}
      <span className="rich-tb-sep" />
      {btn("❝", tr.rtQuote, editor.isActive("blockquote"), () =>
        editor.chain().focus().toggleBlockquote().run(),
      )}
      {btn("{ }", tr.rtCodeBlock, editor.isActive("codeBlock"), () =>
        editor.chain().focus().toggleCodeBlock().run(),
      )}
    </div>
  );
}
