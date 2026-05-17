import { useState } from "react";
import type { ConversationRow } from "@notepad-ai/shared";
import { Icon } from "../../lib/Icons";

interface Props {
  items: ConversationRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ConversationList({ items, activeId, onSelect, onDelete, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  return (
    <ul className="conv-list">
      {items.map((c) => {
        const isActive = c.id === activeId;
        const isEditing = c.id === editingId;
        return (
          <li
            key={c.id}
            className={"conv-item" + (isActive ? " is-active" : "")}
            onClick={() => !isEditing && onSelect(c.id)}
          >
            {isEditing ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={() => {
                  if (draftTitle.trim()) onRename(c.id, draftTitle.trim());
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <>
                <div className="conv-title" onDoubleClick={() => {
                  setEditingId(c.id);
                  setDraftTitle(c.title);
                }}>{c.title}</div>
                <div className="conv-meta">{c.messageCount} msgs</div>
              </>
            )}
            <button
              className="conv-del"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              <Icon.Trash size={12} />
            </button>
          </li>
        );
      })}
      {items.length === 0 && <li className="conv-empty">No conversations yet</li>}
    </ul>
  );
}
