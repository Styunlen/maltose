import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./admin.css";

const container = document.getElementById("maltose-admin-root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
