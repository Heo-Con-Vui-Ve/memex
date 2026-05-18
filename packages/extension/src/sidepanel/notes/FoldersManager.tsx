import { useState } from "react";
import type { FolderRow } from "@memex/shared";
import { is, request } from "../../lib/rpc";
import { useT } from "../../lib/i18n";
import { Icon } from "../../lib/Icons";

interface Props {
  folders: FolderRow[];
  onBack: () => void;
  /** Called after any folder mutation so the parent re-fetches folders + notes. */
  onChanged: () => void;
  /** Folder id currently used as a list filter; if we delete it, parent should fall back. */
  activeFilterId: string | null | "all";
  onFilterReset: () => void;
}

type RowMode = "view" | "edit" | "confirm-delete";

export function FoldersManager({ folders, onBack, onChanged, activeFilterId, onFilterReset }: Props) {
  const tr = useT();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  // Per-row local UI state, keyed by folder id. Only one row can be "edit"
  // or "confirm-delete" at a time — switching rows clears the previous.
  const [openRow, setOpenRow] = useState<{ id: string; mode: RowMode } | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      await request({ type: "folders.create", payload: { name } }, is.folderCreated);
      setNewName("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function rename(id: string) {
    const name = editName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await request({ type: "folders.rename", payload: { id, name } }, is.folderRenamed);
      setOpenRow(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(folder: FolderRow, mode: "unsort" | "delete-notes") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await request(
        { type: "folders.delete", payload: { id: folder.id, mode } },
        is.folderDeleted,
      );
      if (activeFilterId === folder.id) onFilterReset();
      setOpenRow(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="folders-page">
      <header className="folders-header">
        <button className="ghost" onClick={onBack} title={tr.back} aria-label={tr.back}>
          <Icon.X size={16} />
        </button>
        <h2>{tr.foldersPageTitle}</h2>
      </header>

      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button className="ghost banner-x" onClick={() => setError(null)} aria-label={tr.dismiss}>
            <Icon.X size={14} />
          </button>
        </div>
      )}

      <form
        className="folders-create-row"
        onSubmit={(e) => { e.preventDefault(); void create(); }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={tr.foldersCreatePlaceholder}
          maxLength={80}
        />
        <button type="submit" className="primary" disabled={!newName.trim() || creating}>
          <Icon.Plus size={14} /> {tr.newBtn}
        </button>
      </form>

      {folders.length === 0 ? (
        <div className="empty empty-big">
          <Icon.Folder size={28} />
          <h3>{tr.foldersEmpty}</h3>
          <p>{tr.foldersEmptyHint}</p>
        </div>
      ) : (
        <ul className="folders-mgmt-list">
          {folders.map((f) => {
            const row = openRow?.id === f.id ? openRow : null;
            return (
              <li key={f.id} className="folder-mgmt-row">
                {row?.mode === "edit" ? (
                  <form
                    className="folder-mgmt-edit"
                    onSubmit={(e) => { e.preventDefault(); void rename(f.id); }}
                  >
                    <Icon.Folder size={14} />
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setOpenRow(null); }}
                      maxLength={80}
                    />
                    <button type="submit" className="primary" disabled={!editName.trim() || busy}>
                      {tr.save}
                    </button>
                    <button type="button" className="ghost" onClick={() => setOpenRow(null)}>
                      {tr.cancel}
                    </button>
                  </form>
                ) : (
                  <div className="folder-mgmt-main">
                    <Icon.Folder size={14} />
                    <span className="folder-mgmt-name">{f.name}</span>
                    <span className="folder-mgmt-count">{tr.foldersNoteCount(f.noteCount)}</span>
                    <button
                      className="ghost icon-only"
                      title={tr.renameFolder}
                      aria-label={tr.renameFolder}
                      onClick={() => { setEditName(f.name); setOpenRow({ id: f.id, mode: "edit" }); }}
                    >
                      <Icon.Edit size={13} />
                    </button>
                    <button
                      className="ghost icon-only folder-mgmt-trash"
                      title={tr.deleteFolder}
                      aria-label={tr.deleteFolder}
                      onClick={() => setOpenRow({ id: f.id, mode: "confirm-delete" })}
                    >
                      <Icon.Trash size={13} />
                    </button>
                  </div>
                )}

                {row?.mode === "confirm-delete" && (
                  <div className="folder-mgmt-confirm">
                    <p>{tr.deleteFolderConfirm(f.name, f.noteCount)}</p>
                    <div className="folder-mgmt-confirm-actions">
                      {f.noteCount > 0 && (
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => void remove(f, "delete-notes")}
                        >
                          <Icon.Trash size={12} /> {tr.deleteFolderAndNotes}
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => void remove(f, "unsort")}
                      >
                        <Icon.Folder size={12} /> {tr.deleteFolderKeepNotes}
                      </button>
                      <button className="ghost" onClick={() => setOpenRow(null)}>
                        {tr.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
