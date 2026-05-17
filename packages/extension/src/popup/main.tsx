import React from "react";
import { createRoot } from "react-dom/client";
import { QuickCapture } from "./QuickCapture";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuickCapture />
  </React.StrictMode>,
);
