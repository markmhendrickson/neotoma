/**
 * Password Reset Component (FU-700)
 * 
 * Password reset flow via auth
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, Mail } from "lucide-react";
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
      const { auth } = await import("@/lib/auth");
      
      const { error: resetError } = await auth.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (resetError) {
        // Log full error details to console for debugging
        logError(resetError, "Password Reset");
        
        // Extract the exact error message from auth (prioritizes error field which contains backend details)
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
      <div className="space-y-6 max-w-md">
        <div className="space-y-4 p-6 border rounded-lg bg-muted/50">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Check your email</h2>
          </div>
          <div className="flex items-center space-x-2 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            <span>We&apos;ve sent you a password reset link</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Check your email for a link to reset your password. If it doesn&apos;t appear within a few minutes, check your spam folder.
          </p>
          {onBack && (
            <Button
              variant="outline"
              className="w-full"
              onClick={onBack}
            >
              Back to sign in
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md">
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
            "Send reset link"
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
    </div>
  );
}
