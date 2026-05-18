import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * Per-user data directory for the Memex host. The SQLite DB and host.log
 * both live here. We also one-time-migrate from the legacy "notepad-ai"
 * dir if it exists and the new dir doesn't.
 */
export function getDataDir(): string {
  const home = homedir();
  const dir = ((): string => {
    switch (platform()) {
      case "darwin":
        return join(home, "Library", "Application Support", "memex");
      case "win32":
        return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "memex");
      default:
        return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "memex");
    }
  })();
  migrateLegacyDir(dir);
  return dir;
}

function legacyDir(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "notepad-ai");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "notepad-ai");
    default:
      return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "notepad-ai");
  }
}

let migrated = false;
function migrateLegacyDir(target: string): void {
  if (migrated) return;
  migrated = true;
  try {
    const legacy = legacyDir();
    const legacyDb = join(legacy, "notes.db");
    const targetDb = join(target, "notes.db");
    if (existsSync(legacyDb) && !existsSync(targetDb)) {
      mkdirSync(target, { recursive: true });
      copyFileSync(legacyDb, targetDb);
      // copy the WAL/SHM siblings too if present
      for (const sfx of ["-wal", "-shm"]) {
        const src = legacyDb + sfx;
        if (existsSync(src)) copyFileSync(src, targetDb + sfx);
      }
    }
  } catch { /* best-effort, never block startup */ }
}

export function getDbPath(): string {
  return join(getDataDir(), "notes.db");
}

/**
 * Where paste-into-note images are written. One file per image. The id used
 * in `memex-media://<id>` URLs is the filename (incl. extension), so resolving
 * is just `join(getMediaDir(), id)`.
 */
export function getMediaDir(): string {
  const dir = join(getDataDir(), "media");
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}
