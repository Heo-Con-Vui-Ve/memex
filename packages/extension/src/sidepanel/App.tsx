import { useState } from "react";
import { ChatView } from "./chat/ChatView";
import { NotesView } from "./notes/NotesView";

type Tab = "chat" | "notes";

export function App() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="sp-root">
      <nav className="sp-tabs">
        <button
          className={"sp-tab" + (tab === "chat" ? " is-active" : "")}
          onClick={() => setTab("chat")}
        >
          <span className="sp-tab-dot" /> Chat
        </button>
        <button
          className={"sp-tab" + (tab === "notes" ? " is-active" : "")}
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
      </nav>
      <div className="sp-tab-body">
        {tab === "chat" ? <ChatView /> : <NotesView />}
      </div>
    </div>
  );
}
