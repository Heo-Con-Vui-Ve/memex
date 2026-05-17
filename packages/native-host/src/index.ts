import { createRequire } from "node:module";
import type { HostRequest, HostResponse } from "@notepad-ai/shared";
import { MessageFramer, encodeMessage } from "./framing.js";
import { runClaude, detectClaude, type RunHandle } from "./claudeRunner.js";
void appendMessage;
import { log } from "./logger.js";
import { getDbPath } from "./paths.js";
import {
  openDb,
  listNotes,
  getNote,
  upsertNote,
  deleteNote,
  searchNotes,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  listMessages,
  appendMessage,
  startAiJob,
  appendJobOutput,
  finalizeJob,
  listAiJobs,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  getSetting,
  setSetting,
} from "./db.js";
import { runChat } from "./chatRunner.js";
import type { HostErrorCode } from "@notepad-ai/shared";

const require = createRequire(import.meta.url);
const pkg: { version: string } = require("../package.json");

function write(msg: HostResponse): void {
  try {
    process.stdout.write(encodeMessage(msg));
  } catch (err) {
    log("error", "failed to write frame", { err: (err as Error).message });
  }
}

const inflight = new Map<string, RunHandle>();

async function handle(req: HostRequest): Promise<void> {
  switch (req.type) {
    case "host.ping": {
      const detected = await detectClaude();
      write({
        requestId: req.requestId,
        type: "pong",
        hostVersion: pkg.version,
        nodeVersion: process.versions.node,
        claudePath: detected.path,
        claudeVersion: detected.version,
        dbPath: getDbPath(),
      });
      return;
    }

    case "claude.invoke": {
      let seq = 0;
      const job = startAiJob({
        noteId: null,
        mode: req.payload.mode,
        promptPreview: req.payload.prompt,
      });
      const handle = runClaude(req.payload, {
        onChunk(text) {
          appendJobOutput(job.id, text);
          write({ requestId: req.requestId, type: "chunk", seq: seq++, data: text });
        },
        onDone(exitCode, totalMs) {
          inflight.delete(req.requestId);
          finalizeJob(job.id, "done");
          write({ requestId: req.requestId, type: "done", exitCode, totalMs });
        },
        onError(code, message, details) {
          inflight.delete(req.requestId);
          finalizeJob(job.id, code === "CANCELLED" ? "cancelled" : "error", message);
          write({ requestId: req.requestId, type: "error", code, message, details });
        },
      });
      inflight.set(req.requestId, handle);
      return;
    }

    case "chat.invoke": {
      let seq = 0;
      const job = startAiJob({
        conversationId: req.payload.conversationId,
        mode: "chat",
        promptPreview: req.payload.userMessage,
      });
      const handle = runChat({
        conversationId: req.payload.conversationId,
        userMessage: req.payload.userMessage,
        attachNoteIds: req.payload.attachNoteIds,
        timeoutMs: req.payload.timeoutMs,
        cb: {
          onChunk(text) {
            appendJobOutput(job.id, text);
            write({ requestId: req.requestId, type: "chunk", seq: seq++, data: text });
          },
          onDone(totalMs) {
            inflight.delete(req.requestId);
            finalizeJob(job.id, "done");
            write({ requestId: req.requestId, type: "done", exitCode: 0, totalMs });
          },
          onError(code, message) {
            inflight.delete(req.requestId);
            finalizeJob(job.id, code === "CANCELLED" ? "cancelled" : "error", message);
            write({ requestId: req.requestId, type: "error", code, message });
          },
        },
      });
      inflight.set(req.requestId, handle);
      return;
    }

    case "conversations.list": {
      try {
        const conversations = listConversations(req.payload.limit ?? 100);
        write({ requestId: req.requestId, type: "conversations.list.result", conversations });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "conversations.create": {
      try {
        const conversation = createConversation(req.payload.title);
        write({ requestId: req.requestId, type: "conversations.create.result", conversation });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "conversations.rename": {
      try {
        const conversation = renameConversation(req.payload.id, req.payload.title);
        write({ requestId: req.requestId, type: "conversations.rename.result", conversation });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "conversations.delete": {
      try {
        const deleted = deleteConversation(req.payload.id);
        write({ requestId: req.requestId, type: "conversations.delete.result", deleted });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "messages.list": {
      try {
        const messages = listMessages(req.payload.conversationId);
        write({ requestId: req.requestId, type: "messages.list.result", messages });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "ai-jobs.list": {
      try {
        const jobs = listAiJobs(req.payload.limit ?? 50, req.payload.status);
        write({ requestId: req.requestId, type: "ai-jobs.list.result", jobs });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "claude.cancel": {
      const h = inflight.get(req.payload.cancelRequestId);
      if (h) h.cancel();
      // Always ack with done (cancelled jobs emit their own error via onError above).
      write({ requestId: req.requestId, type: "done", exitCode: 0, totalMs: 0 });
      return;
    }

    case "notes.list": {
      try {
        const notes = listNotes(req.payload.limit ?? 100, req.payload.offset ?? 0, {
          folderId: req.payload.folderId,
          tag: req.payload.tag,
        });
        write({ requestId: req.requestId, type: "notes.list.result", notes });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "folders.list": {
      try {
        write({ requestId: req.requestId, type: "folders.list.result", folders: listFolders() });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "folders.create": {
      try {
        const folder = createFolder(req.payload.name, req.payload.parentId ?? null);
        write({ requestId: req.requestId, type: "folders.create.result", folder });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "folders.rename": {
      try {
        const folder = renameFolder(req.payload.id, req.payload.name);
        write({ requestId: req.requestId, type: "folders.rename.result", folder });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "folders.delete": {
      try {
        const deleted = deleteFolder(req.payload.id, req.payload.reassignToRoot ?? false);
        write({ requestId: req.requestId, type: "folders.delete.result", deleted });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "settings.get": {
      try {
        write({ requestId: req.requestId, type: "settings.get.result", value: getSetting(req.payload.key) });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "settings.set": {
      try {
        setSetting(req.payload.key, req.payload.value);
        write({ requestId: req.requestId, type: "settings.set.result", ok: true });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "notes.get": {
      try {
        const note = getNote(req.payload.id);
        write({ requestId: req.requestId, type: "notes.get.result", note });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "notes.upsert": {
      try {
        const note = upsertNote(req.payload.note);
        write({ requestId: req.requestId, type: "notes.upsert.result", note });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "notes.delete": {
      try {
        const deleted = deleteNote(req.payload.id);
        write({ requestId: req.requestId, type: "notes.delete.result", deleted });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "notes.search": {
      try {
        const notes = searchNotes(req.payload.query, req.payload.limit ?? 50);
        write({ requestId: req.requestId, type: "notes.search.result", notes });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    default: {
      const _exhaust: never = req;
      void _exhaust;
      write(errResp((req as { requestId?: string }).requestId ?? "?", "BAD_REQUEST", "Unknown request type"));
    }
  }
}

function errResp(requestId: string, code: HostErrorCode, message: string): HostResponse {
  return { requestId, type: "error", code, message };
}

function main(): void {
  // Open the DB up-front so any init errors surface immediately into host.log.
  try {
    openDb();
  } catch (err) {
    log("error", "openDb failed at startup", { err: (err as Error).message });
  }

  const framer = new MessageFramer();
  process.stdin.pipe(framer);

  framer.on("data", (req: unknown) => {
    if (!isHostRequest(req)) {
      log("warn", "invalid frame", { req });
      return;
    }
    void handle(req).catch((err) => {
      log("error", "handler threw", { err: (err as Error).message });
      write(errResp(req.requestId, "INTERNAL", (err as Error).message));
    });
  });

  framer.on("error", (err) => {
    log("error", "framing error", { err: err.message });
    process.exit(1);
  });

  // Chrome closes stdin to ask us to exit.
  process.stdin.on("end", () => process.exit(0));
}

function isHostRequest(v: unknown): v is HostRequest {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { requestId?: unknown }).requestId === "string" &&
    typeof (v as { type?: unknown }).type === "string"
  );
}

main();
