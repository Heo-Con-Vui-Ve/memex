import { useEffect, useRef, useState } from "react";
import type { NoteRow } from "@notepad-ai/shared";
import { is, request } from "../../lib/rpc";
import { AiActionBar } from "./AiActionBar";
import { TagsInput } from "./TagsInput";
import { MarkdownEditor } from "./MarkdownEditor";

interface Props {
  note: NoteRow;
  onSaved: (n: NoteRow) => void;
  onDeleted: () => void;
}

const SAVE_DEBOUNCE_MS = 600;

export function Editor({ note, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.contentMd);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const debouncer = useRef<number | null>(null);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.contentMd);
    setTags(note.tags);
    dirtyRef.current = false;
  }, [note.id, note.title, note.contentMd, note.tags]);

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
      <TagsInput
        tags={tags}
        onChange={(t) => {
          setTags(t);
          scheduleSave();
        }}
      />
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
        />
        <div className="editor-status">
          {saving ? "Saving…" : "Saved"}
          <button className="danger" onClick={() => void del()}>Delete</button>
        </div>
      </footer>
    </div>
  );
}
