import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type {
  AiJobRow,
  ConversationRow,
  MessageRow,
  NoteRow,
  ChatRole,
} from "@notepad-ai/shared";
import { getDbPath } from "./paths.js";

let db: Database.Database | null = null;

export function openDb(path: string = getDbPath()): Database.Database {
  if (db) return db;
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content_md TEXT NOT NULL,
      folder_id TEXT,
      source_url TEXT,
      source_title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (note_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
      conversation_id TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt_preview TEXT NOT NULL,
      output TEXT NOT NULL DEFAULT '',
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      title, content_md,
      content='notes', content_rowid='rowid', tokenize='unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, content_md) VALUES (new.rowid, new.title, new.content_md);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content_md) VALUES ('delete', old.rowid, old.title, old.content_md);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content_md) VALUES ('delete', old.rowid, old.title, old.content_md);
      INSERT INTO notes_fts(rowid, title, content_md) VALUES (new.rowid, new.title, new.content_md);
    END;
  `);
  // Idempotent column-level migrations for users upgrading from earlier schemas.
  addColumnIfMissing(d, "ai_jobs", "conversation_id", "TEXT");

  d.prepare(
    "INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', '2')",
  ).run();
}

function addColumnIfMissing(
  d: Database.Database,
  table: string,
  column: string,
  decl: string,
): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

interface NoteRowDb {
  id: string;
  title: string;
  content_md: string;
  folder_id: string | null;
  source_url: string | null;
  source_title: string | null;
  created_at: number;
  updated_at: number;
}

function rowToNote(row: NoteRowDb, tags: string[]): NoteRow {
  return {
    id: row.id,
    title: row.title,
    contentMd: row.content_md,
    folderId: row.folder_id,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function tagsFor(d: Database.Database, ids: string[]): Map<string, string[]> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = d
    .prepare(`SELECT note_id, tag FROM note_tags WHERE note_id IN (${placeholders})`)
    .all(...ids) as Array<{ note_id: string; tag: string }>;
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.note_id) ?? [];
    list.push(r.tag);
    map.set(r.note_id, list);
  }
  return map;
}

export function listNotes(limit = 100, offset = 0): NoteRow[] {
  const d = openDb();
  const rows = d
    .prepare("SELECT * FROM notes ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as NoteRowDb[];
  const tags = tagsFor(d, rows.map((r) => r.id));
  return rows.map((r) => rowToNote(r, tags.get(r.id) ?? []));
}

export function getNote(id: string): NoteRow | null {
  const d = openDb();
  const row = d.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRowDb | undefined;
  if (!row) return null;
  const tags = tagsFor(d, [id]).get(id) ?? [];
  return rowToNote(row, tags);
}

export function upsertNote(note: NoteRow): NoteRow {
  const d = openDb();
  const tx = d.transaction((n: NoteRow) => {
    d.prepare(
      `INSERT INTO notes(id, title, content_md, folder_id, source_url, source_title, created_at, updated_at)
       VALUES (@id, @title, @content_md, @folder_id, @source_url, @source_title, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         content_md=excluded.content_md,
         folder_id=excluded.folder_id,
         source_url=excluded.source_url,
         source_title=excluded.source_title,
         updated_at=excluded.updated_at`,
    ).run({
      id: n.id,
      title: n.title,
      content_md: n.contentMd,
      folder_id: n.folderId,
      source_url: n.sourceUrl,
      source_title: n.sourceTitle,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    });
    d.prepare("DELETE FROM note_tags WHERE note_id = ?").run(n.id);
    if (n.tags.length > 0) {
      const stmt = d.prepare("INSERT INTO note_tags(note_id, tag) VALUES (?, ?)");
      for (const tag of n.tags) stmt.run(n.id, tag);
    }
  });
  tx(note);
  return getNote(note.id)!;
}

export function deleteNote(id: string): boolean {
  const d = openDb();
  const info = d.prepare("DELETE FROM notes WHERE id = ?").run(id);
  return info.changes > 0;
}

// ---------- Conversations + messages ----------

interface ConvRowDb {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export function listConversations(limit = 100): ConversationRow[] {
  const d = openDb();
  const rows = d
    .prepare(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c
         ORDER BY c.updated_at DESC
         LIMIT ?`,
    )
    .all(limit) as ConvRowDb[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));
}

export function getConversation(id: string): ConversationRow | null {
  const d = openDb();
  const row = d
    .prepare(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c WHERE id = ?`,
    )
    .get(id) as ConvRowDb | undefined;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
  };
}

export function createConversation(title?: string): ConversationRow {
  const d = openDb();
  const now = Date.now();
  const id = crypto.randomUUID();
  d.prepare(
    "INSERT INTO conversations(id, title, created_at, updated_at) VALUES (?,?,?,?)",
  ).run(id, title?.trim() || "New chat", now, now);
  return getConversation(id)!;
}

export function renameConversation(id: string, title: string): ConversationRow {
  const d = openDb();
  d.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
  const row = getConversation(id);
  if (!row) throw new Error("Conversation not found");
  return row;
}

export function deleteConversation(id: string): boolean {
  const d = openDb();
  const info = d.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return info.changes > 0;
}

export function listMessages(conversationId: string): MessageRow[] {
  const d = openDb();
  const rows = d
    .prepare(
      "SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(conversationId) as Array<{
      id: string;
      conversation_id: string;
      role: ChatRole;
      content: string;
      created_at: number;
    }>;
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export function appendMessage(args: {
  conversationId: string;
  role: ChatRole;
  content: string;
}): MessageRow {
  const d = openDb();
  const now = Date.now();
  const id = crypto.randomUUID();
  const tx = d.transaction(() => {
    d.prepare(
      "INSERT INTO messages(id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)",
    ).run(id, args.conversationId, args.role, args.content, now);
    d.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
      now,
      args.conversationId,
    );
  });
  tx();
  return {
    id,
    conversationId: args.conversationId,
    role: args.role,
    content: args.content,
    createdAt: now,
  };
}

// ---------- AI jobs ----------

interface AiJobRowDb {
  id: string;
  note_id: string | null;
  conversation_id: string | null;
  mode: string;
  status: AiJobRow["status"];
  prompt_preview: string;
  output: string;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

function aiJobRowToApi(r: AiJobRowDb): AiJobRow {
  return {
    id: r.id,
    noteId: r.note_id,
    conversationId: r.conversation_id,
    mode: r.mode,
    status: r.status,
    promptPreview: r.prompt_preview,
    output: r.output,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function startAiJob(args: {
  noteId?: string | null;
  conversationId?: string | null;
  mode: string;
  promptPreview: string;
}): AiJobRow {
  const d = openDb();
  const now = Date.now();
  const id = crypto.randomUUID();
  d.prepare(
    `INSERT INTO ai_jobs(id, note_id, conversation_id, mode, status, prompt_preview, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
  ).run(
    id,
    args.noteId ?? null,
    args.conversationId ?? null,
    args.mode,
    args.promptPreview.slice(0, 200),
    now,
    now,
  );
  return aiJobRowToApi(
    d.prepare("SELECT * FROM ai_jobs WHERE id = ?").get(id) as AiJobRowDb,
  );
}

export function appendJobOutput(id: string, delta: string): void {
  const d = openDb();
  d.prepare(
    "UPDATE ai_jobs SET output = output || ?, updated_at = ? WHERE id = ?",
  ).run(delta, Date.now(), id);
}

export function finalizeJob(
  id: string,
  status: AiJobRow["status"],
  errorMessage?: string,
): void {
  const d = openDb();
  d.prepare(
    "UPDATE ai_jobs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
  ).run(status, errorMessage ?? null, Date.now(), id);
}

export function listAiJobs(limit = 50, status?: AiJobRow["status"]): AiJobRow[] {
  const d = openDb();
  const rows = status
    ? (d
        .prepare(
          "SELECT * FROM ai_jobs WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
        )
        .all(status, limit) as AiJobRowDb[])
    : (d
        .prepare("SELECT * FROM ai_jobs ORDER BY updated_at DESC LIMIT ?")
        .all(limit) as AiJobRowDb[]);
  return rows.map(aiJobRowToApi);
}

// ---------- Settings (simple kv) ----------

export function getSetting(key: string): string | null {
  const d = openDb();
  const row = d.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const d = openDb();
  d.prepare(
    "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function searchNotes(query: string, limit = 50): NoteRow[] {
  const d = openDb();
  if (!query.trim()) return listNotes(limit, 0);
  // FTS5 needs sanitized input; quoting protects against operator chars.
  const ftsQuery = `"${query.replace(/"/g, '""')}"*`;
  const rows = d
    .prepare(
      `SELECT n.* FROM notes_fts
       JOIN notes n ON n.rowid = notes_fts.rowid
       WHERE notes_fts MATCH ?
       ORDER BY n.updated_at DESC
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as NoteRowDb[];
  const tags = tagsFor(d, rows.map((r) => r.id));
  return rows.map((r) => rowToNote(r, tags.get(r.id) ?? []));
}
