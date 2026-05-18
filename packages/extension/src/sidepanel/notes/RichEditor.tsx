import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { useT } from "../../lib/i18n";
import { is, request } from "../../lib/rpc";

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

/**
 * In-memory cache for memex-media:// URL → object URL. Cached for the page
 * lifetime so subsequent renders/scrolls don't re-fetch the same image from
 * the native host. Per-image evict on unload is fine (Chrome resets the
 * panel anyway when closed).
 */
const objectUrlCache = new Map<string, string>();
async function resolveMediaUrl(token: string): Promise<string> {
  // token looks like "memex-media://<uuid>.<ext>"
  const id = token.replace(/^memex-media:\/\//, "");
  const cached = objectUrlCache.get(id);
  if (cached) return cached;
  const res = await request({ type: "media.get", payload: { id } }, is.mediaGet);
  const blob = await (await fetch(`data:${res.mimeType};base64,${res.dataBase64}`)).blob();
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, url);
  return url;
}

/**
 * Default Image extension renders <img src={attrs.src}>. Browsers can't load
 * a `memex-media://` URL directly, so we override the renderHTML to start
 * with an empty src + a data-mediaSrc the node view (created via the same
 * extension) resolves async. We don't actually need a node view here — the
 * DOM is editable and we just need the src swapped once after mount; a
 * tiny mutation observer accomplishes that for any <img> with our token.
 */
const MemexImage = Image.configure({
  inline: false,
  allowBase64: true,
  HTMLAttributes: { class: "rich-img", loading: "lazy" },
});

/**
 * Read a clipboard/dropped File, send the bytes to the host's media store,
 * and return the `memex-media://<id>` URL token to insert into the doc.
 */
async function handleImageFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // Manual base64 (binary-safe) — btoa(String.fromCharCode(...)) blows the
  // stack on multi-MB images.
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const dataBase64 = btoa(binary);
  const ext = (file.name.split(".").pop() || file.type.split("/")[1] || "png").toLowerCase();
  const res = await request(
    { type: "media.save", payload: { dataBase64, ext } },
    is.mediaSave,
  );
  return `memex-media://${res.id}`;
}

function installMediaResolver(rootEl: HTMLElement | null): () => void {
  if (!rootEl) return () => {};
  function resolveAll() {
    const imgs = rootEl!.querySelectorAll<HTMLImageElement>('img[src^="memex-media://"]');
    imgs.forEach((img) => {
      const token = img.getAttribute("src") ?? "";
      img.setAttribute("data-media-token", token);
      // Empty out the broken src so the browser stops trying to load it.
      img.setAttribute("src", "");
      resolveMediaUrl(token).then((url) => { img.src = url; }).catch(() => {
        img.alt = "[image unavailable]";
      });
    });
  }
  resolveAll();
  const mo = new MutationObserver(() => resolveAll());
  mo.observe(rootEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  return () => mo.disconnect();
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
      MemexImage,
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
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const imageNode = view.state.schema.nodes.image;
        if (!imageNode) return false;
        for (const item of Array.from(items)) {
          if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
          const file = item.getAsFile();
          if (!file) continue;
          event.preventDefault();
          handleImageFile(file).then((token) => {
            view.dispatch(
              view.state.tr.replaceSelectionWith(imageNode.create({ src: token })),
            );
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[memex] failed to save pasted image", err);
          });
          return true;
        }
        return false;
      },
      handleDrop(view, event) {
        const dt = event.dataTransfer;
        if (!dt || dt.files.length === 0) return false;
        const file = Array.from(dt.files).find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        const imageNode = view.state.schema.nodes.image;
        if (!imageNode) return false;
        event.preventDefault();
        handleImageFile(file).then((token) => {
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          const tr = pos != null
            ? view.state.tr.insert(pos, imageNode.create({ src: token }))
            : view.state.tr.replaceSelectionWith(imageNode.create({ src: token }));
          view.dispatch(tr);
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[memex] failed to save dropped image", err);
        });
        return true;
      },
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

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor) return;
    return installMediaResolver(scrollRef.current);
  }, [editor]);

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
      <div className="rich-scroll" ref={scrollRef}>
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
