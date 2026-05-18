import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newNote } from "@memex/shared";
import { Icon } from "../../lib/Icons";
import { t, useT } from "../../lib/i18n";
import { is, request } from "../../lib/rpc";

/**
 * Meet recording surface. The Meet tab's content script (meetCapture.ts) owns
 * the captions observer and the segment buffer; this component is a thin
 * remote control + live viewer over it. We talk to the content script with
 * chrome.tabs.sendMessage and subscribe to its broadcasts via
 * chrome.runtime.onMessage. Architecture choice (vs routing through the
 * service worker): the content script is the only durable buffer — it
 * survives side panel close/reopen, dies when the tab closes (which is also
 * "meeting over"). Routing through the SW would add a layer that buys
 * nothing for the MVP.
 */

interface CaptionSegment {
  id: string;
  speaker: string;
  text: string;
  startedAt: number;
}

interface MeetProbeResponse {
  active: boolean;
  detected: boolean;
  tabUrl: string;
  meetingTitle: string;
  startedAt: number;
  finals: CaptionSegment[];
  live: CaptionSegment[];
}

type Phase =
  | { kind: "scanning" }
  | { kind: "noMeet" }
  | { kind: "ready"; tabId: number; tabUrl: string; meetingTitle: string }
  | { kind: "recording"; tabId: number; tabUrl: string; meetingTitle: string; startedAt: number; detected: boolean };

interface Props {
  onBack: () => void;
  onSaved: () => void;
}

export function MeetRecorder({ onBack, onSaved }: Props) {
  const tr = useT();
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [finals, setFinals] = useState<CaptionSegment[]>([]);
  const [live, setLive] = useState<Map<string, CaptionSegment>>(new Map());
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const scan = useCallback(async () => {
    const tabs = await chrome.tabs.query({ url: ["https://meet.google.com/*"] });
    const tab = tabs.find((t) => t.id != null);
    if (!tab?.id) {
      setPhase({ kind: "noMeet" });
      return;
    }
    try {
      // The Meet tab may have been opened before the extension was loaded or
      // reloaded, in which case the static content_scripts entry never fired
      // for that tab. Inject lazily on demand — same fallback shape we use
      // for selection capture elsewhere.
      await ensureMeetContentScript(tab.id);
      const probe = (await chrome.tabs.sendMessage(tab.id, { type: "meet:probe" })) as MeetProbeResponse | undefined;
      if (!probe) {
        setPhase({ kind: "ready", tabId: tab.id, tabUrl: tab.url ?? "", meetingTitle: tab.title ?? tr.meetFallbackTitle });
        return;
      }
      const meetingTitle = probe.meetingTitle || tab.title || tr.meetFallbackTitle;
      if (probe.active) {
        setFinals(probe.finals);
        const liveMap = new Map<string, CaptionSegment>();
        probe.live.forEach((s) => liveMap.set(s.id, s));
        setLive(liveMap);
        setPhase({
          kind: "recording",
          tabId: tab.id,
          tabUrl: probe.tabUrl,
          meetingTitle,
          startedAt: probe.startedAt,
          detected: probe.detected,
        });
      } else {
        setPhase({ kind: "ready", tabId: tab.id, tabUrl: tab.url ?? "", meetingTitle });
      }
    } catch (err) {
      // Injection or probe still failed (rare: restricted URL, crashed tab,
      // chrome:// origin). Fall through to ready state so the user at least
      // gets a Start button — clicking it will retry the injection path.
      setPhase({ kind: "ready", tabId: tab.id, tabUrl: tab.url ?? "", meetingTitle: tab.title ?? tr.meetFallbackTitle });
      // Surface a hint to help debugging when the injection path itself failed.
      const msg = (err as Error).message ?? String(err);
      if (msg.toLowerCase().includes("cannot access")) setError(msg);
    }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  // Listen for live broadcasts from the content script.
  useEffect(() => {
    const handler = (msg: any) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "meet:caption-delta") {
        const s = msg.segment as CaptionSegment;
        setLive((prev) => {
          const next = new Map(prev);
          next.set(s.id, s);
          return next;
        });
      } else if (msg.type === "meet:caption-final") {
        const s = msg.segment as CaptionSegment;
        setLive((prev) => {
          const next = new Map(prev);
          next.delete(s.id);
          return next;
        });
        setFinals((prev) => [...prev, s]);
      } else if (msg.type === "meet:captions-status") {
        setPhase((p) => (p.kind === "recording" ? { ...p, detected: !!msg.detected } : p));
      } else if (msg.type === "meet:ended") {
        // The content script tore down (tab navigated, meeting hung up).
        // Don't blow away the transcript here — the user may still want to
        // save what we got. Just demote to "ready" so they can press save.
        setPhase((p) => (p.kind === "recording" ? { kind: "ready", tabId: p.tabId, tabUrl: p.tabUrl, meetingTitle: p.meetingTitle } : p));
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Auto-scroll the transcript to the bottom as new lines arrive.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [finals.length, live]);

  const orderedSegments = useMemo(() => {
    const all = [...finals, ...Array.from(live.values())];
    all.sort((a, b) => a.startedAt - b.startedAt);
    // Collapse consecutive segments from the same speaker into one bubble.
    // Meet emits a fresh caption block for every ~1s of refinement, and
    // sometimes a bare "<Speaker Name>" block between utterances — both
    // produce visual noise that maps to a single human turn.
    const merged: CaptionSegment[] = [];
    for (const s of all) {
      const cleanedText = cleanFragment(s.text, s.speaker);
      if (!cleanedText) continue;
      const prev = merged[merged.length - 1];
      if (prev && prev.speaker === s.speaker) {
        const joined = mergeText(prev.text, cleanedText);
        if (joined !== prev.text) {
          // Keep the earlier id so the bubble doesn't jump in the DOM when
          // a new live delta arrives that we just absorbed.
          merged[merged.length - 1] = { ...prev, text: joined };
        }
      } else {
        merged.push({ ...s, text: cleanedText });
      }
    }
    return merged;
  }, [finals, live]);

  async function startRecording() {
    if (phase.kind !== "ready") return;
    try {
      // Make sure the content script is alive on this tab before we ask it
      // to start. Idempotent — duplicate injection is harmless because the
      // script module-init is a no-op past the first run (browser de-dupes).
      await ensureMeetContentScript(phase.tabId);
      // Pass localized headings so the autosave fallback path (fires when
      // the user closes the Meet tab without coming back to press Save)
      // produces a note in the same locale as the manual save path.
      await chrome.tabs.sendMessage(phase.tabId, {
        type: "meet:start",
        headings: {
          noteHeading: tr.meetNoteHeading,
          transcriptHeading: tr.meetTranscriptHeading,
          noteEmpty: tr.meetNoteEmpty,
          fallbackTitle: tr.meetFallbackTitle,
        },
      });
      setFinals([]);
      setLive(new Map());
      setPhase({ kind: "recording", tabId: phase.tabId, tabUrl: phase.tabUrl, meetingTitle: phase.meetingTitle, startedAt: Date.now(), detected: false });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function stopAndSave() {
    if (phase.kind !== "recording") return;
    try {
      const resp = (await chrome.tabs.sendMessage(phase.tabId, { type: "meet:stop" })) as
        | { ok: true; transcript: { finals: CaptionSegment[]; live: CaptionSegment[]; startedAt: number; meetingTitle: string; tabUrl: string } }
        | undefined;
      const finalFinals = resp?.transcript.finals ?? finals;
      const finalLive = resp?.transcript.live ?? Array.from(live.values());
      const startedAt = resp?.transcript.startedAt ?? phase.startedAt;
      const meetingTitle = resp?.transcript.meetingTitle || phase.meetingTitle;
      const tabUrl = resp?.transcript.tabUrl || phase.tabUrl;

      const md = renderMarkdown({ meetingTitle, tabUrl, startedAt, endedAt: Date.now(), segments: [...finalFinals, ...finalLive].sort((a, b) => a.startedAt - b.startedAt) });
      const created = newNote({
        contentMd: md,
        title: meetingTitle,
        sourceUrl: tabUrl,
        sourceTitle: meetingTitle,
        tags: ["meeting"],
      });
      await request(
        { type: "notes.upsert", payload: { note: { ...created, sourceUrl: created.sourceUrl ?? null, sourceTitle: created.sourceTitle ?? null } } },
        is.upsertResult,
      );
      setSavedFlash(true);
      onSaved();
      setTimeout(() => onBack(), 600);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function discard() {
    if (phase.kind === "recording") {
      try { await chrome.tabs.sendMessage(phase.tabId, { type: "meet:stop" }); } catch {}
    }
    setFinals([]);
    setLive(new Map());
    onBack();
  }

  return (
    <div className="meet-root">
      <div className="meet-top">
        <button className="ghost icon-only" onClick={onBack} aria-label={tr.meetBack} title={tr.meetBack}>
          <Icon.X size={14} />
        </button>
        <div className="meet-top-title">
          {phase.kind === "recording" ? (
            <>
              <RecordingDot />
              <span className="meet-title-text" title={phase.meetingTitle}>{phase.meetingTitle}</span>
              <Duration startedAt={phase.startedAt} />
            </>
          ) : (
            <span className="meet-title-text">{tr.recordMeeting}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button className="ghost banner-x" onClick={() => setError(null)} aria-label={tr.dismiss}>
            <Icon.X size={14} />
          </button>
        </div>
      )}

      {phase.kind === "scanning" && (
        <div className="empty"><Icon.Loader size={18} /> <span>{tr.meetScanning}</span></div>
      )}

      {phase.kind === "noMeet" && (
        <div className="empty empty-big">
          <Icon.Mic size={28} />
          <h3>{tr.meetNoTab}</h3>
          <p>{tr.meetNoTabHint}</p>
          <button className="ghost" onClick={() => void scan()}>{tr.meetScanning}</button>
        </div>
      )}

      {phase.kind === "ready" && (
        <div className="empty empty-big">
          <Icon.Mic size={28} />
          <h3>{phase.meetingTitle}</h3>
          <p>{tr.meetCaptionsOffHint}</p>
          <button className="primary" onClick={() => void startRecording()}>
            <Icon.Mic size={14} /> {tr.meetStart}
          </button>
        </div>
      )}

      {phase.kind === "recording" && (
        <>
          <div className={"meet-status " + (phase.detected ? "is-ok" : "is-warn")}>
            <Icon.Dot size={10} />
            <span>{phase.detected ? tr.meetCaptionsOn : tr.meetCaptionsOff}</span>
            {!phase.detected && <span className="meet-status-hint">— {tr.meetCaptionsOffHint}</span>}
          </div>
          <div className="meet-transcript">
            {orderedSegments.length === 0 ? (
              <div className="empty"><span>{tr.meetEmptyTranscript}</span></div>
            ) : (
              orderedSegments.map((s, i) => (
                <div key={s.id} className={"meet-seg" + (live.has(s.id) ? " is-live" : "")}>
                  <div className="meet-seg-head">
                    <span className="meet-seg-speaker">{s.speaker}</span>
                    <span className="meet-seg-time">{formatTime(s.startedAt - phase.startedAt)}</span>
                  </div>
                  <div className="meet-seg-text">{s.text}</div>
                  {i === orderedSegments.length - 1 && <div ref={transcriptEndRef} />}
                </div>
              ))
            )}
          </div>
          <div className="meet-footer">
            <button className="ghost danger" onClick={() => void discard()}>
              <Icon.Trash size={14} /> {tr.meetDiscard}
            </button>
            <button className="primary" onClick={() => void stopAndSave()} disabled={savedFlash}>
              <Icon.Stop size={14} /> {savedFlash ? tr.meetSaved : tr.meetStopSave}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RecordingDot() {
  return <span className="rec-dot" aria-label={t().meetRecordingTitle} />;
}

function Duration({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="meet-duration">{formatDuration(now - startedAt)}</span>;
}

// Cache: looking up the manifest is cheap but redundant, and dist paths
// don't change between extension reloads within a session.
let cachedMeetScriptFiles: string[] | null = null;

async function ensureMeetContentScript(tabId: number): Promise<void> {
  if (!cachedMeetScriptFiles) {
    // crxjs rewrites the manifest at build time so the hashed asset path is
    // what's actually shipped. Read the deployed manifest to find it instead
    // of trying to import the source path (which doesn't exist in dist).
    const res = await fetch(chrome.runtime.getURL("manifest.json"));
    const m = await res.json();
    const entry = (m.content_scripts ?? []).find((cs: { matches?: string[] }) =>
      (cs.matches ?? []).some((p) => p.includes("meet.google.com")),
    );
    if (!entry?.js?.length) throw new Error(t().meetScriptMissing);
    cachedMeetScriptFiles = entry.js as string[];
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: cachedMeetScriptFiles });
  } catch (err) {
    // Tabs on chrome://, the Web Store, or that disallow scripting will
    // throw here. Re-throw with a clearer message for the caller to display.
    throw new Error(t().meetInjectFailed((err as Error).message));
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatTime(offsetMs: number): string {
  return formatDuration(Math.max(0, offsetMs));
}

function renderMarkdown(input: {
  meetingTitle: string;
  tabUrl: string;
  startedAt: number;
  endedAt: number;
  segments: CaptionSegment[];
}): string {
  const start = new Date(input.startedAt);
  const startStr = start.toLocaleString();
  const durationStr = formatDuration(input.endedAt - input.startedAt);

  const tr = t();
  const lines: string[] = [];
  lines.push(`# ${input.meetingTitle || tr.meetNoteHeading}`);
  lines.push("");
  lines.push(`> ${startStr} · ${durationStr}`);
  lines.push(`> [${input.tabUrl}](${input.tabUrl})`);
  lines.push("");
  lines.push(`## ${tr.meetTranscriptHeading}`);
  lines.push("");
  if (input.segments.length === 0) {
    lines.push(tr.meetNoteEmpty);
  } else {
    for (const s of input.segments) {
      const t = formatTime(s.startedAt - input.startedAt);
      lines.push(`**[${t}]** _${s.speaker}_: ${s.text}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

/** Drop fragments that are just the speaker name (volatile name-only blocks
 *  Meet renders briefly between utterances). */
function cleanFragment(text: string, speaker: string): string {
  const t = text.trim();
  if (!t) return "";
  if (t.toLowerCase() === speaker.toLowerCase()) return "";
  // Sometimes the block emits "Speaker Name" as a prefix to nothing.
  const stripped = t.replace(new RegExp(`^${escapeRegExp(speaker)}\\s*`, "i"), "").trim();
  if (!stripped && t.length < 40) return "";
  return t;
}

/** Live captions refine in-place: a later snapshot is often a superset of
 *  the earlier one. Prefer the superset when one contains the other; else
 *  concatenate with a space. */
function mergeText(prev: string, next: string): string {
  if (next === prev) return prev;
  if (next.startsWith(prev)) return next;
  if (prev.startsWith(next)) return prev;
  // Pick the join character based on whether prev ends with a sentence
  // terminator — avoids "...done. .Em có..." double-space artefacts.
  const sep = /[.!?…。？！]$/.test(prev) ? " " : " ";
  return prev + sep + next;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
