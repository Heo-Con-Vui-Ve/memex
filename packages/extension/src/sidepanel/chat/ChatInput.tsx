import { useRef, useState } from "react";

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
      if (ref.current) {
        ref.current.style.height = "auto";
      }
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
        placeholder={streaming ? "Streaming…" : "Message Claude (⌘↵ send)"}
        onChange={(e) => {
          setText(e.target.value);
          // auto-grow up to 8 rows
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
        <button type="button" onClick={onCancel} className="chat-cancel">Stop</button>
      ) : (
        <button type="submit" disabled={!text.trim()} className="chat-send">Send</button>
      )}
    </form>
  );
}
