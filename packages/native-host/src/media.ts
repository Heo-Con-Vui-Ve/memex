import { readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { getMediaDir } from "./paths.js";

const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Reject anything wildly larger than what a screenshot tool should produce.
 *  6 MB raw covers retina screenshots without inviting "paste a whole movie"
 *  abuse. */
const MAX_BYTES = 6 * 1024 * 1024;

function normalizeExt(ext: string): string {
  const cleaned = (ext || "png").toLowerCase().replace(/^\./, "").slice(0, 8);
  return ALLOWED_EXT.has(cleaned) ? cleaned : "png";
}

function uuid(): string {
  return crypto.randomUUID();
}

/** Returns the id (which is `<uuid>.<ext>` and doubles as the filename) and
 *  the mime type to surface to callers. */
export function saveMedia(dataBase64: string, ext: string): { id: string; mimeType: string } {
  const buf = Buffer.from(dataBase64, "base64");
  if (buf.byteLength === 0) throw new Error("empty image");
  if (buf.byteLength > MAX_BYTES) throw new Error(`image too large (${buf.byteLength} bytes, max ${MAX_BYTES})`);
  const cleanExt = normalizeExt(ext);
  const id = `${uuid()}.${cleanExt}`;
  writeFileSync(join(getMediaDir(), id), buf);
  return { id, mimeType: MIME_BY_EXT[cleanExt] ?? "application/octet-stream" };
}

export function getMedia(id: string): { dataBase64: string; mimeType: string } {
  const safe = sanitizeId(id);
  const buf = readFileSync(join(getMediaDir(), safe));
  const ext = extname(safe).slice(1).toLowerCase();
  return { dataBase64: buf.toString("base64"), mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream" };
}

export function deleteMedia(id: string): boolean {
  const safe = sanitizeId(id);
  try {
    unlinkSync(join(getMediaDir(), safe));
    return true;
  } catch {
    return false;
  }
}

export function mediaPathIfExists(id: string): string | null {
  const safe = sanitizeId(id);
  const full = join(getMediaDir(), safe);
  try {
    statSync(full);
    return full;
  } catch {
    return null;
  }
}

/** Whitelist the id format we generate (`<uuid>.<ext>`) so callers can't
 *  trick us into reading arbitrary files via path traversal. */
function sanitizeId(id: string): string {
  if (!/^[a-f0-9-]{36}\.[a-z0-9]{2,8}$/i.test(id)) {
    throw new Error(`Invalid media id: ${id}`);
  }
  return id;
}
