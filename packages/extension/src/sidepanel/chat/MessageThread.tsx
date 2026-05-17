import { useEffect, useRef } from "react";
import type { MessageRow } from "@notepad-ai/shared";
import { Icon } from "../../lib/Icons";

interface Props {
  messages: MessageRow[];
  streamingPreview: string | null;
  empty: boolean;
}

export function MessageThread({ messages, streamingPreview, empty }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingPreview]);

  if (empty) {
    return (
      <div className="msg-thread is-empty">
        <Icon.Sparkles size={28} />
        <h3>Start a new chat</h3>
        <p>Talk to Claude directly. Conversations live in your local SQLite DB — nothing leaves your machine except what's sent to the CLI.</p>
      </div>
    );
  }

  return (
    <div className="msg-thread" ref={scrollRef}>
      {messages.map((m) => (
        <div key={m.id} className={`msg msg-${m.role}`}>
          <div className="msg-role">{m.role}</div>
          <div className="msg-body">{m.content}</div>
        </div>
      ))}
      {streamingPreview !== null && (
        <div className="msg msg-assistant is-streaming">
          <div className="msg-role">assistant</div>
          <div className="msg-body">
            {streamingPreview || <span className="msg-cursor">▌</span>}
          </div>
        </div>
      )}
    </div>
  );
}
