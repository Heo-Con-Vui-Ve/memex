import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HOST_NAME } from "@notepad-ai/shared";

/**
 * Install the Chrome Native Messaging manifest pointing at our host binary.
 * MVP scope: Chrome on macOS. Linux + Edge + Windows: stubbed with clear errors.
 */
export interface NativeHostManifest {
  name: string;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
}

export function installNativeHost(opts: {
  extensionId: string;
  hostExecutablePath: string;
}): { manifestPath: string; manifest: NativeHostManifest } {
  if (!/^[a-p]{32}$/.test(opts.extensionId)) {
    throw new Error(
      `Extension ID looks wrong (expected 32 lowercase a-p chars), got: ${opts.extensionId}`,
    );
  }

  const absExe = resolve(opts.hostExecutablePath);

  const manifest = {
    name: HOST_NAME,
    description: "notepad-ai native messaging host (Claude CLI bridge + SQLite storage)",
    path: absExe,
    type: "stdio" as const,
    allowed_origins: [`chrome-extension://${opts.extensionId}/`],
  };

  const manifestPath = chromeManifestPath();
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { manifestPath, manifest };
}

function chromeManifestPath(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(
        home,
        "Library",
        "Application Support",
        "Google",
        "Chrome",
        "NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
    case "linux":
      return join(home, ".config", "google-chrome", "NativeMessagingHosts", `${HOST_NAME}.json`);
    case "win32":
      throw new Error(
        "Windows install is deferred to Phase 2 — manually write a .reg pointing HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts to your host manifest.",
      );
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
}
