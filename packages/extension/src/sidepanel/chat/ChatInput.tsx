import { useRef, useState } from "react";
import { Icon } from "../../lib/Icons";

interface Props {
  onSend: (text: string) => void;
  onCancel: () => void;
  streaming: boolean;
}

export function ChatInput({ onSend, onCancel, streaming }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setText("");
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  }

  return (
    <form
      className="chat-input"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        value={text}
        rows={1}
        placeholder={streaming ? "Streaming…" : "Message Claude  (⌘↵)"}
        onChange={(e) => {
          setText(e.target.value);
          const el = e.target;
          el.style.height = "auto";
          el.style.height = Math.min(el.scrollHeight, 200) + "px";
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={streaming}
      />
      {streaming ? (
        <button type="button" onClick={onCancel} className="chat-cancel" title="Stop">
          <Icon.Stop size={14} />
        </button>
      ) : (
        <button type="submit" disabled={!text.trim()} className="chat-send" title="Send (⌘↵)">
          <Icon.Send size={14} />
        </button>
      )}
    </form>
  );
}
