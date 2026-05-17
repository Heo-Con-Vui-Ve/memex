import { useCallback, useEffect, useMemo, useState } from "react";
import type { FolderRow, NoteRow } from "@memex/shared";
import { newNote } from "@memex/shared";
import { is, request } from "../lib/rpc";
import { Icon } from "../lib/Icons";
import { NotesList } from "./notes/NotesList";
import { Editor } from "./notes/Editor";
import { TopBar } from "./TopBar";

type View = { kind: "list" } | { kind: "editor"; noteId: string };

export function App() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<string | null | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (query.trim()) {
        const r = await request(
          { type: "notes.search", payload: { query: query.trim(), limit: 200 } },
          is.searchResult,
        );
        setNotes(r.notes);
      } else {
        const payload =
          folderFilter === "all"
            ? { limit: 200 }
            : folderFilter === null
            ? { limit: 200, folderId: null }
            : { limit: 200, folderId: folderFilter };
        const r = await request({ type: "notes.list", payload }, is.listResult);
        setNotes(r.notes);
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, [query, folderFilter]);

  const refreshFolders = useCallback(async () => {
    try {
      const r = await request({ type: "folders.list", payload: {} }, is.folderList);
      setFolders(r.folders);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void refreshFolders(); }, [refreshFolders]);
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    let cap: { text: string; url: string; title: string };
    try {
      cap = (await chrome.tabs.sendMessage(tab.id, { type: "capture-selection" })) as typeof cap;
    } catch {
      cap = { text: "", url: tab.url ?? "", title: tab.title ?? "" };
    }
    if (!cap.text.trim()) {
      setError("No text selected on the current page.");
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
  }

  async function captureWholePage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    let cap: { text: string; url: string; title: string };
    try {
      cap = (await chrome.tabs.sendMessage(tab.id, { type: "capture-page" })) as typeof cap;
    } catch {
      setError("Couldn't read this page (try refreshing it).");
      return;
    }
    if (!cap.text.trim()) {
      setError("Page has no readable text.");
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
            onNew={() => void newBlank()}
            onCaptureSelection={() => void captureSelection()}
            onCaptureWholePage={() => void captureWholePage()}
            onFoldersChanged={() => void refreshFolders()}
          />
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {loading ? (
            <div className="empty"><Icon.Loader size={20} /> <span>Loading…</span></div>
          ) : notes.length === 0 ? (
            <EmptyState
              title={query ? "No matches" : "Your second brain is empty"}
              hint={query ? "Try a different query." : "Capture from a webpage or create a blank note."}
              onCreate={query ? undefined : () => void newBlank()}
            />
          ) : (
            <NotesList notes={notes} onOpen={(id) => setView({ kind: "editor", noteId: id })} />
          )}
        </>
      ) : activeNote ? (
        <Editor
          key={activeNote.id}
          note={activeNote}
          folders={folders}
          onBack={() => setView({ kind: "list" })}
          onSaved={(updated) => setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))}
          onDeleted={() => {
            setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));
            setView({ kind: "list" });
          }}
          onFoldersChanged={() => void refreshFolders()}
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
  onCreate,
}: {
  title: string;
  hint: string;
  onCreate?: () => void;
}) {
  return (
    <div className="empty empty-big">
      <Icon.Notes size={28} />
      <h3>{title}</h3>
      <p>{hint}</p>
      {onCreate && (
        <button className="primary" onClick={onCreate}>
          <Icon.Plus size={14} /> New note
        </button>
      )}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const needsInstall =
    message.includes("native messaging host not found") || message.includes("Specified native");
  return (
    <div className="banner banner-error">
      {needsInstall ? (
        <>
          <strong>Native host chưa register.</strong>
          <pre>{`cd /Users/trantan/Dev/Personal/notepad-ai
pnpm host:install --extension-id ${chrome.runtime.id}`}</pre>
          <span>Sau đó <kbd>⌘Q</kbd> quit Chrome và mở lại.</span>
        </>
      ) : (
        <span>{message}</span>
      )}
      <button className="ghost banner-x" onClick={onDismiss} aria-label="Dismiss"><Icon.X size={14} /></button>
    </div>
  );
}
