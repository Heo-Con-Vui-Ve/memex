import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HostRequest, HostResponse } from "@memex/shared";
import { encodeMessage, MessageFramer } from "./framing.js";

/**
 * End-to-end exercise of the native host wire protocol. Spawns the host as a
 * real subprocess (via tsx), pipes Chrome-style length-prefixed frames over
 * stdio, and asserts both control RPCs and a streaming claude.invoke against a
 * stub `claude` shell script. Mirrors task T3 in the implementation plan.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST_ENTRY = resolve(__dirname, "./index.ts");
const TSX_BIN = resolve(__dirname, "..", "node_modules", ".bin", "tsx");

// Shared tmp dir for the whole file so we don't pay setup/teardown per test.
let tmpHome: string;
let stubBinDir: string;
let proc: ChildProcessWithoutNullStreams;
let frames: HostResponse[] = [];
let waiters: Array<(r: HostResponse) => boolean> = [];

function send(req: HostRequest): void {
  proc.stdin.write(encodeMessage(req));
}

/** Resolve on the next response that satisfies `match`. */
function waitFor<T extends HostResponse>(match: (r: HostResponse) => r is T, ms = 8000): Promise<T> {
  // Fast path: a matching frame already arrived.
  const existing = frames.find(match);
  if (existing) {
    frames = frames.filter((f) => f !== existing);
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for response (${ms}ms)`));
    }, ms);
    waiters.push((r) => {
      if (!match(r)) return false;
      clearTimeout(timer);
      resolve(r as T);
      return true;
    });
  });
}

beforeAll(async () => {
  tmpHome = mkdtempSync(join(tmpdir(), "memex-host-it-"));
  stubBinDir = join(tmpHome, "bin");
  mkdirSync(stubBinDir, { recursive: true });
  // Stub `claude`: prints "STREAM-A " then "STREAM-B" then exits 0, ignoring stdin.
  // We use two separate writes so the host has a chance to emit two chunk frames.
  const stub = join(stubBinDir, "claude");
  writeFileSync(
    stub,
    [
      "#!/bin/sh",
      // detectClaude() probes with `claude --version` — answer fast or the
      // ping handler waits up to 5s for execFile to time out.
      'case "$1" in --version) echo "claude 1.0.0-stub"; exit 0 ;; esac',
      "cat > /dev/null", // drain prompt
      "printf 'STREAM-A '",
      "sleep 0.05",
      "printf 'STREAM-B'",
    ].join("\n"),
    { mode: 0o755 },
  );
  try { chmodSync(stub, 0o755); } catch {}

  proc = spawn(TSX_BIN, [HOST_ENTRY], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      // Force a fresh, isolated data dir for this run.
      HOME: tmpHome,
      XDG_DATA_HOME: tmpHome,
      APPDATA: tmpHome,
      // Put our stub `claude` ahead of the real one (if any).
      PATH: `${stubBinDir}:${process.env.PATH ?? ""}`,
    },
  });

  // Surface host stderr if anything goes sideways during the test run.
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (d: string) => {
    if (process.env.MEMEX_HOST_TEST_DEBUG) process.stderr.write(`[host stderr] ${d}`);
  });

  const framer = new MessageFramer();
  proc.stdout.pipe(framer);
  framer.on("data", (msg: HostResponse) => {
    // Try in-order waiters first; if none claim it, buffer the frame.
    let claimed = false;
    waiters = waiters.filter((w) => {
      if (claimed) return true;
      if (w(msg)) { claimed = true; return false; }
      return true;
    });
    if (!claimed) frames.push(msg);
  });

  // Give tsx a beat to compile + boot before we start firing frames.
  await new Promise((r) => setTimeout(r, 250));
});

afterAll(() => {
  try { proc.stdin.end(); } catch {}
  try { proc.kill("SIGTERM"); } catch {}
  try { rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

describe("native host integration", () => {
  it("responds to host.ping with version metadata", async () => {
    send({ requestId: "p1", type: "host.ping" });
    const pong = await waitFor(
      (r): r is Extract<HostResponse, { type: "pong" }> => r.type === "pong" && r.requestId === "p1",
    );
    expect(pong.hostVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(pong.nodeVersion).toBeTruthy();
    expect(pong.dbPath).toContain(tmpHome);
    // The stub `claude` is on PATH, so detection should succeed.
    expect(pong.claudePath).toContain("claude");
  });

  it("notes.upsert → notes.list → notes.delete round trip", async () => {
    const note = {
      id: crypto.randomUUID(),
      title: "Integration test note",
      contentMd: "hello from a native message frame",
      folderId: null,
      tags: ["it"],
      sourceUrl: null,
      sourceTitle: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    send({ requestId: "u1", type: "notes.upsert", payload: { note } });
    const upserted = await waitFor(
      (r): r is Extract<HostResponse, { type: "notes.upsert.result" }> =>
        r.type === "notes.upsert.result" && r.requestId === "u1",
    );
    expect(upserted.note.id).toBe(note.id);
    expect(upserted.note.tags).toEqual(["it"]);

    send({ requestId: "l1", type: "notes.list", payload: { limit: 10 } });
    const listed = await waitFor(
      (r): r is Extract<HostResponse, { type: "notes.list.result" }> =>
        r.type === "notes.list.result" && r.requestId === "l1",
    );
    expect(listed.notes.some((n) => n.id === note.id)).toBe(true);

    send({ requestId: "d1", type: "notes.delete", payload: { id: note.id } });
    const deleted = await waitFor(
      (r): r is Extract<HostResponse, { type: "notes.delete.result" }> =>
        r.type === "notes.delete.result" && r.requestId === "d1",
    );
    expect(deleted.deleted).toBe(true);
  });

  it("settings.set / settings.get round trip", async () => {
    send({ requestId: "s1", type: "settings.set", payload: { key: "test.key", value: "value-1" } });
    await waitFor(
      (r): r is Extract<HostResponse, { type: "settings.set.result" }> =>
        r.type === "settings.set.result" && r.requestId === "s1",
    );
    send({ requestId: "g1", type: "settings.get", payload: { key: "test.key" } });
    const got = await waitFor(
      (r): r is Extract<HostResponse, { type: "settings.get.result" }> =>
        r.type === "settings.get.result" && r.requestId === "g1",
    );
    expect(got.value).toBe("value-1");
  });

  it("claude.invoke streams chunks from the stub binary then emits done", async () => {
    send({
      requestId: "c1",
      type: "claude.invoke",
      payload: { mode: "summarize", prompt: "anything", timeoutMs: 10000 },
    });

    // The stub prints "STREAM-A " then "STREAM-B" — chunking depends on how
    // stdout flushes, so just concatenate until both pieces show up.
    let saw = "";
    while (!saw.includes("STREAM-A") || !saw.includes("STREAM-B")) {
      const chunk = await waitFor(
        (r): r is Extract<HostResponse, { type: "chunk" }> =>
          r.type === "chunk" && r.requestId === "c1",
      );
      saw += chunk.data;
    }
    expect(saw).toContain("STREAM-A");
    expect(saw).toContain("STREAM-B");

    const done = await waitFor(
      (r): r is Extract<HostResponse, { type: "done" }> =>
        r.type === "done" && r.requestId === "c1",
    );
    expect(done.exitCode).toBe(0);
    expect(done.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects unknown request type with BAD_REQUEST", async () => {
    // Cast through unknown — this shape is intentionally invalid.
    send({ requestId: "x1", type: "totally.unknown" } as unknown as HostRequest);
    const err = await waitFor(
      (r): r is Extract<HostResponse, { type: "error" }> =>
        r.type === "error" && r.requestId === "x1",
    );
    expect(err.code).toBe("BAD_REQUEST");
  });
});
