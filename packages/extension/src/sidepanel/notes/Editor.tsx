import { useEffect, useRef, useState } from "react";
import type { FolderRow, NoteRow } from "@notepad-ai/shared";
import { is, request } from "../../lib/rpc";
import { Icon } from "../../lib/Icons";
import { AiActionBar } from "./AiActionBar";
import { TagsInput } from "./TagsInput";
import { MarkdownEditor } from "./MarkdownEditor";

interface Props {
  note: NoteRow;
  folders: FolderRow[];
  onBack: () => void;
  onSaved: (n: NoteRow) => void;
  onDeleted: () => void;
  onFoldersChanged: () => void;
}

const SAVE_DEBOUNCE_MS = 600;

export function Editor({ note, folders, onBack, onSaved, onDeleted, onFoldersChanged }: Props) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.contentMd);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [folderId, setFolderId] = useState<string | null>(note.folderId);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dirtyRef = useRef(false);
  const debouncer = useRef<number | null>(null);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.contentMd);
    setTags(note.tags);
    setFolderId(note.folderId);
    dirtyRef.current = false;
  }, [note.id, note.title, note.contentMd, note.tags, note.folderId]);

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
        title: title.trim() || "Untitled",
        contentMd: body,
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
    if (!confirm(`Delete "${note.title || "Untitled"}"?`)) return;
    await request({ type: "notes.delete", payload: { id: note.id } }, is.deleteResult);
    onDeleted();
  }

  function appendAiOutput(text: string) {
    setBody((prev) => prev + text);
    dirtyRef.current = true;
  }

  return (
    <div className="editor">
      <header className="editor-top">
        <button className="ghost icon-only" onClick={() => { void save(); onBack(); }} title="Back">
          ← <span className="sr-only">Back</span>
        </button>
        <div className="editor-status-inline">{saving ? "Saving…" : dirtyRef.current ? "Edited" : "Saved"}</div>
        <div className="folder-pop">
          <button className="ghost icon-only" onClick={() => setMenuOpen((o) => !o)} title="More">⋯</button>
          {menuOpen && (
            <>
              <div className="pop-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="pop pop-right">
                <div className="pop-section-label">Move to folder</div>
                <button className={"pop-item" + (folderId === null ? " is-active" : "")} onClick={() => { setFolderId(null); scheduleSave(); setMenuOpen(false); }}>
                  Unsorted
                </button>
                {folders.map((f) => (
                  <button key={f.id} className={"pop-item" + (folderId === f.id ? " is-active" : "")} onClick={() => { setFolderId(f.id); scheduleSave(); setMenuOpen(false); }}>
                    <Icon.Folder size={12} /> {f.name}
                  </button>
                ))}
                <div className="pop-sep" />
                <button className="pop-item danger" onClick={() => { setMenuOpen(false); void del(); }}>
                  <Icon.Trash size={13} /> Delete note
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
        placeholder="Untitled"
      />

      <TagsInput
        tags={tags}
        onChange={(t) => { setTags(t); scheduleSave(); }}
      />

      <MarkdownEditor
        value={body}
        onChange={(v) => { setBody(v); scheduleSave(); }}
      />

      <footer className="editor-footer">
        <AiActionBar
          noteBody={body}
          onChunk={appendAiOutput}
          onDone={() => void save()}
          onAutoMetadata={(meta) => {
            if (meta.title) setTitle(meta.title);
            if (meta.tags) setTags(meta.tags);
            dirtyRef.current = true;
            void save();
          }}
        />
      </footer>
      {/* onFoldersChanged unused inside the editor today but threaded for the menu's eventual "New folder" item */}
      <span style={{ display: "none" }}>{void onFoldersChanged}</span>
    </div>
  );
}
