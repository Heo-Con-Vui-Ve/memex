// Content script: respond to a one-shot message asking for the current selection
// + page metadata. Kept tiny to avoid bloating every page's JS.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "capture-selection") return false;
  const selection = window.getSelection()?.toString() ?? "";
  sendResponse({
    text: selection,
    url: window.location.href,
    title: document.title,
  });
  return true;
});
export {};
