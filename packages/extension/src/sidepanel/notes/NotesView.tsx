import { useCallback, useEffect, useState } from "react";
import type { FolderRow, NoteRow } from "@notepad-ai/shared";
import { is, request } from "../../lib/rpc";
import { NoteList } from "./NoteList";
import { Editor } from "./Editor";
import { FolderTree, type FolderFilter } from "./FolderTree";

export function NotesView() {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FolderFilter>({ kind: "all" });

  const refresh = useCallback(async (q: string, f: FolderFilter) => {
    setLoading(true);
    try {
      if (q.trim()) {
        const res = await request(
          { type: "notes.search", payload: { query: q.trim(), limit: 200 } },
          is.searchResult,
        );
        setNotes(res.notes);
      } else {
        const payload =
          f.kind === "all"
            ? { limit: 200 }
            : f.kind === "unsorted"
            ? { limit: 200, folderId: null }
            : { limit: 200, folderId: f.id };
        const res = await request({ type: "notes.list", payload }, is.listResult);
        setNotes(res.notes);
      }
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      const res = await request({ type: "folders.list", payload: {} }, is.folderList);
      setFolders(res.folders);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(query, filter), query.trim() ? 220 : 0);
    return () => clearTimeout(t);
  }, [query, filter, refresh]);

  async function createFolder() {
    const name = prompt("Folder name?")?.trim();
    if (!name) return;
    await request({ type: "folders.create", payload: { name } }, is.folderCreated);
    void refreshFolders();
  }

  async function renameFolder(id: string, name: string) {
    await request({ type: "folders.rename", payload: { id, name } }, is.folderRenamed);
    void refreshFolders();
  }

  async function deleteFolder(id: string) {
    if (!confirm("Delete folder? Notes inside will become unsorted.")) return;
    await request(
      { type: "folders.delete", payload: { id, reassignToRoot: true } },
      is.folderDeleted,
    );
    if (filter.kind === "folder" && filter.id === id) setFilter({ kind: "all" });
    void refreshFolders();
    void refresh(query, filter);
  }

  const unsortedCount = notes.filter((n) => n.folderId === null).length;
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
        <FolderTree
          folders={folders}
          totalCount={notes.length}
          unsortedCount={unsortedCount}
          active={filter}
          onSelect={setFilter}
          onCreate={() => void createFolder()}
          onRename={(id, name) => void renameFolder(id, name)}
          onDelete={(id) => void deleteFolder(id)}
        />
        {loading && <div className="notes-empty">Loading…</div>}
        {error && <div className="notes-error">{error}</div>}
        {!loading && notes.length === 0 && (
          <div className="notes-empty">
            {query ? "No matches" : "Capture from any page via the toolbar icon."}
          </div>
        )}
        <NoteList notes={notes} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <main className="notes-main">
        {selected ? (
          <Editor
            key={selected.id}
            note={selected}
            folders={folders}
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
