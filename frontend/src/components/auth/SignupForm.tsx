/**
 * Signup Form Component (FU-700)
 * 
 * User signup with email/password or magic link via Supabase Auth
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Mail, CheckCircle } from "lucide-react";
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
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation for password mode
    if (!useMagicLink) {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
    }

    setLoading(true);

    try {
      const { supabase } = await import("@/lib/supabase");
      
      if (useMagicLink) {
        // Send magic link to create account
        const { error: magicLinkError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            shouldCreateUser: true,
          },
        });
        
        if (magicLinkError) {
          logError(magicLinkError, "Supabase Magic Link Signup");
          const errorMessage = extractErrorMessage(magicLinkError, "Failed to send magic link");
          console.error("[Magic Link Signup Error] Extracted message:", errorMessage);
          throw new Error(errorMessage);
        }
        
        // Success - show confirmation message
        setMagicLinkSent(true);
      } else {
        // Sign up with password
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
        });
        
        if (signupError) {
          logError(signupError, "Supabase Signup");
          const errorMessage = extractErrorMessage(signupError, "Signup failed");
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
            toast({
              title: "Account created successfully",
              description: `Welcome to Neotoma${data.user.email ? `, ${data.user.email}` : ""}`,
            });
            // AuthContext will detect via onAuthStateChange and ProtectedRoute will re-render
          } else {
            // Email confirmation required - show success message
            toast({
              title: "Account created",
              description: "Please check your email to confirm your account, then sign in.",
            });
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
      }
    } catch (err) {
      logError(err, "Signup");
      const errorMessage = extractErrorMessage(err, useMagicLink ? "Failed to send magic link" : "Signup failed");
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // If magic link was sent, show success message
  if (magicLinkSent) {
    return (
      <div className="space-y-6 max-w-md">
        <div className="space-y-4 p-6 border rounded-lg bg-muted/50">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Check your email</h2>
          </div>
          <div className="flex items-center space-x-2 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            <span>A sign up link was sent to <strong>{email}</strong></span>
          </div>
          <p className="text-sm text-muted-foreground">
            Click the link in your email to complete account creation. You can close this page.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setMagicLinkSent(false);
              setEmail("");
            }}
          >
            Back to sign up
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <p className="text-muted-foreground">
          {useMagicLink 
            ? "Enter your email to receive a magic link" 
            : "Enter your email and password to create an account"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        {!useMagicLink && (
          <>
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
          </>
        )}

        {error && (
          <div className={`text-sm ${error.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {useMagicLink ? "Sending magic link..." : "Creating account..."}
            </>
          ) : (
            <>
              {useMagicLink && <Mail className="mr-2 h-4 w-4" />}
              {useMagicLink ? "Send magic link" : "Create account"}
            </>
          )}
        </Button>

        <div className="text-center">
            <Button
              type="button"
              variant="link"
              className="p-0 h-auto text-sm"
              onClick={() => {
                setUseMagicLink(!useMagicLink);
                setError(null);
                setPassword("");
                setConfirmPassword("");
              }}
              disabled={loading}
            >
              {useMagicLink 
                ? "Create account with password instead" 
                : "Send me a magic link instead"}
            </Button>
        </div>

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
    </div>
  );
}
