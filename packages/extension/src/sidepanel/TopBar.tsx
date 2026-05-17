import { useState } from "react";
import type { FolderRow, TagRow } from "@memex/shared";
import { Icon } from "../lib/Icons";
import { is, request } from "../lib/rpc";
import { useT } from "../lib/i18n";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  folders: FolderRow[];
  folderFilter: string | null | "all";
  onFolderFilter: (v: string | null | "all") => void;
  tags: TagRow[];
  tagFilter: string | null;
  onTagFilter: (v: string | null) => void;
  onNew: () => void;
  onCaptureSelection: () => void;
  onCaptureWholePage: () => void;
  onRecordMeet: () => void;
  onFoldersChanged: () => void;
}

export function TopBar(p: Props) {
  const tr = useT();
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);

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

  const currentTagLabel = p.tagFilter ?? tr.allTags;

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

        <div className="folder-pop">
          <button
            className={"folder-trigger tag-trigger" + (p.tagFilter ? " is-active" : "")}
            onClick={() => setTagMenuOpen((o) => !o)}
            title={tr.filterByTag}
          >
            # {currentTagLabel}
          </button>
          {tagMenuOpen && (
            <>
              <div className="pop-backdrop" onClick={() => setTagMenuOpen(false)} />
              <div className="pop">
                <button className={"pop-item" + (p.tagFilter === null ? " is-active" : "")} onClick={() => { p.onTagFilter(null); setTagMenuOpen(false); }}>
                  {tr.allTags}
                </button>
                {p.tags.length > 0 && <div className="pop-sep" />}
                {p.tags.length === 0 && <div className="pop-item-empty">{tr.noTags}</div>}
                {p.tags.map((t) => (
                  <button key={t.name} className={"pop-item" + (p.tagFilter === t.name ? " is-active" : "")} onClick={() => { p.onTagFilter(t.name); setTagMenuOpen(false); }}>
                    # {t.name}
                    <span className="pop-count">{t.noteCount}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button className="primary new-btn" onClick={p.onNew} title={tr.newNote}>
          <Icon.Plus size={14} /> {tr.newBtn}
        </button>

        {/* Quick actions inline. flex-wrap on .filter-row lets them flow to
            a second line on very narrow widths instead of getting hidden. */}
        <button className="icon-only ghost" onClick={p.onCaptureSelection} title={tr.saveSelectedText} aria-label={tr.saveSelectedText}>
          <Icon.Inbox size={14} />
        </button>
        <button className="icon-only ghost" onClick={p.onCaptureWholePage} title={tr.saveWholePage} aria-label={tr.saveWholePage}>
          <Icon.Notes size={14} />
        </button>
        <button className="icon-only ghost" onClick={p.onRecordMeet} title={tr.recordMeeting} aria-label={tr.recordMeeting}>
          <Icon.Mic size={14} />
        </button>
        <button className="icon-only ghost" onClick={() => chrome.runtime.openOptionsPage()} title={tr.settings} aria-label={tr.settings}>
          <Icon.Command size={14} />
        </button>
      </div>
    </header>
  );
}
