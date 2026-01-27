/**
 * Signup Form Component (FU-700)
 * 
 * User signup with email/password via Supabase Auth
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { extractErrorMessage, logError } from "@/utils/errorUtils";

interface SignupFormProps {
  onSuccess?: () => void;
  onSwitchToSignin?: () => void;
}

export function SignupForm({ onSuccess, onSwitchToSignin }: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const { supabase } = await import("@/lib/supabase");
      
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
      });
      
      if (signupError) {
        // Log full error details to console for debugging
        logError(signupError, "Supabase Signup");
        
        // Extract the exact error message from Supabase (prioritizes error field which contains backend details)
        const errorMessage = extractErrorMessage(signupError, "Signup failed");
        
        // Log the extracted message for verification
        console.error("[Signup Error] Extracted message:", errorMessage);
        
        throw new Error(errorMessage);
      }
      
      // Check if user was created (even if email confirmation is required)
      if (data?.user) {
        // If session exists, user is immediately authenticated
        if (data.session) {
          // Session created - manually refresh session to ensure AuthContext updates
          const { supabase } = await import("@/lib/supabase");
          await supabase.auth.getSession();
          // AuthContext will detect via onAuthStateChange and ProtectedRoute will re-render
        } else {
          // Email confirmation required - show success message (not an error)
          setError(
            "✓ Account created! Please check your email to confirm your account, then sign in."
          );
          // Switch to signin after a delay
          setTimeout(() => {
            if (onSwitchToSignin) {
              onSwitchToSignin();
            }
          }, 4000);
        }
      } else {
        throw new Error("Signup failed - no user data returned");
      }
    } catch (err) {
      // Always extract and show the actual error message
      logError(err, "Signup");
      const errorMessage = extractErrorMessage(err, "Signup failed");
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-[400px] max-h-[90vh] flex flex-col overflow-hidden">
      <CardHeader className="flex-shrink-0">
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Enter your email and password to get started</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className={`text-sm ${error.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Sign Up"
            )}
          </Button>

          {onSwitchToSignin && (
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto"
                onClick={onSwitchToSignin}
              >
                Sign in
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
