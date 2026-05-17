# Memex

> *"Memory + index — a hypothetical desk-sized device for storing books, records, and communications, mechanized so that it may be consulted with exceeding speed and flexibility."*
> — Vannevar Bush, *As We May Think* (The Atlantic, 1945)

An AI-augmented second-brain Chrome extension. Lives in the side panel. Backed by your locally-installed `claude` CLI and a local SQLite DB — no notepad-ai backend, no API key required.

> **Status**: Phase 1+ — usable. See `.claude/plans/` for the full roadmap.

## Architecture

Three pnpm workspace packages:

- `@memex/shared` — wire protocol + domain types shared by both ends
- `@memex/host` — Node.js Chrome Native Messaging host that spawns the `claude` CLI, owns the SQLite DB, and exposes notes/folders + AI streaming RPCs
- `@memex/extension` — React + Vite + Manifest V3 Chrome extension (side panel notes browser, CodeMirror editor, AI action bar, settings)

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

pnpm host:install --extension-id <PASTE_ID_HERE>
# (Quit Chrome with Cmd+Q and reopen so it picks up the new host manifest.)
```

That writes `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/cx.jarvis.memex.json` pointing at the local host binary. Notes live in `~/Library/Application Support/memex/notes.db` — a real SQLite file you can open with `sqlite3` or DB Browser.

## Dev loop

```bash
pnpm dev:extension   # Vite + crxjs HMR
pnpm dev:host        # tsx watch on the native host
```

## What's in here

- Side panel with notes browser (search, folders, tags), CodeMirror 6 markdown editor
- AI action bar: Summarize / Organize / Improve / Extract tasks / Brainstorm / Research / Auto title-tags — all streamed token-by-token from your `claude` CLI
- Quick capture (selected text or whole page) from any tab via the side panel's overflow menu
- AI provider abstraction: `claude` (default), OpenAI (BYO key), or Ollama (local) — switch in Options, with a Test connection button
- Theme: dark / light / system (persisted in localStorage)
- Options page health check (host reachable, claude version, DB path)

Phase 2+ roadmap: embeddings + semantic search, encrypted notes, calendar export, multi-device sync.
