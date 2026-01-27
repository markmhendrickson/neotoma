/**
 * Signin Form Component (FU-700)
 * 
 * User signin with email/password via Supabase Auth
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { supabase } = await import("@/lib/supabase");
      
      const { data, error: signinError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (signinError) {
        // Log full error details to console for debugging
        logError(signinError, "Supabase Sign In");
        
        // Extract the exact error message from Supabase (prioritizes error field which contains backend details)
        const errorMessage = extractErrorMessage(signinError, "Sign in failed");
        
        // Log the extracted message for verification
        console.error("[Sign In Error] Extracted message:", errorMessage);
        
        throw new Error(errorMessage);
      }
      
      if (data?.user) {
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err) {
      // Always extract and show the actual error message
      logError(err, "Sign In");
      const errorMessage = extractErrorMessage(err, "Sign in failed");
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-[400px] max-h-[90vh] flex flex-col overflow-hidden">
      <CardHeader className="flex-shrink-0">
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Enter your credentials to access your account</CardDescription>
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

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>

          {onSwitchToSignup && (
            <div className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto"
                onClick={onSwitchToSignup}
              >
                Sign up
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
