import { Transform, type TransformCallback } from "node:stream";
import { MAX_NATIVE_MESSAGE_BYTES } from "@notepad-ai/shared";

const LENGTH_PREFIX_BYTES = 4;

/**
 * Encode a JSON value as a Chrome Native Messaging frame:
 * 4-byte little-endian length prefix + UTF-8 JSON payload.
 */
export function encodeMessage(value: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(value), "utf8");
  if (json.byteLength > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error(
      `Native message of ${json.byteLength} bytes exceeds Chrome's ${MAX_NATIVE_MESSAGE_BYTES}-byte limit`,
    );
  }
  const prefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
  prefix.writeUInt32LE(json.byteLength, 0);
  return Buffer.concat([prefix, json]);
}

/**
 * Streaming decoder: accepts arbitrarily-chunked Buffers from stdin and
 * emits one parsed JSON object per native-messaging frame. Robust to:
 *   - partial reads spanning the length prefix
 *   - partial reads spanning the JSON body
 *   - multiple frames packed into one chunk
 */
export class MessageFramer extends Transform {
  private buffer: Buffer = Buffer.alloc(0);
  private expectedLength: number | null = null;

  constructor() {
    super({ readableObjectMode: true });
  }

  override _transform(
    chunk: Buffer,
    _enc: BufferEncoding,
    cb: TransformCallback,
  ): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    try {
      while (this.tryEmitOne()) {
        // loop until no more complete frames
      }
      cb();
    } catch (err) {
      cb(err as Error);
    }
  }

  private tryEmitOne(): boolean {
    if (this.expectedLength === null) {
      if (this.buffer.length < LENGTH_PREFIX_BYTES) return false;
      this.expectedLength = this.buffer.readUInt32LE(0);
      this.buffer = this.buffer.subarray(LENGTH_PREFIX_BYTES);

      if (this.expectedLength === 0) {
        // Treat zero-length as end-of-stream sentinel (Chrome closes by EOF, not 0-len).
        this.expectedLength = null;
        return false;
      }
      if (this.expectedLength > MAX_NATIVE_MESSAGE_BYTES) {
        throw new Error(
          `Frame of ${this.expectedLength} bytes exceeds ${MAX_NATIVE_MESSAGE_BYTES}-byte limit`,
        );
      }
    }

    if (this.buffer.length < this.expectedLength) return false;

    const body = this.buffer.subarray(0, this.expectedLength);
    this.buffer = this.buffer.subarray(this.expectedLength);
    this.expectedLength = null;

    const parsed: unknown = JSON.parse(body.toString("utf8"));
    this.push(parsed);
    return true;
  }
}
