import { useState } from "react";
import type { FolderRow } from "@notepad-ai/shared";

export type FolderFilter = { kind: "all" } | { kind: "unsorted" } | { kind: "folder"; id: string };

interface Props {
  folders: FolderRow[];
  totalCount: number;
  unsortedCount: number;
  active: FolderFilter;
  onSelect: (f: FolderFilter) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function FolderTree({
  folders,
  totalCount,
  unsortedCount,
  active,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const isActive = (a: FolderFilter, b: FolderFilter) =>
    a.kind === b.kind && (a.kind !== "folder" || (b.kind === "folder" && a.id === b.id));

  return (
    <div className="folder-tree">
      <div className="ft-header">
        <span>Folders</span>
        <button onClick={onCreate} title="New folder" className="ft-add">+</button>
      </div>
      <button
        className={"ft-item ft-all" + (isActive(active, { kind: "all" }) ? " is-active" : "")}
        onClick={() => onSelect({ kind: "all" })}
      >
        <span>All notes</span>
        <span className="ft-count">{totalCount}</span>
      </button>
      <button
        className={"ft-item" + (isActive(active, { kind: "unsorted" }) ? " is-active" : "")}
        onClick={() => onSelect({ kind: "unsorted" })}
      >
        <span>Unsorted</span>
        <span className="ft-count">{unsortedCount}</span>
      </button>
      {folders.map((f) => {
        const a = isActive(active, { kind: "folder", id: f.id });
        const isEditing = editingId === f.id;
        return (
          <div key={f.id} className={"ft-row" + (a ? " is-active" : "")}>
            {isEditing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft.trim()) onRename(f.id, draft.trim());
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <>
                <button
                  className="ft-item ft-folder-btn"
                  onClick={() => onSelect({ kind: "folder", id: f.id })}
                  onDoubleClick={() => {
                    setEditingId(f.id);
                    setDraft(f.name);
                  }}
                >
                  <span>📁 {f.name}</span>
                  <span className="ft-count">{f.noteCount}</span>
                </button>
                <button
                  className="ft-del"
                  title="Delete folder"
                  onClick={() => onDelete(f.id)}
                >×</button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
