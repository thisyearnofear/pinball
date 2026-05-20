import { Buffer } from 'buffer';
window.Buffer = Buffer;
globalThis.Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

