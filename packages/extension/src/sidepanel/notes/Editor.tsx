import { useEffect, useRef, useState } from "react";
import type { FolderRow, NoteRow } from "@notepad-ai/shared";
import { is, request } from "../../lib/rpc";
import { AiActionBar } from "./AiActionBar";
import { TagsInput } from "./TagsInput";
import { MarkdownEditor } from "./MarkdownEditor";
import { Icon } from "../../lib/Icons";

interface Props {
  note: NoteRow;
  folders: FolderRow[];
  onSaved: (n: NoteRow) => void;
  onDeleted: () => void;
}

const SAVE_DEBOUNCE_MS = 600;

export function Editor({ note, folders, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.contentMd);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [folderId, setFolderId] = useState<string | null>(note.folderId);
  const [saving, setSaving] = useState(false);
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
    } catch (err) {
      console.error("save failed", err);
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

  function finalizeAiOutput() {
    void save();
  }

  return (
    <div className="editor">
      <input
        className="editor-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave();
        }}
        placeholder="Untitled"
      />
      <div className="editor-meta">
        <select
          value={folderId ?? ""}
          onChange={(e) => {
            setFolderId(e.target.value || null);
            scheduleSave();
          }}
          className="folder-select"
        >
          <option value="">Unsorted</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <TagsInput
          tags={tags}
          onChange={(t) => {
            setTags(t);
            scheduleSave();
          }}
        />
      </div>
      <MarkdownEditor
        value={body}
        onChange={(v) => {
          setBody(v);
          scheduleSave();
        }}
      />
      <footer className="editor-footer">
        <AiActionBar
          noteBody={body}
          onChunk={appendAiOutput}
          onDone={finalizeAiOutput}
          onAutoMetadata={(meta) => {
            if (meta.title) setTitle(meta.title);
            if (meta.tags) setTags(meta.tags);
            dirtyRef.current = true;
            void save();
          }}
        />
        <div className="editor-status">
          <span>{saving ? "Saving…" : "All changes saved"}</span>
          <button className="ghost danger" onClick={() => void del()}>
            <Icon.Trash size={13} /> Delete
          </button>
        </div>
      </footer>
    </div>
  );
}
