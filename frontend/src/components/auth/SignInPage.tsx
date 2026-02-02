/**
 * Sign In Page
 * 
 * Full-page sign in view accessible via route
 * Note: This page is rendered inside MainApp's Layout, so no Layout wrapper needed
 */

import { useNavigate } from "react-router-dom";
import { SigninForm } from "./SigninForm";

export function SignInPage() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    // Navigate to home after successful sign in
    navigate("/");
  };

  return (
    <div className="container p-6 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Sign in</h1>
        <p className="text-lg text-muted-foreground">
          Access your Neotoma account to continue building your AI memory.
        </p>
      </div>
      
      <SigninForm
        onSuccess={handleSuccess}
        onSwitchToSignup={() => navigate("/signup")}
        onForgotPassword={() => navigate("/reset-password")}
      />
    </div>
  );
}
