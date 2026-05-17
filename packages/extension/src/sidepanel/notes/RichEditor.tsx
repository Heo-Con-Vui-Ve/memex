import { useImperativeHandle, forwardRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

export interface RichEditorHandle {
  /** Replace the entire document by parsing this markdown source. */
  setMarkdown: (md: string) => void;
  /** Get the current document as markdown. */
  getMarkdown: () => string;
  /** Append `text` (parsed as markdown) after the current content, separated
   *  by a blank line if needed. */
  appendMarkdown: (text: string) => void;
}

interface Props {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { initialMarkdown, onChange },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { HTMLAttributes: { class: "rich-code" } } }),
      Placeholder.configure({ placeholder: "Start writing…" }),
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

  useImperativeHandle(
    ref,
    () => ({
      setMarkdown(md: string) {
        if (!editor) return;
        editor.commands.setContent(md, { emitUpdate: true });
      },
      getMarkdown() {
        if (!editor) return "";
        return (editor.storage as { markdown?: { getMarkdown: () => string } })
          .markdown?.getMarkdown() ?? editor.getText();
      },
      appendMarkdown(text: string) {
        if (!editor) return;
        const current = (editor.storage as { markdown?: { getMarkdown: () => string } })
          .markdown?.getMarkdown() ?? editor.getText();
        const sep = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
        editor.commands.setContent(current + sep + text, { emitUpdate: true });
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
      <EditorContent editor={editor} />
    </div>
  );
});

function Toolbar({ editor }: { editor: Editor | null }) {
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
      {btn("H1", "Heading 1", editor.isActive("heading", { level: 1 }), () =>
        editor.chain().focus().toggleHeading({ level: 1 }).run(),
      )}
      {btn("H2", "Heading 2", editor.isActive("heading", { level: 2 }), () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      )}
      <span className="rich-tb-sep" />
      {btn("B", "Bold", editor.isActive("bold"), () =>
        editor.chain().focus().toggleBold().run(),
      )}
      {btn("I", "Italic", editor.isActive("italic"), () =>
        editor.chain().focus().toggleItalic().run(),
      )}
      {btn("S", "Strikethrough", editor.isActive("strike"), () =>
        editor.chain().focus().toggleStrike().run(),
      )}
      {btn("</>", "Inline code", editor.isActive("code"), () =>
        editor.chain().focus().toggleCode().run(),
      )}
      <span className="rich-tb-sep" />
      {btn("•", "Bullet list", editor.isActive("bulletList"), () =>
        editor.chain().focus().toggleBulletList().run(),
      )}
      {btn("1.", "Numbered list", editor.isActive("orderedList"), () =>
        editor.chain().focus().toggleOrderedList().run(),
      )}
      {btn("☐", "Todo list", editor.isActive("taskList"), () =>
        editor.chain().focus().toggleList("taskList", "taskItem").run(),
      )}
      <span className="rich-tb-sep" />
      {btn("❝", "Quote", editor.isActive("blockquote"), () =>
        editor.chain().focus().toggleBlockquote().run(),
      )}
      {btn("{ }", "Code block", editor.isActive("codeBlock"), () =>
        editor.chain().focus().toggleCodeBlock().run(),
      )}
    </div>
  );
}
