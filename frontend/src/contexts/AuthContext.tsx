/**
 * Authentication Context (FU-700)
 *
 * Provides auth state and methods throughout the app
 */

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  sessionToken: string | null;
  loading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
  retryGuestSignIn: () => Promise<void>;
  resetGuestAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  sessionToken: null,
  loading: true,
  error: null,
  signOut: async () => {},
  retryGuestSignIn: async () => {},
  resetGuestAuth: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        // No session exists - automatically sign in as guest
        try {
          const { data: guestData, error: guestError } = await supabase.auth.signInAnonymously();
          if (guestError) {
            console.error("[AuthContext] Failed to sign in as guest:", guestError);
            // Create an Error object with the guest error details
            // Use the actual error message from Supabase, not a default
            const errorMessage = guestError.message || 
                                 (guestError as any).error || 
                                 "Failed to sign in as guest";
            const authError = new Error(errorMessage);
            (authError as any).originalError = guestError;
            setError(authError);
            // Set loading to false even if guest sign-in fails
            setLoading(false);
          } else if (guestData?.session) {
            setSession(guestData.session);
            setUser(guestData.session.user);
            setError(null); // Clear any previous errors
            setLoading(false);
          } else {
            // No error but also no session - this shouldn't happen, but handle it
            console.warn("[AuthContext] Guest sign-in returned no error but also no session");
            setError(new Error("Guest sign-in completed but no session was created"));
            setLoading(false);
          }
        } catch (err) {
          console.error("[AuthContext] Error during guest sign-in:", err);
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          setLoading(false);
        }
      } else {
        setSession(session);
        setUser(session.user);
        setError(null); // Clear any previous errors
        setLoading(false);
      }
    });

    // Listen for auth changes (including from other tabs)
    // This automatically detects changes from localStorage events across tabs
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AuthContext] Auth state change:", event, session?.user?.id);
      
      // Handle all auth state changes
      setSession(session);
      setUser(session?.user ?? null);
      setError(null); // Clear errors on successful auth state change
      setLoading(false);
      
      // If signed in from another tab, ensure we handle guest -> authenticated transition
      if (event === "SIGNED_IN" && session) {
        console.log("[AuthContext] User signed in (possibly from another tab)");
      }
      
      // If signed out from another tab, handle authenticated -> guest transition
      if (event === "SIGNED_OUT") {
        console.log("[AuthContext] User signed out (possibly from another tab)");
        // The session is already null, context will update automatically
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const retryGuestSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: guestData, error: guestError } = await supabase.auth.signInAnonymously();
      if (guestError) {
        const errorMessage = guestError.message || 
                             (guestError as any).error || 
                             "Failed to sign in as guest";
        const authError = new Error(errorMessage);
        (authError as any).originalError = guestError;
        setError(authError);
        setLoading(false);
      } else if (guestData?.session) {
        setSession(guestData.session);
        setUser(guestData.session.user);
        setError(null);
        setLoading(false);
      } else {
        // No error but also no session - this shouldn't happen, but handle it
        console.warn("[AuthContext] Guest sign-in retry returned no error but also no session");
        setError(new Error("Guest sign-in completed but no session was created"));
        setLoading(false);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      setLoading(false);
    }
  };

  const resetGuestAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      // Sign out current session first
      await supabase.auth.signOut();
      
      // Wait a moment for sign out to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Sign in as new anonymous user
      const { data: guestData, error: guestError } = await supabase.auth.signInAnonymously();
      if (guestError) {
        const errorMessage = guestError.message || 
                             (guestError as any).error || 
                             "Failed to reset guest auth";
        const authError = new Error(errorMessage);
        (authError as any).originalError = guestError;
        setError(authError);
        setLoading(false);
      } else if (guestData?.session) {
        setSession(guestData.session);
        setUser(guestData.session.user);
        setError(null);
        setLoading(false);
      } else {
        console.warn("[AuthContext] Guest auth reset returned no error but also no session");
        setError(new Error("Guest auth reset completed but no session was created"));
        setLoading(false);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      setLoading(false);
    }
  };

  const value = {
    user,
    session,
    sessionToken: session?.access_token ?? null,
    loading,
    error,
    signOut,
    retryGuestSignIn,
    resetGuestAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
