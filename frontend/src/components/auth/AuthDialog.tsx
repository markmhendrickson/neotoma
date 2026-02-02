/**
 * Authentication Dialog Component
 * 
 * Dialog for sign in and sign up, used in sidebar menu for guest users
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SigninForm } from "./SigninForm";
import { SignupForm } from "./SignupForm";
import { PasswordReset } from "./PasswordReset";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialView?: "signin" | "signup" | "reset";
}

type AuthView = "signin" | "signup" | "reset";

export function AuthDialog({ open, onOpenChange, initialView = "signin" }: AuthDialogProps) {
  const [authView, setAuthView] = useState<AuthView>(initialView);

  const handleSuccess = () => {
    // Close dialog on successful authentication
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {authView === "signin" && "Sign in"}
            {authView === "signup" && "Create account"}
            {authView === "reset" && "Reset password"}
          </DialogTitle>
        </DialogHeader>
        {authView === "signin" && (
          <SigninForm
            onSuccess={handleSuccess}
            onSwitchToSignup={() => setAuthView("signup")}
            onForgotPassword={() => setAuthView("reset")}
          />
        )}
        {authView === "signup" && (
          <SignupForm
            onSuccess={handleSuccess}
            onSwitchToSignin={() => setAuthView("signin")}
          />
        )}
        {authView === "reset" && (
          <PasswordReset
            onSuccess={() => setAuthView("signin")}
            onBack={() => setAuthView("signin")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
