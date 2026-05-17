import type { NoteRow } from "@notepad-ai/shared";

interface Props {
  notes: NoteRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function NoteList({ notes, selectedId, onSelect }: Props) {
  return (
    <ul className="note-list">
      {notes.map((n) => (
        <li
          key={n.id}
          className={"note-item" + (n.id === selectedId ? " is-selected" : "")}
          onClick={() => onSelect(n.id)}
        >
          <div className="note-title">{n.title || "Untitled"}</div>
          <div className="note-meta">
            <span>{formatWhen(n.updatedAt)}</span>
            {n.tags.length > 0 && <span>· {n.tags.join(", ")}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
