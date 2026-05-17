import { defineManifest } from "@crxjs/vite-plugin";
import { HOST_NAME } from "@notepad-ai/shared";

export default defineManifest({
  manifest_version: 3,
  name: "notepad-ai",
  version: "0.1.0",
  description: "AI-powered second brain backed by your local Claude CLI",
  minimum_chrome_version: "114",
  action: {
    default_title: "notepad-ai · quick capture",
    default_popup: "src/popup/index.html",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/selectionCapture.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["nativeMessaging", "sidePanel", "storage", "activeTab", "scripting"],
  host_permissions: ["<all_urls>"],
  // Match the host name we registered in the native messaging manifest.
  // (Documentation hint — Chrome looks this up from the host manifest, not from here.)
  // Host name in use: see HOST_NAME = "${HOST_NAME}" in @notepad-ai/shared.
  // (Including the import above forces a typecheck on the symbol.)
});

void HOST_NAME;
