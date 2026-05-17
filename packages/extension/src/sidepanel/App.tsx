import { useEffect, useState } from "react";
import { ChatView } from "./chat/ChatView";
import { NotesView } from "./notes/NotesView";
import { CommandPalette } from "./palette/CommandPalette";
import { Icon } from "../lib/Icons";

type Tab = "chat" | "notes";

export function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K opens the command palette globally.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="sp-root">
      <nav className="sp-tabs">
        <button
          className={"sp-tab" + (tab === "chat" ? " is-active" : "")}
          onClick={() => setTab("chat")}
        >
          <Icon.Chat size={13} /> Chat
        </button>
        <button
          className={"sp-tab" + (tab === "notes" ? " is-active" : "")}
          onClick={() => setTab("notes")}
        >
          <Icon.Notes size={13} /> Notes
        </button>
        <button
          className="sp-tab sp-tab-end"
          onClick={() => setPaletteOpen(true)}
          title="Command palette (⌘K)"
        >
          <Icon.Command size={13} />
          <kbd>⌘K</kbd>
        </button>
      </nav>
      <div className="sp-tab-body">
        {tab === "chat" ? <ChatView /> : <NotesView />}
      </div>
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onAction={(a) => {
            setPaletteOpen(false);
            if (a === "open-chat") setTab("chat");
            if (a === "open-notes") setTab("notes");
            if (a === "open-options") chrome.runtime.openOptionsPage();
          }}
        />
      )}
    </div>
  );
}
