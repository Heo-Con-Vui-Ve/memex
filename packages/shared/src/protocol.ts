/**
 * Wire protocol between the extension (background service worker) and the
 * native messaging host. All envelopes are JSON, transported over stdio with
 * a 4-byte little-endian length prefix (Chrome Native Messaging convention).
 *
 * Every request carries a `requestId` so the host can multiplex many
 * concurrent streaming jobs over a single port.
 */

export const PROTOCOL_VERSION = 1 as const;
export const HOST_NAME = "cx.jarvis.notepad_ai" as const;

export type AiMode =
  | "summarize"
  | "organize"
  | "brainstorm"
  | "improve"
  | "extract-tasks"
  | "research";

export interface InvokePayload {
  mode: AiMode;
  prompt: string;
  context?: string;
  cliArgs?: string[];
  timeoutMs?: number;
}

export interface CancelPayload {
  cancelRequestId: string;
}

// --- Notes CRUD (host owns the SQLite store) ---

export interface NoteRow {
  id: string;
  title: string;
  contentMd: string;
  folderId: string | null;
  tags: string[];
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NotesListPayload {
  limit?: number;
  offset?: number;
  /** Future: folderId/tag filters. */
}

export interface NotesGetPayload {
  id: string;
}

export interface NotesUpsertPayload {
  note: NoteRow;
}

export interface NotesDeletePayload {
  id: string;
}

export interface NotesSearchPayload {
  query: string;
  limit?: number;
}

// --- Conversations (chat) ---

export type ChatRole = "user" | "assistant" | "system";

export interface ConversationRow {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface ConversationsListPayload {
  limit?: number;
}
export interface ConversationsCreatePayload {
  title?: string;
}
export interface ConversationsRenamePayload {
  id: string;
  title: string;
}
export interface ConversationsDeletePayload {
  id: string;
}
export interface MessagesListPayload {
  conversationId: string;
}
export interface ChatInvokePayload {
  conversationId: string;
  /** Plain-text user message. Native host rebuilds the full prompt from history + this. */
  userMessage: string;
  /** Optional: notes whose contentMd should be inlined as context before the conversation. */
  attachNoteIds?: string[];
  timeoutMs?: number;
}

// --- AI jobs (persistent) ---

export interface AiJobsListPayload {
  limit?: number;
  status?: "queued" | "running" | "done" | "error" | "cancelled";
}

export type HostRequest =
  | { requestId: string; type: "claude.invoke"; payload: InvokePayload }
  | { requestId: string; type: "claude.cancel"; payload: CancelPayload }
  | { requestId: string; type: "host.ping"; payload?: undefined }
  | { requestId: string; type: "notes.list"; payload: NotesListPayload }
  | { requestId: string; type: "notes.get"; payload: NotesGetPayload }
  | { requestId: string; type: "notes.upsert"; payload: NotesUpsertPayload }
  | { requestId: string; type: "notes.delete"; payload: NotesDeletePayload }
  | { requestId: string; type: "notes.search"; payload: NotesSearchPayload }
  | { requestId: string; type: "conversations.list"; payload: ConversationsListPayload }
  | { requestId: string; type: "conversations.create"; payload: ConversationsCreatePayload }
  | { requestId: string; type: "conversations.rename"; payload: ConversationsRenamePayload }
  | { requestId: string; type: "conversations.delete"; payload: ConversationsDeletePayload }
  | { requestId: string; type: "messages.list"; payload: MessagesListPayload }
  | { requestId: string; type: "chat.invoke"; payload: ChatInvokePayload }
  | { requestId: string; type: "ai-jobs.list"; payload: AiJobsListPayload };

export type HostErrorCode =
  | "CLI_NOT_FOUND"
  | "CLI_AUTH"
  | "TIMEOUT"
  | "CANCELLED"
  | "BAD_REQUEST"
  | "INTERNAL";

export type HostResponse =
  | { requestId: string; type: "chunk"; seq: number; data: string }
  | { requestId: string; type: "done"; exitCode: number; totalMs: number }
  | {
      requestId: string;
      type: "error";
      code: HostErrorCode;
      message: string;
      details?: unknown;
    }
  | {
      requestId: string;
      type: "pong";
      hostVersion: string;
      nodeVersion: string;
      claudePath: string | null;
      claudeVersion: string | null;
      dbPath: string;
    }
  | { requestId: string; type: "notes.list.result"; notes: NoteRow[] }
  | { requestId: string; type: "notes.get.result"; note: NoteRow | null }
  | { requestId: string; type: "notes.upsert.result"; note: NoteRow }
  | { requestId: string; type: "notes.delete.result"; deleted: boolean }
  | { requestId: string; type: "notes.search.result"; notes: NoteRow[] }
  | { requestId: string; type: "conversations.list.result"; conversations: ConversationRow[] }
  | { requestId: string; type: "conversations.create.result"; conversation: ConversationRow }
  | { requestId: string; type: "conversations.rename.result"; conversation: ConversationRow }
  | { requestId: string; type: "conversations.delete.result"; deleted: boolean }
  | { requestId: string; type: "messages.list.result"; messages: MessageRow[] }
  | { requestId: string; type: "ai-jobs.list.result"; jobs: AiJobRow[] };

export interface AiJobRow {
  id: string;
  noteId: string | null;
  conversationId: string | null;
  mode: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  promptPreview: string;
  output: string;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024; // 1MB Chrome cap
export const MAX_CHUNK_BYTES = 256 * 1024; // host-side safety cap

export function isStreamingType(t: HostResponse["type"]): t is "chunk" {
  return t === "chunk";
}

export function isTerminalType(
  t: HostResponse["type"],
): t is "done" | "error" {
  return t === "done" || t === "error";
}
