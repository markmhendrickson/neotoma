/**
 * Protected Route Component (FU-700)
 *
 * Wraps authenticated content and redirects to signin if not authenticated
 */

import { useAuth } from "@/contexts/AuthContext";
import { SigninForm } from "@/components/auth/SigninForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { PasswordReset } from "@/components/auth/PasswordReset";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { extractErrorMessage, logError } from "@/utils/errorUtils";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

type AuthView = "signin" | "signup" | "reset";

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState<AuthView>("signin");
  const [guestLoading, setGuestLoading] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const handleAnonymousSignIn = async () => {
    setGuestLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase");

      const { data, error: signinError } = await supabase.auth.signInAnonymously();

      if (signinError) {
        // Log full error details to console for debugging
        logError(signinError, "Supabase Anonymous Sign In");

        // Extract the exact error message from Supabase (prioritizes error field which contains backend details)
        const errorMessage = extractErrorMessage(signinError, "Anonymous sign in failed");

        // Log the extracted message for verification
        console.error("[ProtectedRoute] Anonymous sign in error:", errorMessage);
        // Could show a toast here if needed
      } else if (data?.user) {
        // User is now authenticated, component will re-render
      }
    } catch (err) {
      logError(err, "Anonymous Sign In");
      const errorMessage = extractErrorMessage(err, "Anonymous sign in failed");
      console.error("Anonymous sign in error:", errorMessage);
    } finally {
      setGuestLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 overflow-y-auto">
        <div>
          {authView === "signin" && (
            <SigninForm
              onSuccess={() => {
                // User is now authenticated, component will re-render
              }}
              onSwitchToSignup={() => setAuthView("signup")}
              onForgotPassword={() => setAuthView("reset")}
            />
          )}
          {authView === "signup" && (
            <SignupForm
              onSuccess={() => {
                // User is now authenticated, component will re-render
              }}
              onSwitchToSignin={() => setAuthView("signin")}
            />
          )}
          {authView === "reset" && (
            <PasswordReset
              onSuccess={() => setAuthView("signin")}
              onBack={() => setAuthView("signin")}
            />
          )}
        </div>

        {/* Continue as Guest button - visible for signin and signup, hidden for reset */}
        {(authView === "signin" || authView === "signup") && (
          <div className="mt-4 w-[400px]">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleAnonymousSignIn}
              disabled={guestLoading}
            >
              {guestLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Continue as Guest"
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
