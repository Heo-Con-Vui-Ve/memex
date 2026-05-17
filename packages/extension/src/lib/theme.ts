/**
 * Theme: dark | light | system. Persisted in localStorage so all
 * extension surfaces (sidepanel + options) pick it up immediately on
 * load without an RPC round-trip. System mode tracks the user's OS
 * preference via prefers-color-scheme.
 */

export type ThemeChoice = "dark" | "light" | "system";
export type EffectiveTheme = "dark" | "light";

const STORAGE_KEY = "memex.theme";

export function getThemeChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") return raw;
  } catch {}
  return "system";
}

export function setThemeChoice(choice: ThemeChoice): void {
  try { localStorage.setItem(STORAGE_KEY, choice); } catch {}
  apply(choice);
}

export function effectiveTheme(choice: ThemeChoice = getThemeChoice()): EffectiveTheme {
  if (choice === "dark" || choice === "light") return choice;
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

function apply(choice: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", effectiveTheme(choice));
  notifyListeners();
}

/**
 * Install theme on document ASAP (before React renders) to avoid flash.
 * Call once at the top of each surface entry (main.tsx).
 */
export function installTheme(): void {
  apply(getThemeChoice());
  // Re-apply if user changes OS preference while we're in system mode.
  window.matchMedia?.("(prefers-color-scheme: light)")?.addEventListener?.("change", () => {
    if (getThemeChoice() === "system") apply("system");
  });
}

// --- Pub/sub for components that need to react to theme changes ---
type Listener = (t: EffectiveTheme) => void;
const listeners = new Set<Listener>();
function notifyListeners() {
  const t = effectiveTheme();
  listeners.forEach((fn) => fn(t));
}
export function onThemeChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
