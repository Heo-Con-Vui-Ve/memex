import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { encodeMessage, MessageFramer } from "./framing.js";

async function decodeAll(chunks: Buffer[]): Promise<unknown[]> {
  const framer = new MessageFramer();
  const result: unknown[] = [];
  framer.on("data", (msg) => result.push(msg));
  await new Promise<void>((resolve, reject) => {
    framer.on("end", () => resolve());
    framer.on("error", reject);
    Readable.from(chunks).pipe(framer);
  });
  return result;
}

describe("framing", () => {
  it("round-trips a single object", async () => {
    const obj = { requestId: "a", type: "host.ping" };
    const out = await decodeAll([encodeMessage(obj)]);
    expect(out).toEqual([obj]);
  });

  it("round-trips multiple back-to-back frames", async () => {
    const a = { requestId: "1", type: "host.ping" };
    const b = { requestId: "2", type: "claude.cancel", payload: { cancelRequestId: "1" } };
    const c = { requestId: "3", type: "host.ping" };
    const merged = Buffer.concat([encodeMessage(a), encodeMessage(b), encodeMessage(c)]);
    expect(await decodeAll([merged])).toEqual([a, b, c]);
  });

  it("reassembles a frame split across many small chunks", async () => {
    const obj = { requestId: "x", type: "host.ping", note: "lorem ipsum".repeat(50) };
    const frame = encodeMessage(obj);
    const chunks: Buffer[] = [];
    for (let i = 0; i < frame.length; i += 3) {
      chunks.push(frame.subarray(i, Math.min(i + 3, frame.length)));
    }
    expect(await decodeAll(chunks)).toEqual([obj]);
  });

  it("splits the 4-byte length prefix across chunks", async () => {
    const obj = { requestId: "y", type: "host.ping" };
    const frame = encodeMessage(obj);
    const chunks = [
      frame.subarray(0, 1),
      frame.subarray(1, 2),
      frame.subarray(2, 3),
      frame.subarray(3, 4),
      frame.subarray(4),
    ];
    expect(await decodeAll(chunks)).toEqual([obj]);
  });

  it("rejects an oversized declared frame length", async () => {
    const bogus = Buffer.alloc(4);
    bogus.writeUInt32LE(2 * 1024 * 1024, 0);
    await expect(decodeAll([bogus])).rejects.toThrow(/exceeds/);
  });

  it("encodeMessage refuses payloads larger than the native messaging cap", () => {
    const huge = { requestId: "z", type: "host.ping", junk: "x".repeat(2 * 1024 * 1024) };
    expect(() => encodeMessage(huge)).toThrow(/exceeds/);
  });
});
