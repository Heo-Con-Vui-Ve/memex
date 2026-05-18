import type { HostRequest, HostResponse, NoteRow } from "@memex/shared";
import { HOST_NAME } from "@memex/shared";

/**
 * Service worker — the only place that holds the chrome.runtime.connectNative
 * port. UI surfaces connect to us via chrome.runtime.connect({ name }) and we
 * fan responses back keyed on requestId.
 */

let nativePort: chrome.runtime.Port | null = null;
const requestOwner = new Map<string, chrome.runtime.Port>();

function ensureNativePort(): chrome.runtime.Port {
  if (nativePort) return nativePort;
  nativePort = chrome.runtime.connectNative(HOST_NAME);

  nativePort.onMessage.addListener((msg: HostResponse) => {
    const ownerPort = requestOwner.get(msg.requestId);
    if (!ownerPort) return;
    try {
      ownerPort.postMessage(msg);
    } catch {
      requestOwner.delete(msg.requestId);
    }
    if (msg.type === "done" || msg.type === "error") {
      requestOwner.delete(msg.requestId);
    }
  });

  nativePort.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError?.message ?? "native host disconnected";
    for (const [id, p] of requestOwner) {
      try {
        p.postMessage({
          requestId: id,
          type: "error",
          code: "INTERNAL",
          message: err,
        } as HostResponse);
      } catch {}
    }
    requestOwner.clear();
    nativePort = null;
  });

  return nativePort;
}

chrome.runtime.onConnect.addListener((uiPort) => {
  if (uiPort.name !== "notepad-ui") return;

  uiPort.onMessage.addListener((req: HostRequest) => {
    try {
      const host = ensureNativePort();
      requestOwner.set(req.requestId, uiPort);
      host.postMessage(req);
    } catch (err) {
      uiPort.postMessage({
        requestId: req.requestId,
        type: "error",
        code: "INTERNAL",
        message: (err as Error).message,
      } as HostResponse);
    }
  });

  uiPort.onDisconnect.addListener(() => {
    // Drop any in-flight requests owned by this UI surface.
    for (const [id, p] of requestOwner) {
      if (p === uiPort) requestOwner.delete(id);
    }
  });
});

// Clicking the toolbar icon opens the side panel (only surface — no popup).
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  // First-install: warm up the native port so the user sees errors right away.
  try {
    ensureNativePort();
  } catch {}
});

// --- Meet recorder integrations -------------------------------------------
// The Meet content script broadcasts lifecycle events via chrome.runtime
// sendMessage. We listen here for two purposes:
//   1. Show a "REC" badge on the toolbar icon while a capture is active, so
//      the user has a visible reminder that the recorder is running even
//      after they close the side panel.
//   2. Persist the in-progress transcript if the tab unloads without the
//      user having pressed Stop & Save — the failsafe that lets recording
//      run in the background.
const REC_BADGE_TEXT = "REC";
const REC_BADGE_BG = "#e11d48";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "meet:started") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      void chrome.action.setBadgeBackgroundColor({ color: REC_BADGE_BG, tabId }).catch(() => {});
      void chrome.action.setBadgeText({ text: REC_BADGE_TEXT, tabId }).catch(() => {});
    }
    return false;
  }

  if (msg.type === "meet:ended") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      void chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
    }
    return false;
  }

  if (msg.type === "meet:autosave") {
    // Build a NoteRow shaped payload directly — we can't import models.ts's
    // newNote because the SW environment is fine with it but we want to
    // keep the payload shape obvious here for diagnostics if a save fails.
    const now = Date.now();
    const note: NoteRow = {
      id: crypto.randomUUID(),
      title: String(msg.title || "Meeting"),
      contentMd: String(msg.contentMd || ""),
      folderId: null,
      tags: ["meeting"],
      sourceUrl: msg.sourceUrl ? String(msg.sourceUrl) : null,
      sourceTitle: String(msg.title || "Meeting"),
      createdAt: now,
      updatedAt: now,
    };
    try {
      const host = ensureNativePort();
      const requestId = crypto.randomUUID();
      // Don't register an owner — the native-host response will be dropped
      // by the onMessage handler (its early return on missing owner). That
      // is intentional: this is a fire-and-forget save with no UI to update.
      const req: HostRequest = {
        requestId,
        type: "notes.upsert",
        payload: { note },
      };
      host.postMessage(req);
    } catch {
      // SW will retry the native port on its next request; nothing useful
      // to surface from here since the originating tab is already unloading.
    }
    // Also clear the badge if the tab is about to die — the meet:ended that
    // would normally clear it fires in the same tick but might race.
    const tabId = sender.tab?.id;
    if (tabId != null) {
      void chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
