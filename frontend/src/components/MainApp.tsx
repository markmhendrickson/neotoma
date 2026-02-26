import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { NotFound } from "@/components/NotFound";
import { SitePage } from "@/components/SitePage";
import { sendPageView } from "@/utils/analytics";

/**
 * Site-only public app shell.
 */
export function MainApp() {
  const location = useLocation();
  useEffect(() => {
    sendPageView(location.pathname);
  }, [location.pathname]);

  return (
    <Layout siteName="Neotoma">
      <Routes>
        <Route path="/" element={<SitePage />} />
        <Route path="/site" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
