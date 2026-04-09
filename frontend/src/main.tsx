import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as ReactHelmetAsync from "react-helmet-async";
import App from "./App";
import { getSpaBasename } from "./site/spa_path";
import { initSiteAnalytics, installOutboundLinkTracking } from "./utils/analytics";
import { installViteChunkRecovery } from "./utils/vite_chunk_recovery";
import { LocaleProvider } from "./i18n/LocaleContext";
import { ThemeProvider } from "./hooks/useTheme";
import "./index.css";

initSiteAnalytics();
installOutboundLinkTracking();

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
installViteChunkRecovery();
const { HelmetProvider } = ReactHelmetAsync;

// GitHub Pages at /neotoma/; custom domain (neotoma.io) at /; Cursor/IDE at /neotoma-with-claude-code. One build for all.
function getRouterBasename(): string | undefined {
  const b = getSpaBasename();
  return b || undefined;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter basename={getRouterBasename()}>
        <LocaleProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </LocaleProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);

