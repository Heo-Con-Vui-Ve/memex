/**
 * Wire protocol between the extension (background service worker) and the
 * native messaging host. All envelopes are JSON, transported over stdio with
 * a 4-byte little-endian length prefix (Chrome Native Messaging convention).
 *
 * Every request carries a `requestId` so the host can multiplex many
 * concurrent streaming jobs over a single port.
 */

export const PROTOCOL_VERSION = 1 as const;
export const HOST_NAME = "cx.jarvis.memex" as const;

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
  /** Filter by folder. `null` means unsorted (no folder). Undefined = no filter. */
  folderId?: string | null;
  tag?: string;
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

// --- Media (image attachments) ---

/**
 * Media items live as files on the host (`<dataDir>/media/<id>.<ext>`). The
 * extension paste flow saves them via media.save, then stores the resulting
 * id back into the note's markdown using a `memex-media://<id>` URL scheme.
 * Display: tiptap fetches the bytes via media.get and renders an inline data
 * URL. AI: the host's claudeProvider rewrites those tokens to absolute file
 * paths + adds the media dir via `--add-dir` so claude can Read them.
 */
export interface MediaSavePayload {
  /** Base64 (no `data:` prefix). */
  dataBase64: string;
  /** Lowercase extension without the dot (png/jpg/gif/webp). */
  ext: string;
}
export interface MediaGetPayload { id: string; }
export interface MediaDeletePayload { id: string; }

// --- Tags ---

export interface TagRow {
  name: string;
  noteCount: number;
}

export interface TagsListPayload {}

// --- Folders ---

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  noteCount: number;
}

export interface FoldersListPayload {}
export interface FoldersCreatePayload {
  name: string;
  parentId?: string | null;
}
export interface FoldersRenamePayload {
  id: string;
  name: string;
}
export interface FoldersDeletePayload {
  id: string;
  /**
   * How to handle notes that live inside the folder.
   * - "unsort" (default): notes survive, their folderId is set to null
   * - "delete-notes": notes inside the folder are deleted too
   */
  mode?: "unsort" | "delete-notes";
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
  | { requestId: string; type: "ai-jobs.list"; payload: AiJobsListPayload }
  | { requestId: string; type: "tags.list"; payload: TagsListPayload }
  | { requestId: string; type: "media.save"; payload: MediaSavePayload }
  | { requestId: string; type: "media.get"; payload: MediaGetPayload }
  | { requestId: string; type: "media.delete"; payload: MediaDeletePayload }
  | { requestId: string; type: "folders.list"; payload: FoldersListPayload }
  | { requestId: string; type: "folders.create"; payload: FoldersCreatePayload }
  | { requestId: string; type: "folders.rename"; payload: FoldersRenamePayload }
  | { requestId: string; type: "folders.delete"; payload: FoldersDeletePayload }
  | { requestId: string; type: "settings.get"; payload: { key: string } }
  | { requestId: string; type: "settings.set"; payload: { key: string; value: string } }
  | { requestId: string; type: "provider.test"; payload: { provider?: "claude" | "openai" | "ollama" } };

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
  | { requestId: string; type: "ai-jobs.list.result"; jobs: AiJobRow[] }
  | { requestId: string; type: "tags.list.result"; tags: TagRow[] }
  | { requestId: string; type: "media.save.result"; id: string; mimeType: string }
  | { requestId: string; type: "media.get.result"; dataBase64: string; mimeType: string }
  | { requestId: string; type: "media.delete.result"; deleted: boolean }
  | { requestId: string; type: "folders.list.result"; folders: FolderRow[] }
  | { requestId: string; type: "folders.create.result"; folder: FolderRow }
  | { requestId: string; type: "folders.rename.result"; folder: FolderRow }
  | { requestId: string; type: "folders.delete.result"; deleted: boolean }
  | { requestId: string; type: "settings.get.result"; value: string | null }
  | { requestId: string; type: "settings.set.result"; ok: true }
  | {
      requestId: string;
      type: "provider.test.result";
      provider: "claude" | "openai" | "ollama";
      ok: boolean;
      latencyMs: number;
      sample: string;
      errorMessage?: string;
    };

export interface AiJobRow {
  id: string;
  noteId: string | null;
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
