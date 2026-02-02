import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MainApp } from "@/components/MainApp";
import { AuthErrorHandler } from "@/components/AuthErrorHandler";
import { useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { Loader2 } from "lucide-react";

function App() {
  const { loading } = useAuth();

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Normal app flow - AuthErrorHandler will throw if there's an error
  return (
    <AuthErrorHandler>
      <ProtectedRoute>
        <MainApp />
      </ProtectedRoute>
      <Toaster />
    </AuthErrorHandler>
  );
}

export default App;
