/**
 * Grab the user's current selection (or whole-page content) from the active tab.
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
 *
 * For mode="page" we also harvest the cleaned page HTML and convert it to
 * structured Markdown here in the extension context (turndown). Plain text
 * loses the DOM hierarchy — headings, lists, links, code blocks all flatten
 * into one paragraph — which makes downstream AI prompts much less effective.
 * Markdown preserves the shape the AI needs while still rendering nicely in
 * the editor.
 */

import TurndownService from "turndown";

export type CapturePayload = { text: string; url: string; title: string };
export type CaptureMode = "selection" | "page";

interface RawCapture {
  text: string;
  /** Cleaned HTML when mode === "page", else null. */
  html: string | null;
  url: string;
  title: string;
}

let turndownInstance: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (turndownInstance) return turndownInstance;
  turndownInstance = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  // Drop nodes that add noise without semantic value. Cast through unknown
  // because turndown's narrow keyof HTMLElementTagNameMap typing rejects
  // valid-but-non-standard tags like svg.
  turndownInstance.remove(["script", "style", "noscript", "iframe", "svg"] as unknown as Parameters<TurndownService["remove"]>[0]);
  return turndownInstance;
}

export async function captureFromTab(
  tabId: number,
  mode: CaptureMode,
): Promise<CapturePayload> {
  const raw = await rawCapture(tabId, mode);
  if (mode === "page" && raw.html) {
    try {
      const md = getTurndown().turndown(raw.html).trim();
      // Some pages produce a wall of garbage (cookie banners, footers).
      // Trim very long runs of whitespace and cap at a sensible size so
      // we don't push 5MB of HTML into a single note.
      const cleaned = md
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 200_000);
      if (cleaned.length > 0) {
        return { text: cleaned, url: raw.url, title: raw.title };
      }
    } catch {
      // Fall through to plain text below.
    }
  }
  return { text: raw.text, url: raw.url, title: raw.title };
}

async function rawCapture(tabId: number, mode: CaptureMode): Promise<RawCapture> {
  const msgType = mode === "selection" ? "capture-selection" : "capture-page";

  // Try the content script first — it ships with the extension and reaches
  // the page DOM directly without an executeScript round-trip.
  try {
    const fromCS = (await chrome.tabs.sendMessage(tabId, { type: msgType })) as Partial<RawCapture> & CapturePayload;
    // Older content script versions don't return `html`; normalise.
    return { text: fromCS.text, url: fromCS.url, title: fromCS.title, html: fromCS.html ?? null };
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
  return result.result as RawCapture;
}

/** Runs in the page context via chrome.scripting.executeScript. */
function captureInPage(mode: CaptureMode): RawCapture {
  if (mode === "selection") {
    return {
      text: window.getSelection()?.toString() ?? "",
      html: null,
      url: window.location.href,
      title: document.title,
    };
  }
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript, svg, iframe, link, meta").forEach((n) => n.remove());
  // Strip every attribute except href/src/alt — keeps the structural signal
  // (links, anchors, alt text) and discards inline styles + framework data-
  // attributes that bloat the HTML 10×.
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (!["href", "src", "alt"].includes(attr.name)) el.removeAttribute(attr.name);
    }
  });
  return {
    text: (clone.innerText || "").trim(),
    html: clone.innerHTML,
    url: window.location.href,
    title: document.title,
  };
}
