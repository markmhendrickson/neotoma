/**
 * Reset Password Page
 * 
 * Full-page password reset view accessible via route
 * Note: This page is rendered inside MainApp's Layout, so no Layout wrapper needed
 */

import { useNavigate } from "react-router-dom";
import { PasswordReset } from "./PasswordReset";

export function ResetPasswordPage() {
  const navigate = useNavigate();

  return (
    <div className="container p-6 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Reset password</h1>
        <p className="text-lg text-muted-foreground">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>
      
      <PasswordReset
        onSuccess={() => navigate("/signin")}
        onBack={() => navigate("/signin")}
      />
    </div>
  );
}
