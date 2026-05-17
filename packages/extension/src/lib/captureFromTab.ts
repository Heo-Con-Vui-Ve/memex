/**
 * Grab the user's current selection (or whole-page text) from the active tab.
 *
 * First tries the content script via chrome.tabs.sendMessage — fast path,
 * works when selectionCapture.ts has already loaded into the page.
 *
 * Falls back to chrome.scripting.executeScript when the content script
 * isn't there: happens on tabs that were already open when the extension
 * was installed / reloaded, on pages that loaded before our content
 * script's run_at, or on transient SPAs that swapped the document out.
 *
 * Only truly browser-restricted pages (chrome://, chrome-extension://,
 * Web Store, view-source://) throw out — Chrome refuses both messaging
 * and scripting injection on those.
 */

export type CapturePayload = { text: string; url: string; title: string };
export type CaptureMode = "selection" | "page";

export async function captureFromTab(
  tabId: number,
  mode: CaptureMode,
): Promise<CapturePayload> {
  const msgType = mode === "selection" ? "capture-selection" : "capture-page";

  try {
    return (await chrome.tabs.sendMessage(tabId, { type: msgType })) as CapturePayload;
  } catch {
    // Content script not present — fall through to executeScript.
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: captureInPage,
    args: [mode],
  });
  if (!result || result.result == null) {
    throw new Error("No result from page");
  }
  return result.result as CapturePayload;
}

/** Runs in the page context via chrome.scripting.executeScript. */
function captureInPage(mode: CaptureMode): CapturePayload {
  if (mode === "selection") {
    return {
      text: window.getSelection()?.toString() ?? "",
      url: window.location.href,
      title: document.title,
    };
  }
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript, svg, iframe").forEach((n) => n.remove());
  return {
    text: (clone.innerText || "").trim(),
    url: window.location.href,
    title: document.title,
  };
}
