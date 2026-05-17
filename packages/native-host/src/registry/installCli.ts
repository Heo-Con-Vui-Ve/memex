import { installNativeHost } from "./install.js";

const [, , extensionId, hostBin] = process.argv;
if (!extensionId || !hostBin) {
  console.error("Usage: installCli <extensionId> <hostBin>");
  process.exit(2);
}

try {
  const { manifestPath, manifest } = installNativeHost({
    extensionId,
    hostExecutablePath: hostBin,
  });
  console.log(`✔ Wrote native messaging manifest:\n  ${manifestPath}`);
  console.log(`  -> host bin: ${manifest.path}`);
  console.log("\nRestart Chrome, then click the extension's options page to verify.");
} catch (err) {
  console.error("✘ Install failed:", (err as Error).message);
  process.exit(1);
}
