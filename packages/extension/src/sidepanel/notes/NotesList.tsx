import type { NoteRow } from "@notepad-ai/shared";

interface Props {
  notes: NoteRow[];
  onOpen: (id: string) => void;
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

export function NotesList({ notes, onOpen }: Props) {
  return (
    <ul className="notes-list">
      {notes.map((n) => (
        <li key={n.id} className="notes-row" onClick={() => onOpen(n.id)}>
          <div className="notes-row-top">
            <div className="notes-row-title">{n.title || "Untitled"}</div>
            <div className="notes-row-when">{formatWhen(n.updatedAt)}</div>
          </div>
          {preview(n.contentMd) && <div className="notes-row-preview">{preview(n.contentMd)}</div>}
          {(n.tags.length > 0 || n.sourceTitle) && (
            <div className="notes-row-meta">
              {n.tags.map((t) => (
                <span key={t} className="tag-chip tag-chip-sm">{t}</span>
              ))}
              {n.sourceTitle && <span className="notes-row-source" title={n.sourceUrl ?? undefined}>↗ {n.sourceTitle}</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
