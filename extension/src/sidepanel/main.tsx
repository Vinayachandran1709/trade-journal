import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import SidepanelErrorBoundary from "./SidepanelErrorBoundary";
import "../styles/sidepanel.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SidepanelErrorBoundary>
      <App />
    </SidepanelErrorBoundary>
  </React.StrictMode>
);
