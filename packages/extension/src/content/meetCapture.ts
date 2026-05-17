// Content script: only loaded on meet.google.com. Watches Google Meet's
// built-in live-captions DOM and streams transcript deltas to the background
// service worker, which fans them out to the side panel.
//
// We deliberately do NOT touch audio/video: captions are a text stream the
// browser is already rendering when the user turns on CC, so observing them
// adds no new permission surface, no Whisper dependency, no bytes leaving the
// machine. Trade-off: meetings without CC produce an empty transcript — the
// side panel surfaces a "captions not detected" hint in that case.
//
// Meet's captions DOM uses obfuscated class names that rotate between
// releases. We rely on semantic anchors that have proven stable across many
// rebrandings:
//   * a region with `aria-label="Captions"` (English UI) or matching role
//   * each speaker turn is a direct child block with one text-bearing subtree
// If the anchor moves we widen the search: any element whose subtree contains
// elements with the (also volatile) caption styling. Selectors are layered so
// one breaks at a time, not the whole feature.
//
// Speaker-turn lifecycle in Meet: a block is appended when someone starts
// speaking, its text grows in place as recognition refines, then the block
// is removed when it scrolls off-screen (~30s). We emit `caption.delta`
// updates while a block is live and `caption.final` when it's removed so the
// side panel can persist the finalised line.

declare global { interface Window { __memexMeetCaptureInstalled?: boolean } }

interface CaptionSegment {
  id: string;
  speaker: string;
  text: string;
  startedAt: number; // ms since epoch when first observed
}

type MeetMessage =
  | { type: "meet:started"; tabUrl: string; meetingTitle: string; startedAt: number }
  | { type: "meet:caption-delta"; segment: CaptionSegment }
  | { type: "meet:caption-final"; segment: CaptionSegment }
  | { type: "meet:captions-status"; detected: boolean }
  | { type: "meet:ended" };

const POST_DEBOUNCE_MS = 250;
const STATUS_PROBE_MS = 1500;
const KNOWN_CAPTION_ARIA = [
  "Captions",
  "Phụ đề",
  "Subtítulos",
  "Sous-titres",
  "Untertitel",
];

let captionRoot: HTMLElement | null = null;
let rootObserver: MutationObserver | null = null;
let bodyObserver: MutationObserver | null = null;
let captureActive = false;
let detected = false;
let statusTimer: number | null = null;
let captureStartedAt = 0;
let meetingTitle = "";

// Finalised segments are buffered here so the side panel can re-attach and
// receive the full transcript even if it was closed for part of the meeting.
const finalSegments: CaptionSegment[] = [];
// Live (still-updating) blocks indexed by DOM node so we can emit deltas.
const liveBlocks = new WeakMap<Element, { id: string; speaker: string; text: string; startedAt: number; postTimer: number | null }>();
// Parallel id-keyed snapshot of the same live state so probe can return it.
const liveSnapshot = new Map<string, CaptionSegment>();

function post(msg: MeetMessage): void {
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    // SW asleep; messages are best-effort and the side panel re-probes state.
  }
}

function findCaptionRoot(): HTMLElement | null {
  for (const label of KNOWN_CAPTION_ARIA) {
    const el = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    if (el && el.offsetParent !== null) return el;
  }
  // Fallback: a region role near the bottom containing the volatile caption
  // structure (avatar + name + text). We sniff for an element that has many
  // small text children all updating at high frequency, but doing that
  // properly needs profiling, so for now we just look for [role="region"]
  // whose label hints at captions in any language.
  const regions = document.querySelectorAll<HTMLElement>('[role="region"]');
  for (const r of regions) {
    const label = (r.getAttribute("aria-label") ?? "").toLowerCase();
    if (label.includes("caption") || label.includes("subtitle") || label.includes("phụ đề")) {
      return r;
    }
  }
  return null;
}

function speakerOfBlock(block: Element): string {
  // The speaker's display name is usually the first short text node inside
  // the block, often inside an element separate from the rolling text. We
  // pick the shortest non-empty text node in the first depth as a heuristic.
  const textNodes: string[] = [];
  block.querySelectorAll("*").forEach((el) => {
    const t = (el.textContent ?? "").trim();
    if (t && t.length < 60 && !textNodes.includes(t)) textNodes.push(t);
  });
  // First short text is almost always the speaker name.
  return textNodes[0] ?? "Unknown";
}

function transcriptOfBlock(block: Element): string {
  // Strategy: take innerText, then strip the speaker line (first short line)
  // to leave the running transcript. innerText respects line breaks the
  // browser rendered so we get sensible separation.
  const raw = (block as HTMLElement).innerText ?? "";
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length <= 1) return lines.join(" ");
  // Drop the first line if it looks like a name (short, no sentence ender).
  const first = lines[0] ?? "";
  const looksLikeName = first.length < 40 && !/[.!?]$/.test(first);
  return (looksLikeName ? lines.slice(1) : lines).join(" ");
}

function emitDelta(block: Element): void {
  const state = liveBlocks.get(block);
  if (!state) return;
  const text = transcriptOfBlock(block);
  const speaker = speakerOfBlock(block);
  if (!text) return;
  if (text === state.text && speaker === state.speaker) return;
  state.text = text;
  state.speaker = speaker;
  const segment: CaptionSegment = { id: state.id, speaker: state.speaker, text: state.text, startedAt: state.startedAt };
  liveSnapshot.set(state.id, segment);
  if (state.postTimer != null) clearTimeout(state.postTimer);
  state.postTimer = window.setTimeout(() => {
    post({ type: "meet:caption-delta", segment });
  }, POST_DEBOUNCE_MS);
}

function trackBlock(block: Element): void {
  if (liveBlocks.has(block)) return;
  liveBlocks.set(block, {
    id: crypto.randomUUID(),
    speaker: speakerOfBlock(block),
    text: "",
    startedAt: Date.now(),
    postTimer: null,
  });
  emitDelta(block);
}

function untrackBlock(block: Element): void {
  const state = liveBlocks.get(block);
  if (!state) return;
  if (state.postTimer != null) clearTimeout(state.postTimer);
  if (state.text) {
    const segment: CaptionSegment = { id: state.id, speaker: state.speaker, text: state.text, startedAt: state.startedAt };
    finalSegments.push(segment);
    liveSnapshot.delete(state.id);
    post({ type: "meet:caption-final", segment });
  }
  liveBlocks.delete(block);
}

function attachRootObserver(root: HTMLElement): void {
  detachRootObserver();
  // Seed any blocks already present.
  Array.from(root.children).forEach((c) => trackBlock(c));

  rootObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) trackBlock(n as Element);
      });
      m.removedNodes.forEach((n) => {
        if (n.nodeType === 1) untrackBlock(n as Element);
      });
      // Same block, text changed inside it: walk up to the nearest tracked
      // child of root and emit a delta.
      if (m.type === "characterData" || m.target.nodeType === 1) {
        let cur: Element | null = (m.target.nodeType === 1 ? (m.target as Element) : (m.target.parentElement as Element | null));
        while (cur && cur.parentElement !== root) cur = cur.parentElement;
        if (cur && liveBlocks.has(cur)) emitDelta(cur);
      }
    }
  });
  rootObserver.observe(root, { childList: true, subtree: true, characterData: true });
}

function detachRootObserver(): void {
  if (rootObserver) {
    rootObserver.disconnect();
    rootObserver = null;
  }
}

function setDetected(next: boolean): void {
  if (detected === next) return;
  detected = next;
  post({ type: "meet:captions-status", detected });
}

function probe(): void {
  if (!captureActive) return;
  const root = findCaptionRoot();
  if (root && root !== captionRoot) {
    captionRoot = root;
    attachRootObserver(root);
    setDetected(true);
  } else if (!root && captionRoot) {
    detachRootObserver();
    captionRoot = null;
    setDetected(false);
  } else {
    setDetected(!!root);
  }
}

function startCapture(): void {
  if (captureActive) return;
  captureActive = true;
  captureStartedAt = Date.now();
  // Leave empty if we can't derive a title — the side panel will fall back
  // to a localised "Meeting" string. Content scripts run in the page world
  // and can't reach the extension's i18n table, so we keep the fallback
  // upstream in the UI surface.
  meetingTitle = document.title.replace(/^Meet[\s·-]+/i, "").trim();
  finalSegments.length = 0;
  liveSnapshot.clear();
  post({
    type: "meet:started",
    tabUrl: location.href,
    meetingTitle,
    startedAt: captureStartedAt,
  });
  // Watch the whole document for the captions region appearing/disappearing —
  // Meet mounts it lazily when the user toggles CC.
  bodyObserver = new MutationObserver(() => probe());
  bodyObserver.observe(document.body, { childList: true, subtree: true });
  probe();
  statusTimer = window.setInterval(probe, STATUS_PROBE_MS);
}

function stopCapture(): void {
  if (!captureActive) return;
  captureActive = false;
  // Finalise anything still live before tearing down.
  if (captionRoot) {
    Array.from(captionRoot.children).forEach((c) => untrackBlock(c));
  }
  detachRootObserver();
  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }
  if (statusTimer != null) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  captionRoot = null;
  detected = false;
  post({ type: "meet:ended" });
}

function collectTranscript(): { finals: CaptionSegment[]; live: CaptionSegment[]; startedAt: number; meetingTitle: string; tabUrl: string } {
  return {
    finals: finalSegments.slice(),
    live: Array.from(liveSnapshot.values()),
    startedAt: captureStartedAt,
    meetingTitle,
    tabUrl: location.href,
  };
}

// Re-entry guard: this file is auto-injected via the static content_scripts
// manifest entry, AND the side panel injects it again via chrome.scripting
// onto tabs that pre-date the extension load. Without this guard each
// injection adds another onMessage listener, multiplying every caption
// delta. We gate the side-effects (listener + beforeunload) on the flag and
// leave the harmless function/state declarations to be re-declared — they
// just bind to the same window-scoped storage every time.
if (!window.__memexMeetCaptureInstalled) {
  window.__memexMeetCaptureInstalled = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "meet:start") {
      startCapture();
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "meet:stop") {
      const transcript = collectTranscript();
      stopCapture();
      sendResponse({ ok: true, transcript });
      return true;
    }
    if (msg?.type === "meet:probe") {
      sendResponse({
        active: captureActive,
        detected,
        tabUrl: location.href,
        meetingTitle: meetingTitle || document.title,
        startedAt: captureStartedAt,
        finals: finalSegments,
        live: Array.from(liveSnapshot.values()),
      });
      return true;
    }
    return false;
  });

  // If the tab navigates away from the meeting (Meet uses SPA routing), stop.
  window.addEventListener("beforeunload", () => stopCapture());
}

export {};
