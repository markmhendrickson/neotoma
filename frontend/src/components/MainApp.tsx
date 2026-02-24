import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { NotFound } from "@/components/NotFound";
import { SitePage } from "@/components/SitePage";

/**
 * Site-only public app shell.
 */
export function MainApp() {
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
