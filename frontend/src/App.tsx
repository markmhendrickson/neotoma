import { MainApp } from "@/components/MainApp";
import { Toaster } from "@/components/ui/toaster";
import { isSitePreview } from "@/site/seo_metadata";

function App() {
  // Public site-only frontend flow.
  return (
    <>
      {isSitePreview() && <div className="site-preview-label">Pre-release review</div>}
      <MainApp />
      <Toaster />
    </>
  );
}

export default App;
