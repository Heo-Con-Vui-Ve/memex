import { useCallback, useEffect, useState } from "react";
import type { NoteRow } from "@notepad-ai/shared";
import { is, request } from "../../lib/rpc";
import { NoteList } from "./NoteList";
import { Editor } from "./Editor";

export function NotesView() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const res = q
        ? await request({ type: "notes.search", payload: { query: q, limit: 100 } }, is.searchResult)
        : await request({ type: "notes.list", payload: { limit: 200 } }, is.listResult);
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

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      void refresh(query.trim() || undefined);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="notes-shell">
      <aside className="notes-side">
        <div className="notes-search">
          <input
            type="search"
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading && <div className="notes-empty">Loading…</div>}
        {error && <div className="notes-error">{error}</div>}
        {!loading && notes.length === 0 && (
          <div className="notes-empty">
            {query ? "No matches" : "No notes yet — capture from any page via the toolbar icon."}
          </div>
        )}
        <NoteList notes={notes} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <main className="notes-main">
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
          <div className="notes-placeholder">
            <h2>Pick a note</h2>
            <p>Or capture a new one from any page.</p>
          </div>
        )}
      </main>
    </div>
  );
}
