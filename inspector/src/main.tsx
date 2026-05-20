import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";
import { consumeSandboxSessionHandoff, parseSessionHash } from "@/lib/sandbox_session";
import { Theme_provider, initialize_theme_on_load } from "@/hooks/use_theme";

initialize_theme_on_load();

const LIVE_QUERY_INTERVAL_MS = 5_000;
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: LIVE_QUERY_INTERVAL_MS,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchInterval: LIVE_QUERY_INTERVAL_MS,
      refetchIntervalInBackground: true,
    },
  },
});

function renderApp() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={ROUTER_BASENAME}>
          <Theme_provider>
            <TooltipProvider delayDuration={250} skipDelayDuration={0}>
              <App />
              <Toaster position="bottom-right" />
            </TooltipProvider>
          </Theme_provider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

// Sandbox handoff: when the Inspector was opened via the `#session=...` hash
// from the landing page, redeem the one-time code before the first render so
// the app starts with the redeemed bearer (same-origin).
// On success `consumeSandboxSessionHandoff` reloads the window; on failure we
// continue booting with whatever token was already saved and surface the
// error through a transient toast from the layout.
const handoff = parseSessionHash(typeof window !== "undefined" ? window.location.hash : "");
if (handoff) {
  consumeSandboxSessionHandoff()
    .catch(() => void 0)
    .finally(() => {
      // consumeSandboxSessionHandoff calls window.location.reload() on
      // success so this branch runs only when no reload occurred (failure
      // case or SSR). Render the app regardless so the user sees something.
      renderApp();
    });
} else {
  renderApp();
}
