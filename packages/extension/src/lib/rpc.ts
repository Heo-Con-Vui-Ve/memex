import type { HostRequest, HostResponse } from "@memex/shared";

/**
 * RPC helper used by all UI surfaces. Each surface opens its own long-lived
 * port to the service worker; the SW forwards requests to the native host
 * and pipes responses back keyed by `requestId`.
 */

const PORT_NAME = "notepad-ui";
let port: chrome.runtime.Port | null = null;
const listeners = new Map<string, (r: HostResponse) => void>();

function ensurePort(): chrome.runtime.Port {
  if (port) return port;
  port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener((msg: HostResponse) => {
    const fn = listeners.get(msg.requestId);
    if (fn) fn(msg);
  });
  port.onDisconnect.addListener(() => {
    port = null;
    // Notify all listeners that the port dropped.
    for (const [id, fn] of listeners) {
      fn({
        requestId: id,
        type: "error",
        code: "INTERNAL",
        message: "Service worker port disconnected",
      });
    }
    listeners.clear();
  });
  return port;
}

function newRequestId(): string {
  return crypto.randomUUID();
}

/** One-shot request → first non-chunk response. */
export function request<T extends HostResponse>(
  req: Omit<HostRequest, "requestId">,
  matcher: (r: HostResponse) => r is T,
): Promise<T> {
  const requestId = newRequestId();
  return new Promise<T>((resolve, reject) => {
    let p: chrome.runtime.Port;
    try {
      p = ensurePort();
    } catch (err) {
      reject(err);
      return;
    }
    listeners.set(requestId, (r) => {
      if (matcher(r)) {
        listeners.delete(requestId);
        resolve(r);
      } else if (r.type === "error") {
        listeners.delete(requestId);
        reject(new Error(`${r.code}: ${r.message}`));
      }
      // else: ignore (e.g. chunk noise for the wrong request shape)
    });
    try {
      p.postMessage({ ...req, requestId } as HostRequest);
    } catch (err) {
      listeners.delete(requestId);
      reject(err);
    }
  });
}

/** Streaming request → chunk/done/error callbacks. Returns a cancel handle. */
export function stream(
  req: Omit<HostRequest, "requestId"> & { type: "claude.invoke" },
  cb: {
    onChunk: (text: string, seq: number) => void;
    onDone: (totalMs: number) => void;
    onError: (code: string, message: string) => void;
  },
): { cancel: () => void } {
  const p = ensurePort();
  const requestId = newRequestId();

  listeners.set(requestId, (r) => {
    if (r.type === "chunk") cb.onChunk(r.data, r.seq);
    else if (r.type === "done") {
      listeners.delete(requestId);
      cb.onDone(r.totalMs);
    } else if (r.type === "error") {
      listeners.delete(requestId);
      cb.onError(r.code, r.message);
    }
  });

  p.postMessage({ ...req, requestId } as HostRequest);

  return {
    cancel() {
      p.postMessage({
        requestId: newRequestId(),
        type: "claude.cancel",
        payload: { cancelRequestId: requestId },
      } as HostRequest);
    },
  };
}

/** Typed matchers used by callers. */
export const is = {
  pong: (r: HostResponse): r is Extract<HostResponse, { type: "pong" }> => r.type === "pong",
  listResult: (r: HostResponse): r is Extract<HostResponse, { type: "notes.list.result" }> =>
    r.type === "notes.list.result",
  getResult: (r: HostResponse): r is Extract<HostResponse, { type: "notes.get.result" }> =>
    r.type === "notes.get.result",
  upsertResult: (r: HostResponse): r is Extract<HostResponse, { type: "notes.upsert.result" }> =>
    r.type === "notes.upsert.result",
  deleteResult: (r: HostResponse): r is Extract<HostResponse, { type: "notes.delete.result" }> =>
    r.type === "notes.delete.result",
  searchResult: (r: HostResponse): r is Extract<HostResponse, { type: "notes.search.result" }> =>
    r.type === "notes.search.result",
  jobList: (r: HostResponse): r is Extract<HostResponse, { type: "ai-jobs.list.result" }> =>
    r.type === "ai-jobs.list.result",
  tagList: (r: HostResponse): r is Extract<HostResponse, { type: "tags.list.result" }> =>
    r.type === "tags.list.result",
  folderList: (r: HostResponse): r is Extract<HostResponse, { type: "folders.list.result" }> =>
    r.type === "folders.list.result",
  folderCreated: (r: HostResponse): r is Extract<HostResponse, { type: "folders.create.result" }> =>
    r.type === "folders.create.result",
  folderRenamed: (r: HostResponse): r is Extract<HostResponse, { type: "folders.rename.result" }> =>
    r.type === "folders.rename.result",
  folderDeleted: (r: HostResponse): r is Extract<HostResponse, { type: "folders.delete.result" }> =>
    r.type === "folders.delete.result",
  settingGet: (r: HostResponse): r is Extract<HostResponse, { type: "settings.get.result" }> =>
    r.type === "settings.get.result",
  settingSet: (r: HostResponse): r is Extract<HostResponse, { type: "settings.set.result" }> =>
    r.type === "settings.set.result",
  providerTest: (r: HostResponse): r is Extract<HostResponse, { type: "provider.test.result" }> =>
    r.type === "provider.test.result",
};
