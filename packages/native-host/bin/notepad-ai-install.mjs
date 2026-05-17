#!/usr/bin/env node
// Cross-platform installer. Usage:
//   node bin/notepad-ai-install.mjs --extension-id <id> [--host-bin <path>] [--browsers chrome|edge|chrome,edge]
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Strip any "--" separators that pnpm/npm may inject when forwarding args
// (e.g. `pnpm host:install -- --extension-id X` ends up as
// `node ... -- --extension-id X`, which parseArgs would otherwise reject).
const rawArgs = process.argv.slice(2).filter((a) => a !== "--");

const { values } = parseArgs({
  args: rawArgs,
  options: {
    "extension-id": { type: "string" },
    "host-bin": { type: "string" },
    browsers: { type: "string", default: "chrome" },
  },
  allowPositionals: true,
  strict: true,
});

const extensionId = values["extension-id"];
if (!extensionId) {
  console.error("Missing --extension-id <id>");
  console.error("Find your ID in chrome://extensions after loading the unpacked extension.");
  process.exit(2);
}

const defaultBin = resolve(join(__dirname, "notepad-ai-host.mjs"));
const hostBin = resolve(values["host-bin"] ?? defaultBin);
if (!existsSync(hostBin)) {
  console.error(`Host binary not found at: ${hostBin}`);
  process.exit(2);
}

// Re-spawn through tsx for the TS install module (avoids forcing a build step).
const tsxBin = join(__dirname, "..", "node_modules", ".bin", "tsx");
const installerEntry = join(__dirname, "..", "src", "registry", "installCli.ts");

const { spawn } = await import("node:child_process");
const child = spawn(
  existsSync(tsxBin) ? tsxBin : "tsx",
  [installerEntry, extensionId, hostBin, values.browsers],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
