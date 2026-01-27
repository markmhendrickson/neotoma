/**
 * Supabase Client for Frontend (FU-700)
 *
 * Supabase authentication and database client for frontend
 */

import { createClient } from "@supabase/supabase-js";

// Get Supabase URL and anon key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";


if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL or Anon Key not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables."
  );
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Expose on window for E2E tests (inject OAuth mocks via window.supabase.auth.oauth)
if (typeof window !== "undefined") {
  (window as unknown as { supabase?: typeof supabase }).supabase = supabase;
}
