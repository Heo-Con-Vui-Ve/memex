import { useEffect, useState } from "react";
import { is, request } from "../lib/rpc";
import type { HostResponse } from "@memex/shared";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "../lib/theme";

type Pong = Extract<HostResponse, { type: "pong" }>;
type Status = { kind: "checking" } | { kind: "ok"; pong: Pong } | { kind: "fail"; message: string };

type ProviderName = "claude" | "openai" | "ollama";

interface ProviderSettings {
  provider: ProviderName;
  openaiApiKey: string;
  openaiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
}

async function readSetting(key: string): Promise<string | null> {
  const r = await request({ type: "settings.get", payload: { key } }, is.settingGet);
  return r.value;
}
async function writeSetting(key: string, value: string): Promise<void> {
  await request({ type: "settings.set", payload: { key, value } }, is.settingSet);
}

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; latencyMs: number; sample: string; provider: string }
  | { kind: "fail"; message: string; provider: string };

export function Options() {
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [settings, setSettings] = useState<ProviderSettings>({
    provider: "claude",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    ollamaUrl: "http://127.0.0.1:11434",
    ollamaModel: "llama3.2",
  });
  const [savedFlash, setSavedFlash] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice());

  async function check() {
    setStatus({ kind: "checking" });
    try {
      const pong = await request({ type: "host.ping" }, is.pong);
      setStatus({ kind: "ok", pong });
    } catch (err) {
      setStatus({ kind: "fail", message: (err as Error).message });
    }
  }

  async function loadSettings() {
    try {
      const [p, k, om, ou, lm] = await Promise.all([
        readSetting("ai.provider"),
        readSetting("ai.openai.apiKey"),
        readSetting("ai.openai.model"),
        readSetting("ai.ollama.url"),
        readSetting("ai.ollama.model"),
      ]);
      setSettings({
        provider: (p as ProviderName) || "claude",
        openaiApiKey: k || "",
        openaiModel: om || "gpt-4o-mini",
        ollamaUrl: ou || "http://127.0.0.1:11434",
        ollamaModel: lm || "llama3.2",
      });
    } catch { /* fall back to defaults */ }
  }

  async function saveSettings() {
    await Promise.all([
      writeSetting("ai.provider", settings.provider),
      writeSetting("ai.openai.apiKey", settings.openaiApiKey),
      writeSetting("ai.openai.model", settings.openaiModel),
      writeSetting("ai.ollama.url", settings.ollamaUrl),
      writeSetting("ai.ollama.model", settings.ollamaModel),
    ]);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  async function testProvider() {
    setTest({ kind: "running" });
    try {
      // Always save first so the host has the freshest values to test against.
      await saveSettings();
      const res = await request(
        { type: "provider.test", payload: { provider: settings.provider } },
        is.providerTest,
      );
      if (res.ok) {
        setTest({ kind: "ok", latencyMs: res.latencyMs, sample: res.sample, provider: res.provider });
      } else {
        setTest({ kind: "fail", message: res.errorMessage ?? "Unknown error", provider: res.provider });
      }
    } catch (err) {
      setTest({ kind: "fail", message: (err as Error).message, provider: settings.provider });
    }
  }

  useEffect(() => {
    void check();
    void loadSettings();
  }, []);

  return (
    <div className="options-shell">
      <h1>Memex · settings</h1>

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
cd /Users/trantan/Dev/Personal/notepad-ai
pnpm host:install --extension-id ${chrome.runtime.id}

# then Cmd+Q quit Chrome and reopen.`}</pre>
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
        <header>
          <h2>AI provider</h2>
          <div className="card-actions">
            <button
              onClick={() => void testProvider()}
              disabled={test.kind === "running" || status.kind !== "ok"}
              title={status.kind !== "ok" ? "Native host must be reachable first" : "Test the chosen provider"}
            >
              {test.kind === "running" ? "Testing…" : "Test connection"}
            </button>
            <button className="primary" onClick={() => void saveSettings()}>
              {savedFlash ? "Saved ✓" : "Save"}
            </button>
          </div>
        </header>

        {test.kind === "ok" && (
          <div className="test-result test-ok">
            <strong>✓ {test.provider}</strong> responded in {test.latencyMs} ms.
            {test.sample && <span className="test-sample">Sample: <code>{test.sample}</code></span>}
          </div>
        )}
        {test.kind === "fail" && (
          <div className="test-result test-fail">
            <strong>✘ {test.provider} failed:</strong> {test.message}
          </div>
        )}
        <div className="form-grid">
          <label>
            <span>Provider</span>
            <select
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value as ProviderName })}
            >
              <option value="claude">Claude CLI (local)</option>
              <option value="openai">OpenAI API</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </label>

          {settings.provider === "openai" && (
            <>
              <label>
                <span>OpenAI API key</span>
                <input
                  type="password"
                  placeholder="sk-…"
                  value={settings.openaiApiKey}
                  onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                />
              </label>
              <label>
                <span>Model</span>
                <input
                  value={settings.openaiModel}
                  onChange={(e) => setSettings({ ...settings, openaiModel: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </label>
            </>
          )}

          {settings.provider === "ollama" && (
            <>
              <label>
                <span>Ollama URL</span>
                <input
                  value={settings.ollamaUrl}
                  onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
                  placeholder="http://127.0.0.1:11434"
                />
              </label>
              <label>
                <span>Model</span>
                <input
                  value={settings.ollamaModel}
                  onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                  placeholder="llama3.2"
                />
              </label>
            </>
          )}

          {settings.provider === "claude" && (
            <p className="muted">
              Uses your local <code>claude</code> CLI auth. No API key needed.
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <header><h2>Appearance</h2></header>
        <div className="theme-row">
          {(["system", "dark", "light"] as ThemeChoice[]).map((opt) => (
            <button
              key={opt}
              className={"theme-pick" + (theme === opt ? " is-active" : "")}
              onClick={() => {
                setTheme(opt);
                setThemeChoice(opt);
              }}
            >
              <span className={`theme-swatch theme-swatch-${opt}`} />
              <span>{opt[0]!.toUpperCase() + opt.slice(1)}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          System follows your OS dark-mode preference. Persisted in localStorage so it loads instantly.
        </p>
      </section>

      <section className="card">
        <h2>About</h2>
        <p>
          Memex stores all notes locally in SQLite via the native host. The
          chosen AI provider runs on your machine (Claude CLI / Ollama) or against
          your own API key (OpenAI) — there is no Memex backend.
          The name nods to Vannevar Bush's 1945 essay <em>As We May Think</em>.
        </p>
      </section>
    </div>
  );
}
