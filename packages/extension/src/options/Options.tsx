import { useEffect, useState } from "react";
import { is, request } from "../lib/rpc";
import type { HostResponse } from "@notepad-ai/shared";

type Pong = Extract<HostResponse, { type: "pong" }>;
type Status = { kind: "checking" } | { kind: "ok"; pong: Pong } | { kind: "fail"; message: string };

export function Options() {
  const [status, setStatus] = useState<Status>({ kind: "checking" });

  async function check() {
    setStatus({ kind: "checking" });
    try {
      const pong = await request({ type: "host.ping" }, is.pong);
      setStatus({ kind: "ok", pong });
    } catch (err) {
      setStatus({ kind: "fail", message: (err as Error).message });
    }
  }

  useEffect(() => {
    void check();
  }, []);

  return (
    <div className="options-shell">
      <h1>notepad-ai · settings</h1>

      <section className="card">
        <header>
          <h2>Native host</h2>
          <button onClick={() => void check()}>Re-check</button>
        </header>
        {status.kind === "checking" && <p>Pinging native host…</p>}
        {status.kind === "fail" && (
          <div className="bad">
            <p><strong>Host unreachable.</strong> {status.message}</p>
            <pre>{`# Register the host (run once):
pnpm host:install -- --extension-id ${chrome.runtime.id}

Then restart Chrome.`}</pre>
          </div>
        )}
        {status.kind === "ok" && (
          <dl className="kv">
            <dt>Host version</dt><dd>{status.pong.hostVersion}</dd>
            <dt>Node</dt><dd>{status.pong.nodeVersion}</dd>
            <dt>claude CLI</dt>
            <dd>
              {status.pong.claudePath
                ? `${status.pong.claudeVersion ?? "?"} (${status.pong.claudePath})`
                : <span className="bad">not on PATH</span>}
            </dd>
            <dt>SQLite DB</dt><dd>{status.pong.dbPath}</dd>
            <dt>Extension ID</dt><dd>{chrome.runtime.id}</dd>
          </dl>
        )}
      </section>

      <section className="card">
        <h2>About</h2>
        <p>
          notepad-ai stores all notes locally in SQLite via the native host.
          The Claude CLI on your machine handles all AI processing — no API keys, no external calls.
        </p>
      </section>
    </div>
  );
}
