import { useEffect, useRef, useState } from "react";
import type { FolderRow, NoteRow } from "@memex/shared";
import { is, request, stream } from "../../lib/rpc";
import { aiLanguageDirective, useT } from "../../lib/i18n";
import { Icon } from "../../lib/Icons";

interface Props {
  notes: NoteRow[];
  folders: FolderRow[];
  onClose: () => void;
  /** Called after notes are reassigned. Parent refreshes list/folder state. */
  onApplied: () => void;
}

interface Assignment {
  noteId: string;
  folderId: string;
}

type ModalState =
  | { kind: "no-folders" }
  | { kind: "no-unsorted" }
  | { kind: "running"; raw: string }
  | { kind: "ready"; assignments: Assignment[] }
  | { kind: "applying" }
  | { kind: "done"; notes: number }
  | { kind: "error"; message: string };

/**
 * Auto-organize: assign UNSORTED notes (folderId === null) into EXISTING
 * folders. Never creates folders, never touches already-classified notes —
 * keeps the human in control of folder taxonomy.
 */
export function AutoOrganizeModal({ notes, folders, onClose, onApplied }: Props) {
  const tr = useT();
  const unsorted = notes.filter((n) => n.folderId === null);
  const [state, setState] = useState<ModalState>(() => {
    if (folders.length === 0) return { kind: "no-folders" };
    if (unsorted.length === 0) return { kind: "no-unsorted" };
    return { kind: "running", raw: "" };
  });
  const cancelRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    if (state.kind === "running") runPlan();
    return () => cancelRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runPlan() {
    const folderList = folders.map((f) => `- id=${f.id} | name: ${f.name}`).join("\n");
    const noteList = unsorted
      .map((n) => `- id=${n.id} | title: ${(n.title || "Untitled").slice(0, 80)} | preview: ${stripPreview(n.contentMd)}`)
      .join("\n");

    const prompt = `${aiLanguageDirective()}

Assign each note below to the single most appropriate EXISTING folder. Do NOT create new folders. Reply with ONLY a JSON object — no prose, no markdown fences — of the shape:

{"assignments": [{"noteId": "...", "folderId": "..."}]}

Rules:
- Use only folderIds from the list provided. Do not invent.
- If a note doesn't clearly fit any folder, OMIT it (don't force a bad match).
- Every note id is from the "Notes" list below.

Existing folders:
${folderList}

Notes (only the unsorted ones — already-classified notes are not shown):
${noteList}`;

    setState({ kind: "running", raw: "" });
    let buffered = "";
    cancelRef.current = stream(
      { type: "claude.invoke", payload: { mode: "organize", prompt } },
      {
        onChunk: (text) => {
          buffered += text;
          setState({ kind: "running", raw: buffered });
        },
        onDone: () => {
          cancelRef.current = null;
          const assignments = parseAssignments(
            buffered,
            new Set(unsorted.map((n) => n.id)),
            new Set(folders.map((f) => f.id)),
          );
          if (!assignments) {
            setState({ kind: "error", message: tr.autoOrganizeParseErr });
            return;
          }
          setState({ kind: "ready", assignments });
        },
        onError: (code, message) => {
          cancelRef.current = null;
          setState({ kind: "error", message: `${code}: ${message}` });
        },
      },
    );
  }

  async function apply(assignments: Assignment[]) {
    setState({ kind: "applying" });
    let moved = 0;
    try {
      for (const a of assignments) {
        const note = unsorted.find((n) => n.id === a.noteId);
        if (!note) continue;
        await request(
          {
            type: "notes.upsert",
            payload: { note: { ...note, folderId: a.folderId, updatedAt: Date.now() } },
          },
          is.upsertResult,
        );
        moved++;
      }
      setState({ kind: "done", notes: moved });
      onApplied();
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  // Group assignments by target folder so the preview reads like
  // "Folder A → 3 notes" instead of one giant unsorted list.
  const grouped = state.kind === "ready"
    ? (() => {
        const byFolder = new Map<string, string[]>();
        for (const a of state.assignments) {
          const list = byFolder.get(a.folderId) ?? [];
          list.push(a.noteId);
          byFolder.set(a.folderId, list);
        }
        return Array.from(byFolder.entries())
          .map(([folderId, noteIds]) => ({ folder: folders.find((f) => f.id === folderId), noteIds }))
          .filter((g): g is { folder: FolderRow; noteIds: string[] } => !!g.folder);
      })()
    : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>
            <Icon.Sparkles size={14} /> {tr.autoOrganize}
          </strong>
          <button className="ghost icon-only" onClick={onClose} aria-label={tr.dismiss}>
            <Icon.X size={14} />
          </button>
        </header>

        {state.kind === "no-folders" && (
          <>
            <div className="modal-body">
              <p>{tr.autoOrganizeNoFolders}</p>
            </div>
            <footer className="modal-foot">
              <button className="primary" onClick={onClose}>OK</button>
            </footer>
          </>
        )}

        {state.kind === "no-unsorted" && (
          <>
            <div className="modal-body">
              <p>{tr.autoOrganizeNoUnsorted}</p>
            </div>
            <footer className="modal-foot">
              <button className="primary" onClick={onClose}>OK</button>
            </footer>
          </>
        )}

        {state.kind === "running" && (
          <div className="modal-body modal-loading">
            <Icon.Loader size={18} />
            <p>{tr.autoOrganizeRunning}</p>
            {state.raw && <pre className="ai-panel-body">{state.raw.slice(-600)}</pre>}
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div className="modal-body">
              <h4>{tr.autoOrganizePlanHeader}</h4>
              {state.assignments.length === 0 ? (
                <p className="muted">{tr.autoOrganizeNoFit}</p>
              ) : (
                <ul className="organize-plan">
                  {grouped.map(({ folder, noteIds }) => (
                    <li key={folder.id}>
                      <div className="organize-folder-name organize-folder-target">
                        <Icon.Folder size={12} /> {folder.name}
                        <span className="pop-count">{tr.autoOrganizeFolderCount(noteIds.length)}</span>
                      </div>
                      <ul className="organize-note-titles">
                        {noteIds.map((id) => {
                          const n = unsorted.find((nn) => nn.id === id);
                          if (!n) return null;
                          return <li key={id}>{n.title || tr.untitled}</li>;
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <footer className="modal-foot">
              <button className="ghost" onClick={onClose}>{tr.autoOrganizeCancel}</button>
              {state.assignments.length > 0 && (
                <button className="primary" onClick={() => void apply(state.assignments)}>
                  {tr.autoOrganizeAccept}
                </button>
              )}
            </footer>
          </>
        )}

        {state.kind === "applying" && (
          <div className="modal-body modal-loading">
            <Icon.Loader size={18} /> <p>{tr.autoOrganizeApplying}</p>
          </div>
        )}

        {state.kind === "done" && (
          <>
            <div className="modal-body">
              <p>{tr.autoOrganizeDoneAssign(state.notes)}</p>
            </div>
            <footer className="modal-foot">
              <button className="primary" onClick={onClose}>OK</button>
            </footer>
          </>
        )}

        {state.kind === "error" && (
          <>
            <div className="modal-body">
              <div className="ai-panel-err">{state.message}</div>
            </div>
            <footer className="modal-foot">
              <button className="ghost" onClick={onClose}>{tr.autoOrganizeCancel}</button>
              <button className="primary" onClick={runPlan}>{tr.optRecheck}</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function stripPreview(md: string): string {
  return md
    .replace(/[#*_`>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Parse the JSON the AI returned. Validate noteIds against the unsorted set
 * and folderIds against the existing folders set, so we never accidentally
 * try to upsert into a hallucinated folder.
 */
function parseAssignments(
  raw: string,
  validNoteIds: Set<string>,
  validFolderIds: Set<string>,
): Assignment[] | null {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch?.[1]?.trim() ?? raw.trim();
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
  const obj = parsed as { assignments?: Array<{ noteId?: unknown; folderId?: unknown }> };
  if (!Array.isArray(obj.assignments)) return null;
  const out: Assignment[] = [];
  for (const a of obj.assignments) {
    if (typeof a.noteId !== "string" || typeof a.folderId !== "string") continue;
    if (!validNoteIds.has(a.noteId) || !validFolderIds.has(a.folderId)) continue;
    out.push({ noteId: a.noteId, folderId: a.folderId });
  }
  return out;
}
