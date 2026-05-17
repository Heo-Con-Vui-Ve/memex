import { useState, type KeyboardEvent } from "react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagsInput({ tags, onChange }: Props) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const clean = raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t && !tags.includes(t));
    if (clean.length === 0) return;
    onChange([...tags, ...clean]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="tags-input">
      {tags.map((t) => (
        <span key={t} className="tag-chip">
          {t}
          <button onClick={() => remove(t)} title="Remove" aria-label={`Remove ${t}`}>×</button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={tags.length === 0 ? "Add tags…" : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
      />
    </div>
  );
}
