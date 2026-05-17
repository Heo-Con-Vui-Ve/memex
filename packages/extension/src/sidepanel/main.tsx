import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installTheme } from "../lib/theme";
import { installLang } from "../lib/i18n";

installTheme();
installLang();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
