import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "@/shell/App";
import { modules } from "@/modules";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App modules={modules} />
  </StrictMode>,
);
