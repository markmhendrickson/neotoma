import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as ReactHelmetAsync from "react-helmet-async";
import App from "./App";
import "./index.css";

// Initialize theme on app load
function initializeTheme() {
  const stored = localStorage.getItem("theme") || "system";
  const root = document.documentElement;
  
  if (stored === "system") {
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", systemPrefersDark);
  } else {
    root.classList.toggle("dark", stored === "dark");
  }
}

// Initialize theme before React renders
initializeTheme();
const { HelmetProvider } = ReactHelmetAsync;

// GitHub Pages project site is served at /neotoma/; custom domain (neotoma.io) at /. One build for both.
function getRouterBasename(): string | undefined {
  const p = typeof window !== "undefined" ? window.location.pathname : "";
  return p.startsWith("/neotoma") ? "/neotoma" : undefined;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter basename={getRouterBasename()}>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);

