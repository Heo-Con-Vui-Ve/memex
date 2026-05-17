import { platform } from "node:os";
import { installNativeHost, type Browser } from "./install.js";
import { HOST_NAME } from "@memex/shared";

// Args: <extensionId> <hostBin> [browsers comma-separated, default "chrome"]
const [, , extensionId, hostBin, browsersArg = "chrome"] = process.argv;
if (!extensionId || !hostBin) {
  console.error("Usage: installCli <extensionId> <hostBin> [chrome|edge|chrome,edge]");
  process.exit(2);
}

const browsers = browsersArg
  .split(",")
  .map((b) => b.trim().toLowerCase())
  .filter((b): b is Browser => b === "chrome" || b === "edge");

if (browsers.length === 0) {
  console.error("No valid browsers given. Use: chrome, edge, or chrome,edge");
  process.exit(2);
}

try {
  const { writes, manifest } = installNativeHost({
    extensionId,
    hostExecutablePath: hostBin,
    browsers,
  });

  for (const w of writes) {
    console.log(`✔ ${w.browser}: ${w.manifestPath}`);
  }
  console.log(`  → host bin: ${manifest.path}`);

  if (platform() === "win32") {
    console.log("\nOn Windows you also need a registry entry. Run in PowerShell as your user:");
    for (const w of writes) {
      const root = w.browser === "chrome"
        ? "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts"
        : "HKCU:\\Software\\Microsoft\\Edge\\NativeMessagingHosts";
      console.log(`  New-Item -Path "${root}\\${HOST_NAME}" -Force | Out-Null`);
      console.log(`  Set-ItemProperty -Path "${root}\\${HOST_NAME}" -Name "(default)" -Value "${w.manifestPath}"`);
    }
  }

  console.log("\nRestart the browser, then open the extension's options page to verify.");
} catch (err) {
  console.error("✘ Install failed:", (err as Error).message);
  process.exit(1);
}
