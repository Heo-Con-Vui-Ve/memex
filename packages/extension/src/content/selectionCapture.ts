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
    // Quick-and-dirty readable text grab. A real "Reader Mode" extraction is
    // Phase 2 (Readability.js-style); for now we strip script/style and grab
    // body.innerText which the browser already collapses to readable text.
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, svg, iframe").forEach((n) => n.remove());
    sendResponse({
      text: (clone.innerText || "").trim(),
      url: window.location.href,
      title: document.title,
    });
    return true;
  }
  return false;
});
export {};
