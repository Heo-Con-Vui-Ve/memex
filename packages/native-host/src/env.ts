import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * Chrome spawns native messaging hosts with a minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin` on macOS) — none of the usual
 * user/tool bin dirs. That means `claude`, `node`, `bun`, etc.
 * installed via Homebrew, ~/.local/bin, nvm, asdf, etc. won't be
 * found by `spawn` or `command -v`.
 *
 * Augment process.env.PATH once with the common locations so
 * downstream `spawn("claude", ...)` and `command -v` calls work
 * regardless of how the user installed their CLIs.
 */
export function ensureRichPath(): void {
  const home = homedir();
  const extras: string[] = [];

  if (platform() === "win32") {
    extras.push(
      join(home, "AppData", "Local", "Programs", "claude"),
      join(home, "AppData", "Roaming", "npm"),
      join(home, ".bun", "bin"),
    );
  } else {
    extras.push(
      join(home, ".local", "bin"),
      join(home, ".bun", "bin"),
      join(home, ".cargo", "bin"),
      join(home, ".volta", "bin"),
      join(home, ".npm-global", "bin"),
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
    );
  }

  const sep = platform() === "win32" ? ";" : ":";
  const current = (process.env.PATH ?? "").split(sep).filter(Boolean);
  const merged = [...current];
  for (const p of extras) {
    if (!merged.includes(p)) merged.push(p);
  }
  process.env.PATH = merged.join(sep);
}
