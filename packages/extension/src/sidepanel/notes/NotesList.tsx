import { useState } from "react";
import type { FolderRow, NoteRow } from "@memex/shared";
import { useT } from "../../lib/i18n";
import { Icon } from "../../lib/Icons";

interface Props {
  notes: NoteRow[];
  folders: FolderRow[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move a note to a folder (null = unsorted). */
  onMoveToFolder: (id: string, folderId: string | null) => void;
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "2-digit" });
}

function preview(md: string): string {
  return md
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(1, 3)
    .join(" · ")
    .slice(0, 160);
}

export function NotesList({ notes, folders, onOpen, onDelete, onMoveToFolder }: Props) {
  const tr = useT();
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);

  return (
    <ul className="notes-list">
      {notes.map((n) => {
        const folder = n.folderId ? folders.find((f) => f.id === n.folderId) : null;
        const hasMeta = n.tags.length > 0 || n.sourceTitle || folder;
        return (
          <li key={n.id} className="notes-row" onClick={() => onOpen(n.id)}>
            <div className="notes-row-top">
              <div className="notes-row-title">{n.title || tr.untitled}</div>
              <div className="notes-row-when">{formatWhen(n.updatedAt)}</div>
            </div>
            {preview(n.contentMd) && <div className="notes-row-preview">{preview(n.contentMd)}</div>}
            {hasMeta && (
              <div className="notes-row-meta">
                {folder && (
                  <span className="notes-row-folder">
                    <Icon.Folder size={10} /> {folder.name}
                  </span>
                )}
                {n.tags.map((t) => (
                  <span key={t} className="tag-chip tag-chip-sm">{t}</span>
                ))}
                {n.sourceTitle && <span className="notes-row-source" title={n.sourceUrl ?? undefined}>↗ {n.sourceTitle}</span>}
              </div>
            )}

            <div className="notes-row-actions" onClick={(e) => e.stopPropagation()}>
              <div className="folder-pop">
                <button
                  className="notes-row-iconbtn ghost"
                  title={tr.moveToFolder}
                  aria-label={tr.moveToFolder}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderMenuFor(folderMenuFor === n.id ? null : n.id);
                  }}
                >
                  <Icon.Folder size={13} />
                </button>
                {folderMenuFor === n.id && (
                  <>
                    <div className="pop-backdrop" onClick={() => setFolderMenuFor(null)} />
                    <div className="pop pop-right">
                      <div className="pop-section-label">{tr.moveToFolder}</div>
                      <button
                        className={"pop-item" + (n.folderId === null ? " is-active" : "")}
                        onClick={() => {
                          onMoveToFolder(n.id, null);
                          setFolderMenuFor(null);
                        }}
                      >
                        {tr.unsorted}
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          className={"pop-item" + (n.folderId === f.id ? " is-active" : "")}
                          onClick={() => {
                            onMoveToFolder(n.id, f.id);
                            setFolderMenuFor(null);
                          }}
                        >
                          <Icon.Folder size={12} /> {f.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                className="notes-row-iconbtn ghost notes-row-delete"
                title={tr.deleteNote}
                aria-label={tr.deleteNote}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(tr.confirmDelete(n.title || tr.untitled))) onDelete(n.id);
                }}
              >
                <Icon.Trash size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
