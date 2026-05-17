import type { HostErrorCode, MessageRow } from "@notepad-ai/shared";
import { runClaude, type RunHandle } from "./claudeRunner.js";
import { appendMessage, getNote, listMessages } from "./db.js";

/**
 * A "chat" turn: rebuild the conversation prompt from history + the new user
 * message, optionally inline note context, send to claude, stream back, and
 * persist both the user message (already done before this is called) and the
 * final assistant reply when streaming completes.
 */
export function runChat(args: {
  conversationId: string;
  userMessage: string;
  attachNoteIds?: string[];
  timeoutMs?: number;
  cb: {
    onChunk(text: string): void;
    onDone(totalMs: number): void;
    onError(code: HostErrorCode, message: string): void;
  };
}): RunHandle {
  let history: MessageRow[];
  try {
    history = listMessages(args.conversationId);
  } catch (err) {
    args.cb.onError("INTERNAL", `Failed to load history: ${(err as Error).message}`);
    return { cancel() {} };
  }

  // Persist the user message immediately so it shows up even if claude errors.
  let appended = false;
  try {
    appendMessage({
      conversationId: args.conversationId,
      role: "user",
      content: args.userMessage,
    });
    appended = true;
  } catch (err) {
    args.cb.onError("INTERNAL", `Failed to persist user message: ${(err as Error).message}`);
    return { cancel() {} };
  }

  // Build context block from attached notes (if any).
  const contextBlocks: string[] = [];
  if (args.attachNoteIds?.length) {
    for (const id of args.attachNoteIds) {
      const note = getNote(id);
      if (note) {
        contextBlocks.push(
          `### Note: ${note.title}\n\n${note.contentMd}`,
        );
      }
    }
  }

  const transcript = [...history, {
    id: "current",
    conversationId: args.conversationId,
    role: "user" as const,
    content: args.userMessage,
    createdAt: Date.now(),
  }]
    .map((m) => `${m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System"}: ${m.content}`)
    .join("\n\n");

  const prompt = [
    contextBlocks.length
      ? `You have access to the following notes as context:\n\n${contextBlocks.join("\n\n")}\n\n---\n`
      : "",
    "Continue this conversation. Respond as Assistant in plain markdown (no role prefix in your reply).\n\n",
    transcript,
    "\n\nAssistant:",
  ].join("");

  let buffered = "";
  let voidAppended = appended; // silence unused-var lint if we don't reach finalize
  void voidAppended;

  return runClaude(
    {
      mode: "summarize", // claudeRunner doesn't use mode for shaping; chat is just a prompt
      prompt,
      timeoutMs: args.timeoutMs,
    },
    {
      onChunk(text) {
        buffered += text;
        args.cb.onChunk(text);
      },
      onDone(_exit, totalMs) {
        if (buffered.trim()) {
          try {
            appendMessage({
              conversationId: args.conversationId,
              role: "assistant",
              content: buffered,
            });
          } catch {
            // best-effort
          }
        }
        args.cb.onDone(totalMs);
      },
      onError(code, message) {
        args.cb.onError(code, message);
      },
    },
  );
}
