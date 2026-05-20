import { Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { SandboxBanner } from "./sandbox_banner";
import { PinnedPrimitivesProvider } from "@/contexts/pinned_primitives_context";
import { PageTitleProvider } from "./page_title_context";
import { PageRouteSkeleton } from "@/components/shared/query_status";

function PageRouteFallback({
  onLoadingChange,
}: {
  onLoadingChange: (loading: boolean) => void;
}) {
  useEffect(() => {
    onLoadingChange(true);
    return () => onLoadingChange(false);
  }, [onLoadingChange]);

  return <PageRouteSkeleton />;
}

export function AppLayout() {
  const location = useLocation();
  const [routeLoading, setRouteLoading] = useState(false);
  const handleRouteLoadingChange = useCallback((loading: boolean) => {
    setRouteLoading(loading);
  }, []);
  const outletKey = `${location.pathname}${location.search}`;

  return (
    <PinnedPrimitivesProvider>
      <PageTitleProvider>
        <TooltipProvider delayDuration={300}>
          <div className="flex h-screen flex-col overflow-hidden">
            <SandboxBanner />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar routeLoading={routeLoading} />
              <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                  <Suspense
                    fallback={<PageRouteFallback onLoadingChange={handleRouteLoadingChange} />}
                  >
                    <Outlet key={outletKey} />
                  </Suspense>
                </main>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </PageTitleProvider>
    </PinnedPrimitivesProvider>
  );
}
