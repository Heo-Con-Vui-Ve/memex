import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Memex",
  version: "0.1.0",
  description: "AI-augmented second brain — notes that think with you, backed by your local Claude CLI",
  minimum_chrome_version: "116",
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_title: "Memex · open side panel",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
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
});
