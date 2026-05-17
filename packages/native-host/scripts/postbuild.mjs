#!/usr/bin/env node
// Make the binary entry points executable after `tsc` build.
import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = join(__dirname, "..", "bin");
for (const name of ["notepad-ai-host.mjs", "notepad-ai-install.mjs"]) {
  try {
    chmodSync(join(bin, name), 0o755);
  } catch {}
}
