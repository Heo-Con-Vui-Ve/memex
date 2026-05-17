import { useEffect, useRef, useState } from "react";
import { newNote } from "@notepad-ai/shared";
import { is, request } from "../lib/rpc";

interface PageCapture {
  text: string;
  url: string;
  title: string;
}

async function captureFromActiveTab(): Promise<PageCapture> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { text: "", url: "", title: "" };
  try {
    return (await chrome.tabs.sendMessage(tab.id, { type: "capture-selection" })) as PageCapture;
  } catch {
    return { text: "", url: tab.url ?? "", title: tab.title ?? "" };
  }
}

export function QuickCapture() {
  const [body, setBody] = useState("");
  const [source, setSource] = useState<{ url: string; title: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    captureFromActiveTab().then((cap) => {
      if (cap.text) setBody(cap.text);
      setSource({ url: cap.url, title: cap.title });
      setTimeout(() => ref.current?.focus(), 0);
    });
  }, []);

  async function save() {
    if (!body.trim()) return;
    setStatus("saving");
    try {
      const note = newNote({
        contentMd: body,
        sourceUrl: source?.url,
        sourceTitle: source?.title,
      });
      await request(
        {
          type: "notes.upsert",
          payload: { note: { ...note, sourceUrl: note.sourceUrl ?? null, sourceTitle: note.sourceTitle ?? null } },
        },
        is.upsertResult,
      );
      setStatus("saved");
      setTimeout(() => window.close(), 500);
    } catch (err) {
      setStatus("error");
      setErrorMsg((err as Error).message);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
    if (e.key === "Escape") window.close();
  }

  return (
    <div className="quick-capture" onKeyDown={onKey}>
      <header className="qc-header">
        <span className="qc-dot" /> Quick capture
        {source?.title && <span className="qc-source" title={source.url}>· {source.title}</span>}
      </header>
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Drop a thought, paste a link, save selected text…"
        rows={8}
      />
      <footer className="qc-footer">
        <span className="qc-hint">⌘↵ save · esc close</span>
        <button onClick={() => void save()} disabled={status === "saving" || !body.trim()}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save"}
        </button>
      </footer>
      {status === "error" && <div className="qc-error">{errorMsg}</div>}
    </div>
  );
}
