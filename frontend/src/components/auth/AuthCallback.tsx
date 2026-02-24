/**
 * Auth Callback Handler
 * 
 * Handles OAuth and magic link authentication callbacks
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Handle the callback
    const handleCallback = async () => {
      try {
        // Get the hash parameters (auth uses hash for magic links and OAuth)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        // Check for error in hash
        const hashError = hashParams.get("error");
        const hashErrorDescription = hashParams.get("error_description");
        
        if (hashError) {
          setError(hashErrorDescription || hashError);
          setTimeout(() => navigate("/signin"), 3000);
          return;
        }

        // Get the access token and refresh token from hash
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          // Exchange the tokens for a session
          const { data, error: sessionError } = await auth.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            setError(sessionError.message);
            setTimeout(() => navigate("/signin"), 3000);
            return;
          }

          if (data?.session) {
            // Success - show toast and navigate to home
            toast({
              title: "Signed in successfully",
              description: `Welcome back${data.session.user?.email ? `, ${data.session.user.email}` : ""}`,
            });
            navigate("/");
            return;
          }
        }

        // If no tokens in hash, check if there's an error in query params (OAuth fallback)
        const searchParams = new URLSearchParams(window.location.search);
        const queryError = searchParams.get("error");
        const queryErrorDescription = searchParams.get("error_description");

        if (queryError) {
          setError(queryErrorDescription || queryError);
          setTimeout(() => navigate("/signin"), 3000);
          return;
        }

        // If we get here with no tokens and no error, the auth state change listener
        // in AuthContext will handle the session
        // Navigate to home after a short delay
        setTimeout(() => navigate("/"), 1000);
      } catch (err) {
        console.error("Auth callback error:", err);
        setError(err instanceof Error ? err.message : "Authentication failed");
        setTimeout(() => navigate("/signin"), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="container p-6 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Authenticating</h1>
        <p className="text-lg text-muted-foreground">
          {error ? "Authentication failed" : "Please wait while we sign you in"}
        </p>
      </div>

      {error ? (
        <div className="space-y-4 max-w-md">
          <div className="p-4 border rounded-lg bg-destructive/10">
            <div className="text-sm text-destructive">{error}</div>
          </div>
          <div className="text-sm text-muted-foreground">
            Redirecting to sign in page...
          </div>
        </div>
      ) : (
        <div className="py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
    </div>
  );
}
