import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getDataDir } from "./paths.js";

const logPath = `${getDataDir()}/host.log`;
let dirReady: Promise<void> | null = null;

function ensureDir(): Promise<void> {
  dirReady ??= mkdir(dirname(logPath), { recursive: true }).then(() => undefined);
  return dirReady;
}

/**
 * Log to a file — never to stdout/stderr, because stdout is reserved for
 * Chrome native-messaging frames and stderr noise can also confuse Chrome.
 */
export async function log(level: "info" | "warn" | "error", msg: string, extra?: unknown): Promise<void> {
  try {
    await ensureDir();
    const line =
      `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}` +
      (extra ? ` ${JSON.stringify(extra)}` : "") +
      "\n";
    await appendFile(logPath, line, "utf8");
  } catch {
    // swallow — logger must never throw into the main loop
  }
}

export const logPathForDisplay = logPath;
