import { useCallback, useEffect, useState } from "react";
import type { NoteRow } from "@notepad-ai/shared";
import { is, request } from "../lib/rpc";
import { NoteList } from "./NoteList";
import { Editor } from "./Editor";

export function App() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await request({ type: "notes.list", payload: { limit: 200 } }, is.listResult);
      setNotes(res.notes);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="sp-shell">
      <aside className="sp-sidebar">
        <header className="sp-brand">
          <span className="sp-dot" />
          notepad-ai
        </header>
        {loading && <div className="sp-empty">Loading…</div>}
        {error && <div className="sp-error">{error}</div>}
        {!loading && notes.length === 0 && (
          <div className="sp-empty">
            No notes yet. Click the toolbar icon on any page to capture.
          </div>
        )}
        <NoteList notes={notes} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <main className="sp-main">
        {selected ? (
          <Editor
            key={selected.id}
            note={selected}
            onSaved={(updated) => {
              setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
            }}
            onDeleted={() => {
              setNotes((prev) => prev.filter((n) => n.id !== selected.id));
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="sp-placeholder">
            <h2>Pick a note</h2>
            <p>Or capture a new one from any page.</p>
          </div>
        )}
      </main>
    </div>
  );
}
