# Feature: notepad-ai — AI-Powered Browser Extension for Note-Taking

**Date**: 2026-05-17
**Status**: Planning
**Author**: Architecture Planning Agent

## Overview

A Manifest V3 Chrome/Edge extension for capturing, organizing, and AI-augmenting personal notes. The AI layer is uniquely powered by the user's locally-installed `claude` CLI binary (not the Anthropic API), bridged via Chrome Native Messaging. Architecture is local-first, offline-capable, and abstracts the AI provider so Claude CLI can be swapped for OpenAI / local LLMs later.

The MVP proves the riskiest seam — extension UI → service worker → native host → `claude` CLI subprocess → streamed tokens back to UI — with the minimum surrounding scaffolding to make it useful as a note-taker.

## User Stories

- **As a knowledge worker**, I can press a keyboard shortcut anywhere in my browser to capture selected text into a new note without losing flow.
- **As a Claude CLI user**, I can highlight a messy note and run "Summarize" to get a streamed, structured summary inline — no API key required, my existing `claude` auth is reused.
- **As a privacy-conscious user**, my notes live in IndexedDB on my machine; nothing leaves the device except what I explicitly send to `claude`.
- **As a future power user (post-MVP)**, I can semantic-search my notes, chat with my knowledge base, run custom AI pipelines, and sync across devices.

## Technical Approach

### Stack
- **Extension UI**: React 18 + TypeScript + Vite (with `@crxjs/vite-plugin` for MV3 HMR)
- **Bundler/workspace**: pnpm workspaces (lightweight, no Nx/Turbo overhead for a 3-package monorepo)
- **Native host**: **Node.js 20 + TypeScript**, compiled to a single binary via `pkg` or `bun build --compile`
- **Storage**: IndexedDB via `idb` wrapper; OPFS for large attachments; deferred sqlite-wasm for vectors (Phase 2)
- **Embeddings (Phase 2)**: Transformers.js `all-MiniLM-L6-v2` in an offscreen document worker

### Native Host Language Decision: Node.js + TypeScript

**Picked Node.js** over Go/Rust because (a) the message protocol is trivial JSON over stdio — no perf bottleneck justifies a systems language, (b) we share TypeScript types with the extension via a workspace package, eliminating a whole class of protocol drift bugs, and (c) `child_process.spawn` with stream piping for the `claude` subprocess is one of Node's strongest paths. Tradeoff: ~40MB compiled binary vs ~5MB Go — acceptable for a dev-tool extension.

### MV3 Surface Decision: Chrome Side Panel (`chrome.sidePanel`) as primary

Side Panel is keyboard-first, persistent across tab navigation, doesn't dismiss on click-away (unlike popup), and gives a Linear/Arc-like always-available feel. Popup is retained as a *quick capture* surface only (one-shot save selection → close). A dedicated full-tab page (`notes.html`) handles the library/browse view for power use. Edge supports `chrome.sidePanel` since v114.

### Native Messaging Protocol

Chrome native messaging uses **4-byte little-endian length prefix + UTF-8 JSON payload** on stdin/stdout. The native host reads/writes accordingly. All envelopes carry a `requestId` for correlation since streaming responses are multiplexed.

**Request envelope**:
```ts
{ requestId: string, type: "claude.invoke" | "claude.cancel" | "host.ping",
  payload: { mode: "summarize"|"organize"|..., prompt: string, context?: string,
             cliArgs?: string[], timeoutMs?: number } }
```

**Response chunk** (streaming):
```ts
{ requestId: string, type: "chunk", data: string, seq: number }
```

**Response terminal**:
```ts
{ requestId: string, type: "done", exitCode: number, totalMs: number }
```

**Error**:
```ts
{ requestId: string, type: "error", code: "CLI_NOT_FOUND"|"CLI_AUTH"|"TIMEOUT"|"INTERNAL",
  message: string, details?: unknown }
```

The host spawns `claude` with `--print --output-format stream-json` (or equivalent CLI streaming flag), pipes `prompt` to stdin, and forwards each parsed stdout chunk wrapped in a `chunk` envelope.

### Native Host Installation/Registration

Manifest JSON files registering the host must be placed at OS-specific locations:
- **macOS**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/cx.jarvis.notepad_ai.json` (and Edge equivalent under `Microsoft Edge`)
- **Linux**: `~/.config/google-chrome/NativeMessagingHosts/cx.jarvis.notepad_ai.json`
- **Windows**: registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\cx.jarvis.notepad_ai` pointing to the manifest file path

Ship a cross-platform `install.js` (Node script) that detects OS, writes the manifest with absolute path to the host binary, and prints the `allowed_origins` extension ID for the user. Distribute as `npm install -g @notepad-ai/host` plus a post-install hook, **and** a standalone download for non-Node users.

### Storage Schema (IndexedDB via `idb`)

Database: `notepad-ai`, version 1.

| Object Store | Key Path | Indexes |
|---|---|---|
| `notes` | `id` (uuid) | `by-folder` (folderId), `by-updated` (updatedAt), `by-tag` (tags, multiEntry), `by-title` (title) |
| `folders` | `id` | `by-parent` (parentId), `by-name` (name) |
| `tags` | `id` | `by-name` (name, unique) |
| `attachments` | `id` | `by-note` (noteId) — large blobs offloaded to OPFS, only metadata here |
| `aiJobs` | `id` | `by-status` (status), `by-note` (noteId), `by-created` (createdAt) |
| `settings` | `key` | — |

Note shape: `{ id, title, contentMd, folderId, tags[], createdAt, updatedAt, encrypted: boolean, version }`.

### Embeddings (Phase 2)

`claude` CLI does not expose an embeddings endpoint. **MVP default decision: defer embeddings entirely from Phase 1.** When introduced in Phase 2: bundle **Transformers.js with `all-MiniLM-L6-v2`** (384-dim, ~25MB quantized) running in an **offscreen document** (MV3-compatible long-lived worker). Vectors stored in **`sqlite-wasm` with `sqlite-vec` extension** persisted to OPFS — a single file is more efficient than IDB blob-per-vector for kNN scans and keeps the door open to FTS5 hybrid search. Rejected: routing embeddings through native host (adds latency, needs another local model dependency, less portable).

### MV3 Component Responsibilities

- **Service worker** (`background.ts`): owns the native host port (single long-lived connection via `chrome.runtime.connectNative`), maintains a `requestId → MessagePort` map, manages job queue with retry/timeout, broadcasts `chunk`/`done` events to subscribed UI surfaces. Re-establishes port on wake.
- **Content scripts**: minimal — selection capture, page metadata extraction (title/URL/canonical), `chrome.tabs.captureVisibleTab` screenshot trigger. Posts to service worker; no UI injected in Phase 1.
- **Offscreen document** (Phase 2): hosts Transformers.js since service workers can't run WASM/long jobs.
- **Side Panel** (primary UI): note list, editor, AI action bar.
- **Popup**: quick-capture only.
- **Options page**: native host status check, mode/prompt customization (Phase 2+).

## File Structure

```
notepad-ai/
  pnpm-workspace.yaml
  package.json
  tsconfig.base.json
  .nvmrc
  README.md
  packages/
    shared/                          # @notepad-ai/shared
      src/
        protocol.ts                  # native-host wire types (requestId, envelopes)
        models.ts                    # Note, Folder, Tag, Attachment, AiJob types
        modes.ts                     # AI mode enum + default prompts
        index.ts
      package.json
      tsconfig.json
    extension/                       # @notepad-ai/extension
      vite.config.ts                 # @crxjs/vite-plugin
      manifest.config.ts             # MV3 manifest (sidePanel, nativeMessaging perms)
      src/
        background/
          index.ts                   # service worker entry
          nativeHostClient.ts        # port mgmt, request correlation
          jobQueue.ts                # AI job orchestration
          messages.ts                # internal extension message types
        content/
          selectionCapture.ts
          pageExtract.ts
        sidepanel/
          index.html
          main.tsx
          App.tsx
          components/{NoteList,Editor,AiActionBar,FolderTree}.tsx
          hooks/{useNotes,useAiStream,useNativeHost}.ts
        popup/
          index.html
          main.tsx
          QuickCapture.tsx
        options/
          index.html
          main.tsx
          Options.tsx
        notes-page/                  # Phase 2 full-tab library view
        storage/
          db.ts                      # idb open + migrations
          notesRepo.ts
          foldersRepo.ts
          tagsRepo.ts
          attachmentsRepo.ts
          aiJobsRepo.ts
        ai/
          provider.ts                # AiProvider interface (swappable)
          claudeCliProvider.ts       # routes through nativeHostClient
        styles/
          globals.css
        utils/
          ids.ts
          markdown.ts
      package.json
      tsconfig.json
    native-host/                     # @notepad-ai/host
      src/
        index.ts                     # stdin/stdout loop, length-prefixed framing
        framing.ts                   # 4-byte LE prefix encode/decode
        claudeRunner.ts              # spawn claude, stream parse
        registry/
          install.ts                 # cross-platform manifest writer
          uninstall.ts
          manifest-templates/
            chrome.json.tmpl
            edge.json.tmpl
        logger.ts
      bin/
        notepad-ai-host              # shebang entry (post-build)
      package.json
      tsconfig.json
  scripts/
    dev.sh                           # parallel pnpm --filter dev
    build-all.sh
    package-extension.sh             # zip for store upload
```

## Tasks

### Backend (Native Host) — agent: `backend-engineer`

| # | Task | Complexity |
|---|---|---|
| B1 | Bootstrap `@notepad-ai/host` pnpm package, TS config, build pipeline producing single binary | S |
| B2 | Implement length-prefixed framing reader/writer (`framing.ts`) with stream backpressure handling | M |
| B3 | Stdin/stdout main loop dispatching by `type`, correlating `requestId` | M |
| B4 | `claudeRunner.ts`: spawn `claude` subprocess, pipe prompt, parse streaming JSON output, emit chunk envelopes; cancel via SIGTERM | L |
| B5 | Error taxonomy + mapping (CLI not on PATH, auth failure, non-zero exit, timeout) | S |
| B6 | Cross-platform install script (macOS/Linux file write, Windows registry via `winreg-cli`) with `--extension-id` flag | L |
| B7 | Health-check `host.ping` handler returning host version, Node version, detected `claude` path & version | S |

### Frontend (Extension) — agent: `frontend-engineer`

| # | Task | Complexity |
|---|---|---|
| F1 | Scaffold Vite + React + `@crxjs/vite-plugin`, base MV3 manifest with `nativeMessaging`, `sidePanel`, `storage`, `activeTab`, `scripting` perms | M |
| F2 | `@notepad-ai/shared` package with protocol + model types, wired into both extension and host | S |
| F3 | Service worker: `nativeHostClient` with `connectNative`, port lifecycle, requestId map, chunk fan-out via `chrome.runtime` messages | L |
| F4 | `jobQueue.ts`: serialize AI requests, surface status to UI, persist to `aiJobs` store | M |
| F5 | IndexedDB layer (`db.ts` + repos) with v1 schema and migration scaffold | M |
| F6 | Side Panel shell: 2-pane (note list + editor), keyboard shortcuts (Cmd+K palette stub), dark mode | L |
| F7 | Markdown editor integration (recommend CodeMirror 6 with markdown lang — lighter than TipTap for MVP) | M |
| F8 | Popup `QuickCapture`: read selection from active tab via content script, save note, close | M |
| F9 | Content script: selection + page metadata extraction | S |
| F10 | `AiActionBar`: trigger "Summarize" mode, subscribe to chunk stream, append into editor live | M |
| F11 | `AiProvider` interface + `claudeCliProvider` implementation (so Phase 3 swap is mechanical) | S |
| F12 | Options page: native host status, `claude` binary path display, troubleshooting log | S |

### Testing — agent: `test-engineer`

| # | Task | Complexity |
|---|---|---|
| T1 | Unit tests for `framing.ts` (Vitest) — round-trip, partial reads, oversized payloads | S |
| T2 | Unit tests for IDB repos using `fake-indexeddb` | M |
| T3 | Native host integration test: spawn host binary, mock `claude` with a fixture script, assert chunk stream | L |
| T4 | Extension E2E via Playwright with `--load-extension`, smoke: open side panel, create note, run Summarize against mocked native host | XL |
| T5 | Manual QA checklist: macOS Chrome, macOS Edge, Windows Chrome (deferred to ship) | S |

## Dependencies

**Task ordering**
- F2 (shared types) blocks B3, B4, F3
- B2 → B3 → B4 (native host inside-out)
- F1 → F3 → F4 → F10 (extension critical path)
- F5 blocks F6, F8 (storage before UI consumers)
- F3 + B4 must be integration-tested together before F10
- All tests (T*) follow their corresponding impl tasks

**Runtime libs**
- React 18, react-dom, CodeMirror 6 (`@codemirror/lang-markdown`, `@codemirror/state`, `@codemirror/view`)
- `idb` (IndexedDB wrapper)
- `uuid` or `nanoid`

**Build/dev**
- Vite 5, `@crxjs/vite-plugin`, TypeScript 5.4+, pnpm 9
- `tsx` (host dev runner), `pkg` or `bun build --compile` (host packaging)

**Test**
- Vitest, `fake-indexeddb`, Playwright

**External (user must have)**
- `claude` CLI installed and authenticated on PATH
- Node.js 20+ (only if installing host via npm; standalone binary avoids this)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| User doesn't have `claude` CLI installed/authenticated | High | High | Options page health check on first run with install instructions; surface specific error code from host |
| `claude` CLI flags or streaming output format changes between versions | Med | High | Pin minimum CLI version in host, parse defensively, expose CLI version in health check; abstract behind `claudeRunner.ts` |
| Edge `chrome.sidePanel` parity gaps | Low | Med | Detect API presence; fall back to dedicated tab page if missing |
| MV3 service worker eviction mid-stream drops in-flight job | High | Med | Persist job state to `aiJobs` store; reconnect native port on wake; resume by polling host or re-issuing |
| Native messaging 1MB message size cap | Med | Med | Streaming is chunk-based — already mitigated; cap per-chunk size at 256KB |
| Installer permissions on Windows (registry write) | Med | Med | Document UAC requirement; provide manual fallback `.reg` file |
| Long-term: no embeddings via `claude` CLI | Cert | Med (Phase 2) | Bundle Transformers.js locally; documented in Phase 2 |
| Encryption-at-rest key management UX | Med | High | Defer to Phase 3; do not promise "encrypted" in MVP marketing |
| Chrome Web Store review of `nativeMessaging` permission | Med | Med | Justify in store listing; prepare privacy policy early |

## Acceptance Criteria

**MVP (Phase 1) is shippable when:**
1. User installs extension + runs `install.js` once; Options page shows "claude CLI: detected vX.Y.Z".
2. User selects text on any page, clicks toolbar popup, hits Save — note appears in side panel list within 200ms.
3. User opens a note in side panel, clicks "Summarize" — tokens stream into a new section of the note live (visible token-by-token).
4. Killing/reloading the service worker mid-stream does not corrupt the note; job either resumes or surfaces a clear error.
5. All notes persist across browser restart (IndexedDB).
6. Works on Chrome stable (macOS + Windows) and Edge stable (macOS).
7. Zero network requests originate from the extension itself (verifiable via DevTools Network tab).

## Phased Roadmap

### Phase 1 — MVP (this plan)
Quick capture (selection only), side panel UI, markdown editor, folders **not** included (flat list + tags only), one AI mode (Summarize), streaming, native host bridge, IndexedDB, options page health check.

### Phase 2 — Knowledge layer
Folders + folder tree, full-page capture, screenshot capture, additional AI modes (Organize, Brainstorm, Improve writing, Extract tasks, Research), Transformers.js embeddings + sqlite-vec semantic search, chat-with-notes, auto title + tags, smart categorization, daily digest, related-note suggestions, duplicate detection, full-tab library page, Cmd+K palette real impl, customizable prompts.

### Phase 3 — Power features
User-defined automation pipelines, encrypted-at-rest notes (per-note opt-in, passphrase-derived key via PBKDF2/Argon2), action-item/deadline extraction with calendar export, OpenAI provider implementation (proving abstraction), local-model provider (Ollama via native host).

### Phase 4 — Multi-device & polish
CRDT-based sync (Yjs + user-chosen backend: WebDAV/S3/self-hosted), cross-device conflict resolution, mobile companion (read-only PWA), public Chrome Web Store + Edge Add-ons release, telemetry opt-in, advanced theming.

## Estimated Timeline

| Phase | Duration | Effort |
|---|---|---|
| Phase 1 (MVP) | ~4 weeks | ~1 engineer FTE |
| Phase 2 | 6–8 weeks | ~1 engineer FTE |
| Phase 3 | 6 weeks | ~1 engineer FTE |
| Phase 4 | 8+ weeks | ~1–2 engineers |

**Phase 1 week-by-week**:
- **W1**: Monorepo, shared package, native host skeleton + framing, install script (macOS only)
- **W2**: Service worker ↔ native host roundtrip, `claude` subprocess streaming proven E2E with a hardcoded prompt
- **W3**: IndexedDB layer, side panel shell, markdown editor, note CRUD
- **W4**: Popup quick capture, content script, Summarize mode wired end-to-end, options page, error states
- **W5**: Polish, Edge + Windows validation, Playwright E2E, docs

## Critical Files for Implementation

- `/Users/trantan/Dev/Personal/notepad-ai/packages/shared/src/protocol.ts`
- `/Users/trantan/Dev/Personal/notepad-ai/packages/native-host/src/index.ts`
- `/Users/trantan/Dev/Personal/notepad-ai/packages/native-host/src/claudeRunner.ts`
- `/Users/trantan/Dev/Personal/notepad-ai/packages/extension/src/background/nativeHostClient.ts`
- `/Users/trantan/Dev/Personal/notepad-ai/packages/extension/src/storage/db.ts`

## Resolved Decisions (locked 2026-05-17)

1. **`claude` CLI**: Already installed + authenticated on the dev machine. Phase 1 ships only a passive health-check in Options ("claude vX.Y.Z detected" / "not found, see install docs"). No first-run onboarding wizard. *Saves ~3 days.*
2. **Browser scope**: **Chrome-only for MVP.** Edge support deferred to Phase 2 polish (manifest path + `sidePanel` parity validation). *Saves ~2 days.*
3. **Native host distribution**: `npm install -g @notepad-ai/host` — requires user has Node 20+. Standalone signed binaries deferred until there's a non-developer audience to justify codesigning costs.
4. **Storage engine** *(pivot during W1)*: **SQLite via `better-sqlite3`, owned by the native host**, not IndexedDB in the extension. Postgres was offered but not installed on this machine, and SQLite is the right fit for a single-user personal tool. Side effects:
    - Extension is a pure UI client over native messaging — no IDB code at all
    - Wire protocol extended with `notes.list / get / upsert / delete / search` RPCs
    - FTS5 already wired up; `sqlite-vec` extension will plug in for Phase 2 embeddings (loadable-extension support confirmed in the better-sqlite3 build)
    - DB lives at `~/Library/Application Support/notepad-ai/notes.db` (macOS); same dir holds `host.log`
    - Trade-off: extension no longer works without the native host installed — acceptable because the host is required for all AI features anyway

**Net effect**: Phase 1 timeline trims from 4–5 weeks to ~4 weeks. Week 5 polish step now folds into W4.

## Revised Phase 1 timeline

- **W1**: Monorepo, shared package, native host skeleton + framing, macOS install script
- **W2**: Service worker ↔ native host roundtrip, `claude` subprocess streaming proven E2E
- **W3**: IndexedDB layer, side panel shell, markdown editor, note CRUD
- **W4**: Popup quick capture, content script, Summarize wired end-to-end, options page health check, Playwright smoke, docs
