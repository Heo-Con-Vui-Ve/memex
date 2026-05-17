# notepad-ai

An AI-powered second-brain Chrome extension backed by your locally-installed `claude` CLI.

> **Status**: Phase 1 MVP scaffold (vertical slice). See `.claude/plans/notepad-ai-architecture-2026-05-17.md` for the full plan.

## Architecture

Three pnpm workspace packages:

- `@notepad-ai/shared` — wire protocol + domain types shared by both ends
- `@notepad-ai/host` — Node.js Chrome Native Messaging host that spawns the `claude` CLI and streams output back
- `@notepad-ai/extension` — React + Vite + Manifest V3 Chrome extension (popup capture, side panel editor, options health check)

## Prerequisites

- Node.js 20+
- pnpm 9+
- `claude` CLI installed and authenticated on `PATH`
- Google Chrome (Edge support: Phase 2)

## Quickstart

```bash
pnpm install
pnpm build

# Load the extension once in chrome://extensions (Developer Mode → Load Unpacked → packages/extension/dist)
# Copy the extension ID Chrome shows you, then register the native host:

pnpm host:install -- --extension-id <PASTE_ID_HERE>
```

That writes `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/cx.jarvis.notepad_ai.json` pointing at the local host binary.

## Dev loop

```bash
pnpm dev:extension   # Vite + crxjs HMR
pnpm dev:host        # tsx watch on the native host
```

## What's in this slice

- Popup → captures the current tab's selected text into IndexedDB
- Side panel → lists notes, opens a CodeMirror editor, runs "Summarize" through `claude`, streams the result inline
- Options → passive health check (host reachable? `claude` detected?)

Folders, embeddings, additional AI modes, sync, and encryption are Phase 2+.
