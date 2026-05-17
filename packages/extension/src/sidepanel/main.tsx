import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installTheme } from "../lib/theme";

installTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
