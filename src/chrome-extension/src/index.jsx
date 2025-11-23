import React from "react";
import ReactDOM from "react-dom/client";
import ExtensionPanel from "./ExtensionPanel.jsx";

export function initPanel() {
  const root = ReactDOM.createRoot(document.getElementById("app"));
  root.render(<ExtensionPanel />);
}
