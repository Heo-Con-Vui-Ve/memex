import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { NoteRow } from "@notepad-ai/shared";
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
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt_preview TEXT NOT NULL,
      output TEXT NOT NULL DEFAULT '',
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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
  d.prepare(
    "INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', '1')",
  ).run();
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
