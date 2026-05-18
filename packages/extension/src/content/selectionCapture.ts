// Content script: respond to one-shot messages from the popup/sw asking for
// either the user's current selection or the whole readable page text.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "capture-selection") {
    sendResponse({
      text: window.getSelection()?.toString() ?? "",
      url: window.location.href,
      title: document.title,
    });
    return true;
  }
  if (msg?.type === "capture-page") {
    // Return cleaned HTML alongside plain text — the side panel converts the
    // HTML to markdown via turndown so headings/lists/links/code survive.
    // Plain text remains as a fallback when HTML→MD conversion produces an
    // empty string (e.g. very weird DOMs).
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, svg, iframe, link, meta").forEach((n) => n.remove());
    // Drop every attribute except a small structural allowlist so the HTML
    // doesn't drag along framework garbage / inline CSS / data-* hashes.
    clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        if (!["href", "src", "alt"].includes(attr.name)) el.removeAttribute(attr.name);
      }
    });
    sendResponse({
      text: (clone.innerText || "").trim(),
      html: clone.innerHTML,
      url: window.location.href,
      title: document.title,
    });
    return true;
  }
  return false;
});
export {};
