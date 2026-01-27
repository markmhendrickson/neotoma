/**
 * Password Reset Component (FU-700)
 * 
 * Password reset flow via Supabase Auth
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { extractErrorMessage, logError } from "@/utils/errorUtils";

interface PasswordResetProps {
  onSuccess?: () => void;
  onBack?: () => void;
}

export function PasswordReset({ onSuccess, onBack }: PasswordResetProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { supabase } = await import("@/lib/supabase");
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (resetError) {
        // Log full error details to console for debugging
        logError(resetError, "Supabase Password Reset");
        
        // Extract the exact error message from Supabase (prioritizes error field which contains backend details)
        const errorMessage = extractErrorMessage(resetError, "Password reset failed");
        
        // Log the extracted message for verification
        console.error("[Password Reset Error] Extracted message:", errorMessage);
        
        throw new Error(errorMessage);
      }
      
      setSuccess(true);
      if (onSuccess) {
        setTimeout(() => onSuccess(), 2000);
      }
    } catch (err) {
      // Always extract and show the actual error message
      logError(err, "Password Reset");
      const errorMessage = extractErrorMessage(err, "Password reset failed");
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="w-[400px] max-h-[90vh] flex flex-col overflow-hidden">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Check Your Email</CardTitle>
          <CardDescription>
            We&apos;ve sent you a password reset link
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <p className="text-sm text-muted-foreground">
            Check your email for a link to reset your password. If it doesn&apos;t appear within a few minutes, check your spam folder.
          </p>
          {onBack && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={onBack}
            >
              Back to sign in
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-[400px] max-h-[90vh] flex flex-col overflow-hidden">
      <CardHeader className="flex-shrink-0">
        <CardTitle>Reset Password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link
        </CardDescription>
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

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending reset link...
              </>
            ) : (
              "Send Reset Link"
            )}
          </Button>

          {onBack && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={onBack}
            >
              Back to sign in
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
