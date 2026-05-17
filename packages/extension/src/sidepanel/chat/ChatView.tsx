import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationRow, MessageRow } from "@notepad-ai/shared";
import { is, request, stream } from "../../lib/rpc";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { ChatInput } from "./ChatInput";
import { Icon } from "../../lib/Icons";

export function ChatView() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [pending, setPending] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<{ cancel: () => void } | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await request(
        { type: "conversations.list", payload: { limit: 100 } },
        is.convList,
      );
      setConversations(res.conversations);
      if (!activeId && res.conversations.length > 0) {
        setActiveId(res.conversations[0]!.id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [activeId]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await request(
        { type: "messages.list", payload: { conversationId: convId } },
        is.msgList,
      );
      setMessages(res.messages);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  async function newConversation() {
    const res = await request(
      { type: "conversations.create", payload: { title: "New chat" } },
      is.convCreated,
    );
    setConversations((prev) => [res.conversation, ...prev]);
    setActiveId(res.conversation.id);
    setMessages([]);
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await request({ type: "conversations.delete", payload: { id } }, is.convDeleted);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function renameConversation(id: string, title: string) {
    const res = await request(
      { type: "conversations.rename", payload: { id, title } },
      is.convRenamed,
    );
    setConversations((prev) => prev.map((c) => (c.id === id ? res.conversation : c)));
  }

  function send(text: string) {
    if (!text.trim() || streaming) return;
    setError(null);

    // Ensure we have a conversation.
    const sendInto = async (convId: string) => {
      // Optimistically add the user message and a placeholder assistant message.
      const now = Date.now();
      const optimisticUser: MessageRow = {
        id: `tmp-u-${now}`,
        conversationId: convId,
        role: "user",
        content: text,
        createdAt: now,
      };
      setMessages((prev) => [...prev, optimisticUser]);
      setPending("");
      setStreaming(true);

      cancelRef.current = stream(
        { type: "chat.invoke", payload: { conversationId: convId, userMessage: text } },
        {
          onChunk(chunk) {
            setPending((p) => p + chunk);
          },
          onDone() {
            setStreaming(false);
            cancelRef.current = null;
            // Reload from DB so we have the canonical messages with real ids.
            void loadMessages(convId);
            void refreshConversations();
            setPending("");
          },
          onError(code, msg) {
            setStreaming(false);
            cancelRef.current = null;
            setError(`${code}: ${msg}`);
            setPending("");
            void loadMessages(convId);
          },
        },
      );
    };

    (async () => {
      if (activeId) {
        await sendInto(activeId);
      } else {
        const res = await request(
          { type: "conversations.create", payload: { title: text.slice(0, 50) } },
          is.convCreated,
        );
        setConversations((prev) => [res.conversation, ...prev]);
        setActiveId(res.conversation.id);
        await sendInto(res.conversation.id);
      }
    })();
  }

  function cancel() {
    cancelRef.current?.cancel();
  }

  return (
    <div className="chat-shell">
      <aside className="chat-side">
        <button className="chat-new" onClick={() => void newConversation()}>
          <Icon.Plus size={14} /> New chat
        </button>
        <ConversationList
          items={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onDelete={(id) => void deleteConversation(id)}
          onRename={(id, t) => void renameConversation(id, t)}
        />
      </aside>
      <main className="chat-main">
        {error && <div className="chat-error">{error}</div>}
        <MessageThread
          messages={messages}
          streamingPreview={streaming ? pending : null}
          empty={!streaming && messages.length === 0}
        />
        <ChatInput onSend={send} onCancel={cancel} streaming={streaming} />
      </main>
    </div>
  );
}
