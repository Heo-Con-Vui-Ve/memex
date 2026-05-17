import { useCallback, useEffect, useMemo, useState } from "react";
import type { FolderRow, NoteRow, TagRow } from "@memex/shared";
import { newNote } from "@memex/shared";
import { is, request } from "../lib/rpc";
import { Icon } from "../lib/Icons";
import { useT } from "../lib/i18n";
import { captureFromTab } from "../lib/captureFromTab";
import { NotesList } from "./notes/NotesList";
import { Editor } from "./notes/Editor";
import { TopBar } from "./TopBar";
import { MeetRecorder } from "./meet/MeetRecorder";

type View = { kind: "list" } | { kind: "editor"; noteId: string } | { kind: "meet" };

export function App() {
  const tr = useT();
  const [view, setView] = useState<View>({ kind: "list" });
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<string | null | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (query.trim()) {
        // Full-text search ignores folder/tag filters by design — searching
        // already narrows enough; layering filters on top is more confusing
        // than useful at this UI scope.
        const r = await request(
          { type: "notes.search", payload: { query: query.trim(), limit: 200 } },
          is.searchResult,
        );
        setNotes(r.notes);
      } else {
        const payload: { limit: number; folderId?: string | null; tag?: string } = { limit: 200 };
        // "all" is a UI-only sentinel meaning "no folder filter" — do NOT
        // forward it to the host, which would interpret it as a literal
        // folder id and return zero rows.
        if (folderFilter === null) payload.folderId = null;
        else if (folderFilter !== "all") payload.folderId = folderFilter;
        if (tagFilter) payload.tag = tagFilter;
        const r = await request({ type: "notes.list", payload }, is.listResult);
        setNotes(r.notes);
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, [query, folderFilter, tagFilter]);

  const refreshFolders = useCallback(async () => {
    try {
      const r = await request({ type: "folders.list", payload: {} }, is.folderList);
      setFolders(r.folders);
    } catch { /* ignore */ }
  }, []);

  const refreshTags = useCallback(async () => {
    try {
      const r = await request({ type: "tags.list", payload: {} }, is.tagList);
      setTags(r.tags);
      // If the active filter references a tag that no longer exists, clear it.
      if (tagFilter && !r.tags.some((t) => t.name === tagFilter)) setTagFilter(null);
    } catch { /* ignore */ }
  }, [tagFilter]);

  useEffect(() => { void refreshFolders(); void refreshTags(); }, [refreshFolders, refreshTags]);
  useEffect(() => {
    const t = setTimeout(() => void refresh(), query.trim() ? 220 : 0);
    return () => clearTimeout(t);
  }, [refresh, query]);

  const activeNote = useMemo(
    () => (view.kind === "editor" ? notes.find((n) => n.id === view.noteId) ?? null : null),
    [view, notes],
  );

  async function newBlank() {
    try {
      const created = newNote({ contentMd: "" });
      const r = await request(
        {
          type: "notes.upsert",
          payload: {
            note: {
              ...created,
              sourceUrl: null,
              sourceTitle: null,
              folderId: folderFilter === "all" || folderFilter === null ? null : folderFilter,
            },
          },
        },
        is.upsertResult,
      );
      await refresh();
      setView({ kind: "editor", noteId: r.note.id });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function captureSelection() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      let cap: { text: string; url: string; title: string };
      try {
        cap = await captureFromTab(tab.id, "selection");
      } catch {
        cap = { text: "", url: tab.url ?? "", title: tab.title ?? "" };
      }
      if (!cap.text.trim()) {
        setError(tr.errNoSelection);
        return;
      }
      const created = newNote({
        contentMd: cap.text,
        sourceUrl: cap.url,
        sourceTitle: cap.title,
      });
      const r = await request(
        {
          type: "notes.upsert",
          payload: {
            note: { ...created, sourceUrl: created.sourceUrl ?? null, sourceTitle: created.sourceTitle ?? null },
          },
        },
        is.upsertResult,
      );
      await refresh();
      setView({ kind: "editor", noteId: r.note.id });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteNoteById(id: string) {
    // Optimistic: drop from local state first so the row disappears
    // instantly, then resync from the host so any failure self-corrects.
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await request({ type: "notes.delete", payload: { id } }, is.deleteResult);
      // Tags may now have stale counts (or vanished entries) since we removed
      // their owner — refresh so the picker stays accurate.
      void refreshTags();
    } catch (err) {
      setError((err as Error).message);
      await refresh();
    }
  }

  async function moveNoteToFolder(id: string, folderId: string | null) {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    // Optimistic: reflect the move in local state immediately. If the current
    // filter excludes the new folder, the row disappears; if not, it stays.
    const optimistic: NoteRow = { ...target, folderId, updatedAt: Date.now() };
    setNotes((prev) => prev.map((n) => (n.id === id ? optimistic : n)));
    try {
      await request(
        { type: "notes.upsert", payload: { note: optimistic } },
        is.upsertResult,
      );
      // Folder note-count needs a refresh so the picker shows the right totals.
      void refreshFolders();
      // And if the active filter is folder-scoped, re-fetch so the list
      // reflects the new membership.
      if (folderFilter !== "all") void refresh();
    } catch (err) {
      setError((err as Error).message);
      await refresh();
    }
  }

  async function captureWholePage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      let cap: { text: string; url: string; title: string };
      try {
        cap = await captureFromTab(tab.id, "page");
      } catch {
        setError(tr.errPageUnreadable);
        return;
      }
      if (!cap.text.trim()) {
        setError(tr.errPageEmpty);
        return;
      }
      const created = newNote({
        contentMd: cap.text,
        title: cap.title || undefined,
        sourceUrl: cap.url,
        sourceTitle: cap.title,
      });
      const r = await request(
        {
          type: "notes.upsert",
          payload: {
            note: { ...created, sourceUrl: created.sourceUrl ?? null, sourceTitle: created.sourceTitle ?? null },
          },
        },
        is.upsertResult,
      );
      await refresh();
      setView({ kind: "editor", noteId: r.note.id });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="app">
      {view.kind === "list" ? (
        <>
          <TopBar
            query={query}
            onQuery={setQuery}
            folders={folders}
            folderFilter={folderFilter}
            onFolderFilter={setFolderFilter}
            tags={tags}
            tagFilter={tagFilter}
            onTagFilter={setTagFilter}
            onNew={() => void newBlank()}
            onCaptureSelection={() => void captureSelection()}
            onCaptureWholePage={() => void captureWholePage()}
            onRecordMeet={() => setView({ kind: "meet" })}
            onFoldersChanged={() => void refreshFolders()}
          />
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {loading ? (
            <div className="empty"><Icon.Loader size={20} /> <span>{tr.loading}</span></div>
          ) : notes.length === 0 ? (
            (() => {
              const filtersActive = !query && (folderFilter !== "all" || tagFilter !== null);
              if (filtersActive) {
                return (
                  <EmptyState
                    title={tr.noFilterMatches}
                    hint={tr.noFilterMatchesHint}
                    primaryLabel={tr.clearFilters}
                    onPrimary={() => { setFolderFilter("all"); setTagFilter(null); }}
                  />
                );
              }
              return (
                <EmptyState
                  title={query ? tr.noMatches : tr.emptyTitle}
                  hint={query ? tr.noMatchesHint : tr.emptyHint}
                  primaryLabel={query ? undefined : tr.newNote}
                  onPrimary={query ? undefined : () => void newBlank()}
                />
              );
            })()
          ) : (
            <NotesList
              notes={notes}
              folders={folders}
              onOpen={(id) => setView({ kind: "editor", noteId: id })}
              onDelete={(id) => void deleteNoteById(id)}
              onMoveToFolder={(id, folderId) => void moveNoteToFolder(id, folderId)}
            />
          )}
        </>
      ) : view.kind === "meet" ? (
        <MeetRecorder
          onBack={() => setView({ kind: "list" })}
          onSaved={() => { void refresh(); void refreshTags(); }}
        />
      ) : activeNote ? (
        <Editor
          key={activeNote.id}
          note={activeNote}
          folders={folders}
          onBack={() => setView({ kind: "list" })}
          onSaved={(updated) => {
            setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
            // Tags or folder membership may have shifted — re-sync pickers.
            void refreshTags();
            void refreshFolders();
          }}
          onDeleted={() => {
            setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));
            // Tag/folder counts (and possibly memberships) shift when a note
            // is gone — refresh pickers so we don't end up with a stale filter
            // pointing at a tag whose last note we just deleted.
            void refreshTags();
            void refreshFolders();
            setView({ kind: "list" });
          }}
        />
      ) : (
        // The selected note got removed under us; bounce back.
        (setView({ kind: "list" }), null)
      )}
    </div>
  );
}

function EmptyState({
  title,
  hint,
  primaryLabel,
  onPrimary,
}: {
  title: string;
  hint: string;
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  return (
    <div className="empty empty-big">
      <Icon.Notes size={28} />
      <h3>{title}</h3>
      <p>{hint}</p>
      {onPrimary && primaryLabel && (
        <button className="primary" onClick={onPrimary}>
          {primaryLabel}
        </button>
      )}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const tr = useT();
  const needsInstall =
    message.includes("native messaging host not found") || message.includes("Specified native");
  return (
    <div className="banner banner-error">
      {needsInstall ? (
        <>
          <strong>{tr.hostNotRegistered}</strong>
          <pre>{`cd /Users/trantan/Dev/Personal/memex
pnpm host:install --extension-id ${chrome.runtime.id}`}</pre>
          <span><kbd>⌘Q</kbd> {tr.hostNotRegisteredAfter}</span>
        </>
      ) : (
        <span>{message}</span>
      )}
      <button className="ghost banner-x" onClick={onDismiss} aria-label={tr.dismiss}><Icon.X size={14} /></button>
    </div>
  );
}
