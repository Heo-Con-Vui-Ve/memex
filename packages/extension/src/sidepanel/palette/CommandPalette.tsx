import { useEffect, useRef, useState } from "react";
import { Icon } from "../../lib/Icons";

export type PaletteAction =
  | "open-chat"
  | "open-notes"
  | "new-conversation"
  | "open-options";

interface Command {
  id: PaletteAction;
  label: string;
  hint: string;
  icon: keyof typeof Icon;
}

const COMMANDS: Command[] = [
  { id: "open-chat", label: "Open chat", hint: "Switch to chat tab", icon: "Chat" },
  { id: "open-notes", label: "Open notes", hint: "Switch to notes tab", icon: "Notes" },
  { id: "new-conversation", label: "New chat", hint: "Start fresh conversation", icon: "Plus" },
  { id: "open-options", label: "Open settings", hint: "Options page", icon: "Command" },
];

interface Props {
  onClose: () => void;
  onAction: (id: PaletteAction) => void;
}

export function CommandPalette({ onClose, onAction }: Props) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = COMMANDS.filter((c) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return c.label.toLowerCase().includes(needle) || c.hint.toLowerCase().includes(needle);
  });

  useEffect(() => {
    setIdx(0);
  }, [q]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[idx];
      if (pick) onAction(pick.id);
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Icon.Search size={14} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Type a command…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <ul className="palette-list">
          {filtered.map((c, i) => {
            const IconCmp = Icon[c.icon];
            return (
              <li
                key={c.id}
                className={"palette-item" + (i === idx ? " is-active" : "")}
                onMouseEnter={() => setIdx(i)}
                onClick={() => onAction(c.id)}
              >
                <IconCmp size={14} />
                <div className="palette-text">
                  <div className="palette-label">{c.label}</div>
                  <div className="palette-hint">{c.hint}</div>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="palette-empty">No matches</li>}
        </ul>
        <div className="palette-foot">
          <span><kbd>↑↓</kbd> nav</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
