import type { AiMode } from "./protocol.js";

export interface Note {
  id: string;
  title: string;
  contentMd: string;
  /** Phase 2 — folder support deferred. Always null for now. */
  folderId: string | null;
  tags: string[];
  sourceUrl?: string;
  sourceTitle?: string;
  createdAt: number;
  updatedAt: number;
  /** Schema version for forward-compat. */
  version: 1;
}

export type AiJobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface AiJob {
  id: string;
  noteId: string | null;
  mode: AiMode;
  status: AiJobStatus;
  promptPreview: string;
  /** Accumulated streamed output. */
  output: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export function newNote(input: Partial<Note> & { contentMd: string }): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: input.title ?? deriveTitle(input.contentMd),
    contentMd: input.contentMd,
    folderId: null,
    tags: input.tags ?? [],
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

function deriveTitle(md: string): string {
  const firstLine = md.split("\n").find((l) => l.trim().length > 0) ?? "Untitled";
  const stripped = firstLine.replace(/^#+\s*/, "").trim();
  return stripped.length > 80 ? stripped.slice(0, 80) + "…" : stripped || "Untitled";
}
