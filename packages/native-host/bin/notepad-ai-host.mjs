#!/usr/bin/env node
// Entry point invoked by Chrome over native messaging.
// Resolves to the compiled host on production installs, falls back to tsx for dev.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compiled = join(__dirname, "..", "dist", "index.js");

if (existsSync(compiled)) {
  await import(compiled);
} else {
  // Dev path: re-spawn ourselves through tsx so TS source runs directly.
  const tsxBin = join(__dirname, "..", "node_modules", ".bin", "tsx");
  const entry = join(__dirname, "..", "src", "index.ts");
  const child = spawn(existsSync(tsxBin) ? tsxBin : "tsx", [entry], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
