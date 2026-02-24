/**
 * Signin Form Component (FU-700)
 * 
 * User signin with email/password or magic link via auth
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Mail, CheckCircle } from "lucide-react";
import { extractErrorMessage, logError } from "@/utils/errorUtils";

interface SigninFormProps {
  onSuccess?: () => void;
  onSwitchToSignup?: () => void;
  onForgotPassword?: () => void;
}

export function SigninForm({ onSuccess, onSwitchToSignup, onForgotPassword }: SigninFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { auth } = await import("@/lib/auth");
      
      if (useMagicLink) {
        // Send magic link
        const { error: magicLinkError } = await auth.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        
        if (magicLinkError) {
          logError(magicLinkError, "Magic Link");
          const errorMessage = extractErrorMessage(magicLinkError, "Failed to send magic link");
          console.error("[Magic Link Error] Extracted message:", errorMessage);
          throw new Error(errorMessage);
        }
        
        // Success - show confirmation message
        setMagicLinkSent(true);
      } else {
        // Sign in with password
        const { data, error: signinError } = await auth.auth.signInWithPassword({
          email,
          password,
        });
        
        if (signinError) {
          logError(signinError, "Sign In");
          const errorMessage = extractErrorMessage(signinError, "Sign in failed");
          console.error("[Sign In Error] Extracted message:", errorMessage);
          throw new Error(errorMessage);
        }
        
        if (data?.user) {
          toast({
            title: "Signed in successfully",
            description: `Welcome back${data.user.email ? `, ${data.user.email}` : ""}`,
          });
          if (onSuccess) {
            onSuccess();
          }
        }
      }
    } catch (err) {
      logError(err, "Sign In");
      const errorMessage = extractErrorMessage(err, useMagicLink ? "Failed to send magic link" : "Sign in failed");
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
            <span>A sign in link was sent to <strong>{email}</strong></span>
          </div>
          <p className="text-sm text-muted-foreground">
            Click the link in your email to complete sign in. You can close this page.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setMagicLinkSent(false);
              setEmail("");
            }}
          >
            Back to sign in
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
            : "Enter your credentials to access your account"}
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
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="password">Password</Label>
              {onForgotPassword && (
                <Button
                  type="button"
                  variant="link"
                  className="p-0 h-auto text-xs"
                  onClick={onForgotPassword}
                >
                  Forgot password?
                </Button>
              )}
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {useMagicLink ? "Sending magic link..." : "Signing in..."}
            </>
          ) : (
            <>
              {useMagicLink && <Mail className="mr-2 h-4 w-4" />}
              {useMagicLink ? "Send magic link" : "Sign in"}
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
            }}
            disabled={loading}
          >
            {useMagicLink 
              ? "Sign in with password instead" 
              : "Send me a magic link instead"}
          </Button>
        </div>

          {onSwitchToSignup && (
            <div className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto"
                onClick={onSwitchToSignup}
              >
                Create account
              </Button>
            </div>
          )}
      </form>
    </div>
  );
}
