import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { PageShell } from "@/components/layout/page_shell";
import { EmptyState } from "@/components/shared/empty_state";
import { Button } from "@/components/ui/button";
import { completeOAuthSignIn } from "@/lib/oauth_signin";

type CallbackState =
  | { phase: "working" }
  | { phase: "success"; returnPath: string }
  | { phase: "error"; message: string; returnPath: string };

/**
 * Landing point for the OAuth sign-in redirect started from Settings
 * ({@link import("@/lib/oauth_signin").startOAuthSignIn}). Exchanges the
 * `code` the server appended to the redirect for an access token and stores
 * it as the Inspector's bearer token, then returns the user to where they
 * started.
 */
export default function OAuthCallbackPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>({ phase: "working" });

  useEffect(() => {
    let cancelled = false;
    completeOAuthSignIn(search).then((result) => {
      if (cancelled) return;
      if (result.kind === "success") {
        setState({ phase: "success", returnPath: result.returnPath });
      } else {
        setState({ phase: "error", message: result.message, returnPath: result.returnPath });
      }
    });
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount: `search` is read from the URL this
    // page was loaded with, and the authorization code it carries is
    // single-use, so re-running this effect on param changes is not wanted.
  }, []);

  useEffect(() => {
    if (state.phase !== "success") return;
    const timer = setTimeout(() => navigate(state.returnPath, { replace: true }), 800);
    return () => clearTimeout(timer);
  }, [state, navigate]);

  if (state.phase === "working") {
    return (
      <PageShell title="Signing in">
        <EmptyState
          icon={Loader2}
          title="Completing sign-in…"
          description="Exchanging the authorization code for a session."
        />
      </PageShell>
    );
  }

  if (state.phase === "success") {
    return (
      <PageShell title="Signed in">
        <EmptyState icon={CheckCircle2} title="Signed in" description="Redirecting you back…" />
      </PageShell>
    );
  }

  return (
    <PageShell title="Sign-in failed">
      <EmptyState
        icon={CircleAlert}
        title="Sign-in failed"
        description={state.message}
        actions={
          <>
            <Button asChild variant="default" size="sm">
              <Link to="/settings">Back to Settings</Link>
            </Button>
          </>
        }
      />
    </PageShell>
  );
}
