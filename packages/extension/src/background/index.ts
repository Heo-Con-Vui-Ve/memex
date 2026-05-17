import type { HostRequest, HostResponse } from "@notepad-ai/shared";
import { HOST_NAME } from "@notepad-ai/shared";

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
