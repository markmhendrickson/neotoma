import { MainApp } from "@/components/MainApp";
import { AuthErrorHandler } from "@/components/AuthErrorHandler";
import { Toaster } from "@/components/ui/toaster";

function App() {
  // Public site-only frontend flow.
  return (
    <AuthErrorHandler>
      <MainApp />
      <Toaster />
    </AuthErrorHandler>
  );
}

export default App;
