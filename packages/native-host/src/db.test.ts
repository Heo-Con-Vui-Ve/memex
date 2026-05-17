import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NoteRow } from "@memex/shared";
import {
  appendJobOutput,
  closeDb,
  createFolder,
  deleteFolder,
  deleteNote,
  finalizeJob,
  getNote,
  getSetting,
  listAiJobs,
  listFolders,
  listNotes,
  listTags,
  openDb,
  renameFolder,
  searchNotes,
  setSetting,
  startAiJob,
  upsertNote,
} from "./db.js";

function freshNote(overrides: Partial<NoteRow> = {}): NoteRow {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    contentMd: "",
    folderId: null,
    tags: [],
    sourceUrl: null,
    sourceTitle: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  // Each test gets a fresh in-memory DB so they don't leak through the module
  // singleton.
  closeDb();
  openDb(":memory:");
});

afterEach(() => {
  closeDb();
});

describe("notes", () => {
  it("upserts, gets, lists and deletes a note", () => {
    const a = upsertNote(freshNote({ title: "Hello", contentMd: "world" }));
    expect(getNote(a.id)?.title).toBe("Hello");

    const list = listNotes();
    expect(list).toHaveLength(1);
    expect(list[0]!.contentMd).toBe("world");

    expect(deleteNote(a.id)).toBe(true);
    expect(getNote(a.id)).toBeNull();
    expect(listNotes()).toHaveLength(0);
  });

  it("replaces tags on upsert (no leftover orphans)", () => {
    const note = upsertNote(freshNote({ tags: ["alpha", "beta"] }));
    expect(getNote(note.id)?.tags.sort()).toEqual(["alpha", "beta"]);

    upsertNote({ ...note, tags: ["gamma"] });
    expect(getNote(note.id)?.tags).toEqual(["gamma"]);
  });

  it("filters list by folderId and tag", () => {
    const f = createFolder("Work");
    upsertNote(freshNote({ title: "in folder", folderId: f.id }));
    upsertNote(freshNote({ title: "unsorted A", tags: ["t1"] }));
    upsertNote(freshNote({ title: "unsorted B" }));

    expect(listNotes(100, 0, { folderId: f.id }).map((n) => n.title)).toEqual(["in folder"]);
    expect(listNotes(100, 0, { folderId: null }).map((n) => n.title).sort()).toEqual([
      "unsorted A",
      "unsorted B",
    ]);
    expect(listNotes(100, 0, { tag: "t1" }).map((n) => n.title)).toEqual(["unsorted A"]);
  });

  it("ANDs folder and tag filters when both are set", () => {
    const work = createFolder("Work");
    const personal = createFolder("Personal");
    upsertNote(freshNote({ title: "work#urgent", folderId: work.id, tags: ["urgent"] }));
    upsertNote(freshNote({ title: "work#chill", folderId: work.id, tags: ["chill"] }));
    upsertNote(freshNote({ title: "personal#urgent", folderId: personal.id, tags: ["urgent"] }));
    upsertNote(freshNote({ title: "unsorted#urgent", tags: ["urgent"] }));

    // Work AND urgent → only the work note tagged urgent.
    expect(
      listNotes(100, 0, { folderId: work.id, tag: "urgent" }).map((n) => n.title),
    ).toEqual(["work#urgent"]);

    // Unsorted AND urgent → only the unsorted one.
    expect(
      listNotes(100, 0, { folderId: null, tag: "urgent" }).map((n) => n.title),
    ).toEqual(["unsorted#urgent"]);

    // No folder filter, tag urgent → all three urgent notes.
    expect(listNotes(100, 0, { tag: "urgent" }).map((n) => n.title).sort()).toEqual([
      "personal#urgent",
      "unsorted#urgent",
      "work#urgent",
    ]);
  });
});

describe("listTags", () => {
  it("returns distinct tags with counts, sorted by frequency then name", () => {
    upsertNote(freshNote({ tags: ["alpha", "beta"] }));
    upsertNote(freshNote({ tags: ["alpha", "gamma"] }));
    upsertNote(freshNote({ tags: ["alpha"] }));

    const got = listTags();
    expect(got).toEqual([
      { name: "alpha", noteCount: 3 },
      { name: "beta", noteCount: 1 },
      { name: "gamma", noteCount: 1 },
    ]);
  });

  it("drops tags whose only note was deleted", () => {
    const n = upsertNote(freshNote({ tags: ["lonely"] }));
    expect(listTags().some((t) => t.name === "lonely")).toBe(true);
    deleteNote(n.id);
    expect(listTags().some((t) => t.name === "lonely")).toBe(false);
  });
});

describe("search (FTS5)", () => {
  it("returns notes matching title or body, ignoring others", () => {
    upsertNote(freshNote({ title: "Quantum mechanics", contentMd: "wave function" }));
    upsertNote(freshNote({ title: "Grocery list", contentMd: "milk, eggs, bread" }));
    upsertNote(freshNote({ title: "Misc", contentMd: "nothing relevant here" }));

    const hits = searchNotes("quantum").map((n) => n.title);
    expect(hits).toEqual(["Quantum mechanics"]);

    const groceries = searchNotes("milk").map((n) => n.title);
    expect(groceries).toEqual(["Grocery list"]);
  });

  it("survives FTS operator characters in the query", () => {
    upsertNote(freshNote({ title: "Edge cases", contentMd: "users typed: foo AND bar OR baz" }));
    // Should not crash and should still find by exact phrase.
    expect(() => searchNotes('AND bar OR')).not.toThrow();
  });

  it("falls back to listNotes when query is empty", () => {
    upsertNote(freshNote({ title: "one" }));
    upsertNote(freshNote({ title: "two" }));
    expect(searchNotes("")).toHaveLength(2);
  });

  it("reflects updates and deletes via FTS triggers", () => {
    const note = upsertNote(freshNote({ title: "before", contentMd: "alpha content" }));
    expect(searchNotes("alpha")).toHaveLength(1);

    upsertNote({ ...note, contentMd: "beta content", updatedAt: Date.now() });
    expect(searchNotes("alpha")).toHaveLength(0);
    expect(searchNotes("beta")).toHaveLength(1);

    deleteNote(note.id);
    expect(searchNotes("beta")).toHaveLength(0);
  });
});

describe("folders", () => {
  it("creates, lists, renames, and deletes (with reassignToRoot)", () => {
    const a = createFolder("Inbox");
    const b = createFolder("Archive");
    expect(listFolders().map((f) => f.name).sort()).toEqual(["Archive", "Inbox"]);

    const renamed = renameFolder(a.id, "Triage");
    expect(renamed.name).toBe("Triage");

    const note = upsertNote(freshNote({ folderId: a.id }));
    // Without reassign, the FK ON DELETE CASCADE removes the notes too.
    // With reassign, notes move to root before delete.
    expect(deleteFolder(a.id, true)).toBe(true);
    expect(getNote(note.id)?.folderId).toBeNull();

    expect(listFolders().map((f) => f.name)).toEqual(["Archive"]);
    expect(deleteFolder(b.id)).toBe(true);
  });

  it("noteCount reflects assigned notes", () => {
    const f = createFolder("Projects");
    upsertNote(freshNote({ folderId: f.id }));
    upsertNote(freshNote({ folderId: f.id }));
    const got = listFolders().find((x) => x.id === f.id)!;
    expect(got.noteCount).toBe(2);
  });
});

describe("ai_jobs", () => {
  it("tracks lifecycle: start → append output → finalize", () => {
    const job = startAiJob({ mode: "summarize", promptPreview: "hello" });
    expect(job.status).toBe("running");
    expect(job.output).toBe("");

    appendJobOutput(job.id, "chunk-a ");
    appendJobOutput(job.id, "chunk-b");
    finalizeJob(job.id, "done");

    const all = listAiJobs();
    const updated = all.find((j) => j.id === job.id)!;
    expect(updated.status).toBe("done");
    expect(updated.output).toBe("chunk-a chunk-b");
  });

  it("filters by status", () => {
    const a = startAiJob({ mode: "summarize", promptPreview: "x" });
    const b = startAiJob({ mode: "organize", promptPreview: "y" });
    finalizeJob(a.id, "done");
    finalizeJob(b.id, "error", "boom");
    expect(listAiJobs(10, "done").map((j) => j.id)).toEqual([a.id]);
    expect(listAiJobs(10, "error")[0]?.errorMessage).toBe("boom");
  });

  it("truncates the prompt preview at 200 chars", () => {
    const long = "x".repeat(500);
    const j = startAiJob({ mode: "summarize", promptPreview: long });
    expect(j.promptPreview.length).toBe(200);
  });
});

describe("settings (kv)", () => {
  it("get returns null for unknown key, set+get round-trips, set overwrites", () => {
    expect(getSetting("ai.provider")).toBeNull();
    setSetting("ai.provider", "openai");
    expect(getSetting("ai.provider")).toBe("openai");
    setSetting("ai.provider", "ollama");
    expect(getSetting("ai.provider")).toBe("ollama");
  });
});
