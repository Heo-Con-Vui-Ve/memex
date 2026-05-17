import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * Per-user data directory for the notepad-ai host. The SQLite DB and
 * host.log both live here.
 */
export function getDataDir(): string {
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

export function getDbPath(): string {
  return join(getDataDir(), "notes.db");
}
