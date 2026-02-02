/**
 * Create Account Page
 * 
 * Full-page account creation view accessible via route
 * Note: This page is rendered inside MainApp's Layout, so no Layout wrapper needed
 */

import { useNavigate } from "react-router-dom";
import { SignupForm } from "./SignupForm";

export function SignUpPage() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    // Navigate to home after successful registration
    navigate("/");
  };

  return (
    <div className="container p-6 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Create account</h1>
        <p className="text-lg text-muted-foreground">
          Start building your personal AI memory with Neotoma.
        </p>
      </div>
      
      <SignupForm
        onSuccess={handleSuccess}
        onSwitchToSignin={() => navigate("/signin")}
      />
    </div>
  );
}
