import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HOST_NAME } from "@memex/shared";

export interface NativeHostManifest {
  name: string;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
}

export type Browser = "chrome" | "edge";

/**
 * Install the Native Messaging manifest pointing at our host binary.
 * Supports Chrome + Edge on macOS, Linux, and Windows (manifest-file form only;
 * Windows users still need to import the registry pointer separately).
 */
export function installNativeHost(opts: {
  extensionId: string;
  hostExecutablePath: string;
  browsers?: Browser[];
}): { writes: Array<{ browser: Browser; manifestPath: string }>; manifest: NativeHostManifest } {
  if (!/^[a-p]{32}$/.test(opts.extensionId)) {
    throw new Error(
      `Extension ID looks wrong (expected 32 lowercase a-p chars), got: ${opts.extensionId}`,
    );
  }

  const absExe = resolve(opts.hostExecutablePath);

  const manifest: NativeHostManifest = {
    name: HOST_NAME,
    description: "Memex native messaging host (Claude CLI bridge + SQLite storage)",
    path: absExe,
    type: "stdio",
    allowed_origins: [`chrome-extension://${opts.extensionId}/`],
  };

  const browsers = opts.browsers ?? ["chrome"];
  const writes: Array<{ browser: Browser; manifestPath: string }> = [];

  for (const browser of browsers) {
    const manifestPath = manifestPathFor(browser);
    if (!manifestPath) continue;
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    writes.push({ browser, manifestPath });
  }

  if (writes.length === 0) {
    throw new Error(
      `No supported browser found for platform ${platform()}. Pass --browser chrome|edge.`,
    );
  }

  return { writes, manifest };
}

function manifestPathFor(browser: Browser): string | null {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return browser === "chrome"
        ? join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", `${HOST_NAME}.json`)
        : join(home, "Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts", `${HOST_NAME}.json`);
    case "linux":
      return browser === "chrome"
        ? join(home, ".config", "google-chrome", "NativeMessagingHosts", `${HOST_NAME}.json`)
        : join(home, ".config", "microsoft-edge", "NativeMessagingHosts", `${HOST_NAME}.json`);
    case "win32": {
      // Windows requires a registry entry pointing at the manifest path — we
      // write the manifest to disk; installCli prints the .reg command.
      const base = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
      const sub = browser === "chrome" ? "Google\\Chrome\\User Data" : "Microsoft\\Edge\\User Data";
      return join(base, sub, "NativeMessagingHosts", `${HOST_NAME}.json`);
    }
    default:
      return null;
  }
}
