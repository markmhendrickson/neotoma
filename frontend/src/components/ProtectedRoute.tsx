/**
 * Protected Route Component (FU-700)
 *
 * Wraps authenticated content. Guest auth is automatic via AuthContext,
 * so we just wait for auth to complete and show children.
 */

import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Show loading while auth initializes (including automatic guest sign-in)
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If no user after loading completes, this means auth failed
  // AuthErrorHandler will catch the error and ErrorBoundary will display it
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
