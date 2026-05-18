import { createRequire } from "node:module";
import type { HostRequest, HostResponse } from "@memex/shared";
import { MessageFramer, encodeMessage } from "./framing.js";
import { runClaude, detectClaude, type RunHandle } from "./claudeRunner.js";
import { log } from "./logger.js";
import { ensureRichPath } from "./env.js";
import { getDbPath } from "./paths.js";
import {
  openDb,
  listNotes,
  getNote,
  upsertNote,
  deleteNote,
  searchNotes,
  startAiJob,
  appendJobOutput,
  finalizeJob,
  listAiJobs,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  listTags,
  getSetting,
  setSetting,
} from "./db.js";
import { getActiveProvider, getProviderByName, type ProviderName } from "./providers/index.js";
import { deleteMedia, getMedia, saveMedia } from "./media.js";
import type { HostErrorCode } from "@memex/shared";

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

    case "tags.list": {
      try {
        write({ requestId: req.requestId, type: "tags.list.result", tags: listTags() });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "media.save": {
      try {
        const { id, mimeType } = saveMedia(req.payload.dataBase64, req.payload.ext);
        write({ requestId: req.requestId, type: "media.save.result", id, mimeType });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "media.get": {
      try {
        const { dataBase64, mimeType } = getMedia(req.payload.id);
        write({ requestId: req.requestId, type: "media.get.result", dataBase64, mimeType });
      } catch (err) {
        write(errResp(req.requestId, "INTERNAL", (err as Error).message));
      }
      return;
    }

    case "media.delete": {
      try {
        write({ requestId: req.requestId, type: "media.delete.result", deleted: deleteMedia(req.payload.id) });
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
        const deleted = deleteFolder(req.payload.id, req.payload.mode ?? "unsort");
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

    case "provider.test": {
      // If a provider is specified, test that one explicitly; otherwise use whichever
      // the user has configured as active. openDb() is idempotent and ensures the
      // settings table exists before we read it.
      openDb();
      const provider = req.payload.provider
        ? getProviderByName(req.payload.provider as ProviderName)
        : getActiveProvider();
      const start = Date.now();
      let collected = "";
      let settled = false;
      const ctrl = new AbortController();
      // 15s ceiling on the test so we don't hang the Settings UI.
      const timer = setTimeout(() => { if (!settled) ctrl.abort(); }, 15000);
      provider.stream(
        "Reply with exactly the word: OK",
        ctrl.signal,
        {
          onChunk: (text) => {
            collected += text;
            // Once we have a few characters we have enough proof.
            if (collected.length > 8) ctrl.abort();
          },
          onDone: () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            write({
              requestId: req.requestId,
              type: "provider.test.result",
              provider: provider.name,
              ok: true,
              latencyMs: Date.now() - start,
              sample: collected.trim().slice(0, 200),
            });
          },
          onError: (_code, message) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // If we already got some output, consider it a success — the
            // abort we issued to short-circuit will look like a CANCELLED.
            if (collected.length > 0) {
              write({
                requestId: req.requestId,
                type: "provider.test.result",
                provider: provider.name,
                ok: true,
                latencyMs: Date.now() - start,
                sample: collected.trim().slice(0, 200),
              });
            } else {
              write({
                requestId: req.requestId,
                type: "provider.test.result",
                provider: provider.name,
                ok: false,
                latencyMs: Date.now() - start,
                sample: "",
                errorMessage: message,
              });
            }
          },
        },
      );
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
  // Chrome strips PATH down to /usr/bin:/bin:/usr/sbin:/sbin — restore the
  // usual user/tool dirs so spawn("claude") etc. work.
  ensureRichPath();

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
