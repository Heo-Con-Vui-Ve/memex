import { useEffect, useState } from "react";
import { is, request } from "../lib/rpc";
import type { HostResponse } from "@memex/shared";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "../lib/theme";
import { useT, useLang, type Lang } from "../lib/i18n";

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
  const tr = useT();
  const [lang, setLang] = useLang();
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
    const results = await Promise.allSettled([
      readSetting("ai.provider"),
      readSetting("ai.openai.apiKey"),
      readSetting("ai.openai.model"),
      readSetting("ai.ollama.url"),
      readSetting("ai.ollama.model"),
    ]);
    const [p, k, om, ou, lm] = results.map((r) => (r.status === "fulfilled" ? r.value : null));
    setSettings({
      provider: (p as ProviderName) || "claude",
      openaiApiKey: k || "",
      openaiModel: om || "gpt-4o-mini",
      ollamaUrl: ou || "http://127.0.0.1:11434",
      ollamaModel: lm || "llama3.2",
    });
  }

  async function saveSettings() {
    const results = await Promise.allSettled([
      writeSetting("ai.provider", settings.provider),
      writeSetting("ai.openai.apiKey", settings.openaiApiKey),
      writeSetting("ai.openai.model", settings.openaiModel),
      writeSetting("ai.ollama.url", settings.ollamaUrl),
      writeSetting("ai.ollama.model", settings.ollamaModel),
    ]);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) {
      setTest({ kind: "fail", message: (failure.reason as Error).message, provider: settings.provider });
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  async function testProvider() {
    setTest({ kind: "running" });
    try {
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
    check().catch(() => {});
    loadSettings().catch(() => {});
  }, []);

  return (
    <div className="options-shell">
      <h1>{tr.optTitle}</h1>

      <section className="card">
        <header>
          <h2>{tr.optNativeHost}</h2>
          <button onClick={() => { check().catch(() => {}); }}>{tr.optRecheck}</button>
        </header>
        {status.kind === "checking" && <p>{tr.optPinging}</p>}
        {status.kind === "fail" && (
          <div className="bad">
            <p><strong>{tr.optHostUnreachable}</strong> {status.message}</p>
            <pre>{`# Register the host (run once):
cd /Users/trantan/Dev/Personal/memex
pnpm host:install --extension-id ${chrome.runtime.id}

# then Cmd+Q quit Chrome and reopen.`}</pre>
          </div>
        )}
        {status.kind === "ok" && (
          <dl className="kv">
            <dt>{tr.optHostVersion}</dt><dd>{status.pong.hostVersion}</dd>
            <dt>{tr.optNode}</dt><dd>{status.pong.nodeVersion}</dd>
            <dt>{tr.optClaudeCli}</dt>
            <dd>
              {status.pong.claudePath
                ? `${status.pong.claudeVersion ?? "?"} (${status.pong.claudePath})`
                : <span className="bad">{tr.optNotOnPath}</span>}
            </dd>
            <dt>{tr.optSqliteDb}</dt><dd>{status.pong.dbPath}</dd>
            <dt>{tr.optExtensionId}</dt><dd>{chrome.runtime.id}</dd>
          </dl>
        )}
      </section>

      <section className="card">
        <header>
          <h2>{tr.optAiProvider}</h2>
          <div className="card-actions">
            <button
              onClick={() => { testProvider().catch(() => {}); }}
              disabled={test.kind === "running" || status.kind !== "ok"}
              title={status.kind !== "ok" ? tr.optTestNeedsHostTip : tr.optTestConnTip}
            >
              {test.kind === "running" ? tr.optTesting : tr.optTestConn}
            </button>
            <button className="primary" onClick={() => { saveSettings().catch(() => {}); }}>
              {savedFlash ? tr.optSavedFlash : tr.optSave}
            </button>
          </div>
        </header>

        {test.kind === "ok" && (
          <div className="test-result test-ok">
            <strong>✓ {test.provider}</strong> {tr.optTestRespondedIn(test.latencyMs)}
            {test.sample && <span className="test-sample">{tr.optTestSampleLabel}: <code>{test.sample}</code></span>}
          </div>
        )}
        {test.kind === "fail" && (
          <div className="test-result test-fail">
            <strong>✘ {tr.optTestFailed(test.provider)}</strong> {test.message}
          </div>
        )}
        <div className="form-grid">
          <label>
            <span>{tr.optProvider}</span>
            <select
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value as ProviderName })}
            >
              <option value="claude">{tr.optClaudeCliOpt}</option>
              <option value="openai">{tr.optOpenaiOpt}</option>
              <option value="ollama">{tr.optOllamaOpt}</option>
            </select>
          </label>

          {settings.provider === "openai" && (
            <>
              <label>
                <span>{tr.optOpenaiKey}</span>
                <input
                  type="password"
                  placeholder="sk-…"
                  value={settings.openaiApiKey}
                  onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                />
              </label>
              <label>
                <span>{tr.optModel}</span>
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
                <span>{tr.optOllamaUrl}</span>
                <input
                  value={settings.ollamaUrl}
                  onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
                  placeholder="http://127.0.0.1:11434"
                />
              </label>
              <label>
                <span>{tr.optModel}</span>
                <input
                  value={settings.ollamaModel}
                  onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                  placeholder="llama3.2"
                />
              </label>
            </>
          )}

          {settings.provider === "claude" && (
            <p className="muted">{tr.optClaudeHint}</p>
          )}
        </div>
      </section>

      <section className="card">
        <header><h2>{tr.optLanguage}</h2></header>
        <div className="theme-row">
          {(["vi", "en"] as Lang[]).map((opt) => (
            <button
              key={opt}
              className={"theme-pick" + (lang === opt ? " is-active" : "")}
              onClick={() => setLang(opt)}
            >
              <span>{opt === "vi" ? tr.optLangVi : tr.optLangEn}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <header><h2>{tr.optAppearance}</h2></header>
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
              <span>{opt === "system" ? tr.optThemeSystem : opt === "dark" ? tr.optThemeDark : tr.optThemeLight}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{tr.optThemeHint}</p>
      </section>

      <section className="card">
        <h2>{tr.optAbout}</h2>
        <p>{tr.optAboutBody}</p>
      </section>
    </div>
  );
}
