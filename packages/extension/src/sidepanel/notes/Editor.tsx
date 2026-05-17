import { useEffect, useRef, useState } from "react";
import type { FolderRow, NoteRow } from "@memex/shared";
import { is, request } from "../../lib/rpc";
import { Icon } from "../../lib/Icons";
import { useT } from "../../lib/i18n";
import { AiActionBar, type AiApplyMode, type AiContext } from "./AiActionBar";
import { TagsInput } from "./TagsInput";
import { RichEditor, type RichEditorHandle } from "./RichEditor";

interface Props {
  note: NoteRow;
  folders: FolderRow[];
  onBack: () => void;
  onSaved: (n: NoteRow) => void;
  onDeleted: () => void;
}

const SAVE_DEBOUNCE_MS = 600;

export function Editor({ note, folders, onBack, onSaved, onDeleted }: Props) {
  const tr = useT();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [folderId, setFolderId] = useState<string | null>(note.folderId);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bodyRef = useRef(note.contentMd);
  const dirtyRef = useRef(false);
  const debouncer = useRef<number | null>(null);
  const editorRef = useRef<RichEditorHandle>(null);

  // Only re-sync local state when the user switches to a *different* note.
  // Re-syncing on every field would clobber in-flight typing whenever our own
  // save() round-trip resolves (the parent re-renders us with a fresh note
  // object — same values, but `tags` is a new array reference, which is
  // enough to refire a field-dep effect).
  useEffect(() => {
    setTitle(note.title);
    setTags(note.tags);
    setFolderId(note.folderId);
    bodyRef.current = note.contentMd;
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  function scheduleSave() {
    dirtyRef.current = true;
    if (debouncer.current) clearTimeout(debouncer.current);
    debouncer.current = window.setTimeout(save, SAVE_DEBOUNCE_MS);
  }

  async function save() {
    if (!dirtyRef.current) return;
    setSaving(true);
    try {
      const updated: NoteRow = {
        ...note,
        title: title.trim() || tr.untitled,
        contentMd: bodyRef.current,
        tags,
        folderId,
        updatedAt: Date.now(),
      };
      const res = await request(
        { type: "notes.upsert", payload: { note: updated } },
        is.upsertResult,
      );
      dirtyRef.current = false;
      onSaved(res.note);
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm(tr.confirmDelete(note.title || tr.untitled))) return;
    await request({ type: "notes.delete", payload: { id: note.id } }, is.deleteResult);
    onDeleted();
  }

  function getAiContext(): AiContext {
    const sel = editorRef.current?.getSelection();
    if (sel) return { kind: "selection", text: sel.text };
    return { kind: "whole", text: bodyRef.current };
  }

  function applyAiOutput(text: string, mode: AiApplyMode) {
    const ed = editorRef.current;
    if (!ed) return;
    switch (mode) {
      case "replace-whole":
        ed.setMarkdown(text);
        break;
      case "append":
        ed.appendMarkdown(text);
        break;
      case "replace-selection":
        ed.replaceSelectionWithMarkdown(text);
        break;
      case "insert-after-selection":
        ed.insertAfterSelectionInMarkdown(text);
        break;
    }
    bodyRef.current = ed.getMarkdown();
    dirtyRef.current = true;
    void save();
  }

  return (
    <div className="editor">
      <header className="editor-top">
        <button className="ghost icon-only" onClick={() => { void save(); onBack(); }} title={tr.back}>
          ← <span className="sr-only">{tr.back}</span>
        </button>
        <div className="editor-status-inline">{saving ? tr.saving : dirtyRef.current ? tr.edited : tr.saved}</div>
        <div className="folder-pop">
          <button className="ghost icon-only" onClick={() => setMenuOpen((o) => !o)} title={tr.more}>⋯</button>
          {menuOpen && (
            <>
              <div className="pop-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="pop pop-right">
                <div className="pop-section-label">{tr.moveToFolder}</div>
                <button className={"pop-item" + (folderId === null ? " is-active" : "")} onClick={() => { setFolderId(null); scheduleSave(); setMenuOpen(false); }}>
                  {tr.unsorted}
                </button>
                {folders.map((f) => (
                  <button key={f.id} className={"pop-item" + (folderId === f.id ? " is-active" : "")} onClick={() => { setFolderId(f.id); scheduleSave(); setMenuOpen(false); }}>
                    <Icon.Folder size={12} /> {f.name}
                  </button>
                ))}
                <div className="pop-sep" />
                <button className="pop-item danger" onClick={() => { setMenuOpen(false); void del(); }}>
                  <Icon.Trash size={13} /> {tr.deleteNote}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <input
        className="editor-title"
        value={title}
        onChange={(e) => { setTitle(e.target.value); scheduleSave(); }}
        placeholder={tr.untitled}
      />

      <TagsInput
        tags={tags}
        onChange={(t) => { setTags(t); scheduleSave(); }}
      />

      <RichEditor
        ref={editorRef}
        initialMarkdown={note.contentMd}
        onChange={(md) => { bodyRef.current = md; scheduleSave(); }}
      />

      <footer className="editor-footer">
        <AiActionBar
          getContext={getAiContext}
          onApply={applyAiOutput}
          onAutoMetadata={(meta) => {
            if (meta.title) setTitle(meta.title);
            if (meta.tags) setTags(meta.tags);
            dirtyRef.current = true;
            void save();
          }}
        />
      </footer>
    </div>
  );
}
