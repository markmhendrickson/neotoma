/**
 * Auth Error Handler Component
 * 
 * Throws an error when authentication fails so ErrorBoundary can catch it
 * Must throw during render (not in useEffect) for ErrorBoundary to catch it
 */

import { useAuth } from "@/contexts/AuthContext";

interface AuthErrorHandlerProps {
  children: React.ReactNode;
}

export function AuthErrorHandler({ children }: AuthErrorHandlerProps) {
  const { error, loading } = useAuth();

  // Throw error during render so ErrorBoundary can catch it
  if (error && !loading) {
    throw error;
  }

  return <>{children}</>;
}
