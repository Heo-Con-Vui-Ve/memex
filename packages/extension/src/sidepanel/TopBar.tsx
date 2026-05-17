import { useState } from "react";
import type { FolderRow } from "@memex/shared";
import { Icon } from "../lib/Icons";
import { is, request } from "../lib/rpc";
import { useT } from "../lib/i18n";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  folders: FolderRow[];
  folderFilter: string | null | "all";
  onFolderFilter: (v: string | null | "all") => void;
  onNew: () => void;
  onCaptureSelection: () => void;
  onCaptureWholePage: () => void;
  onFoldersChanged: () => void;
}

export function TopBar(p: Props) {
  const tr = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);

  async function createFolder() {
    const name = prompt(tr.folderName)?.trim();
    if (!name) return;
    await request({ type: "folders.create", payload: { name } }, is.folderCreated);
    p.onFoldersChanged();
  }

  const currentLabel =
    p.folderFilter === "all"
      ? tr.allNotes
      : p.folderFilter === null
      ? tr.unsorted
      : p.folders.find((f) => f.id === p.folderFilter)?.name ?? "?";

  return (
    <header className="topbar">
      <div className="search-row">
        <Icon.Search size={14} className="search-icon" />
        <input
          type="search"
          placeholder={tr.searchNotes}
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
        />
      </div>

      <div className="filter-row">
        <div className="folder-pop">
          <button
            className="folder-trigger"
            onClick={() => setFolderMenuOpen((o) => !o)}
            title={tr.filterByFolder}
          >
            <Icon.Folder size={13} /> {currentLabel}
          </button>
          {folderMenuOpen && (
            <>
              <div className="pop-backdrop" onClick={() => setFolderMenuOpen(false)} />
              <div className="pop">
                <button className={"pop-item" + (p.folderFilter === "all" ? " is-active" : "")} onClick={() => { p.onFolderFilter("all"); setFolderMenuOpen(false); }}>
                  {tr.allNotes}
                </button>
                <button className={"pop-item" + (p.folderFilter === null ? " is-active" : "")} onClick={() => { p.onFolderFilter(null); setFolderMenuOpen(false); }}>
                  {tr.unsorted}
                </button>
                {p.folders.length > 0 && <div className="pop-sep" />}
                {p.folders.map((f) => (
                  <button key={f.id} className={"pop-item" + (p.folderFilter === f.id ? " is-active" : "")} onClick={() => { p.onFolderFilter(f.id); setFolderMenuOpen(false); }}>
                    <Icon.Folder size={12} />
                    {f.name}
                    <span className="pop-count">{f.noteCount}</span>
                  </button>
                ))}
                <div className="pop-sep" />
                <button className="pop-item" onClick={() => { setFolderMenuOpen(false); void createFolder(); }}>
                  <Icon.FolderPlus size={12} /> {tr.newFolder}
                </button>
              </div>
            </>
          )}
        </div>

        <button className="primary new-btn" onClick={p.onNew} title={tr.newNote}>
          <Icon.Plus size={14} /> {tr.newBtn}
        </button>

        <div className="folder-pop">
          <button className="icon-only ghost more-btn" onClick={() => setMenuOpen((o) => !o)} title={tr.more}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="pop-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="pop pop-right">
                <button className="pop-item" onClick={() => { setMenuOpen(false); p.onCaptureSelection(); }}>
                  <Icon.Inbox size={13} /> {tr.saveSelectedText}
                </button>
                <button className="pop-item" onClick={() => { setMenuOpen(false); p.onCaptureWholePage(); }}>
                  <Icon.Notes size={13} /> {tr.saveWholePage}
                </button>
                <div className="pop-sep" />
                <button className="pop-item" onClick={() => { setMenuOpen(false); chrome.runtime.openOptionsPage(); }}>
                  <Icon.Command size={13} /> {tr.settings}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
