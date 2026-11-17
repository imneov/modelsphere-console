import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "@/shell/App";
import { ErrorBoundary } from "@/shell/ErrorBoundary";
import { modules } from "@/modules";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App modules={modules} />
    </ErrorBoundary>
  </StrictMode>,
);
