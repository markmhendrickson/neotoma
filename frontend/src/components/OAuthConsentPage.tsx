/**
 * OAuth Consent Page
 * 
 * Handles Supabase OAuth 2.1 Server consent flow
 * When Supabase redirects to /oauth/consent with authorization_id,
 * this page shows an approval screen and redirects to backend callback on approval
 */

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, ExternalLink } from "lucide-react";

interface AuthorizationDetails {
  redirectUrl: string;
  clientName?: string;
  scopes?: string[];
  authorizationId?: string;
  clientId?: string;
  redirectUri?: string;
}

export function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "pending_approval" | "approving" | "error" | "auth_required" | "denied">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authDetails, setAuthDetails] = useState<AuthorizationDetails | null>(null);
  
  // Use ref to prevent duplicate fetches (React StrictMode + state batching issue)
  const loadingStartedRef = useRef(false);
  const lastAuthorizationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loadAuthorizationDetails = async () => {
      const authorizationId = searchParams.get("authorization_id");

      if (!authorizationId) {
        setStatus("error");
        setErrorMessage("Missing authorization_id parameter");
        return;
      }

      // Wait for auth to load
      if (authLoading) {
        return;
      }

      // Synchronous guard using ref to prevent duplicate fetches
      // This works even with React StrictMode and batched state updates
      if (loadingStartedRef.current && lastAuthorizationIdRef.current === authorizationId) {
        return;
      }
      loadingStartedRef.current = true;
      lastAuthorizationIdRef.current = authorizationId;

      // Check if user is authenticated
      if (!user) {
        loadingStartedRef.current = false; // Reset so we can retry after login
        setStatus("auth_required");
        setErrorMessage("Please sign in to complete the OAuth authorization");
        return;
      }

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const session = await supabase.auth.getSession();
        
        if (!session.data.session) {
          throw new Error("Not authenticated. Please sign in first.");
        }

        // Get authorization details from Supabase OAuth 2.1 Server
        const detailsUrl = `${supabaseUrl}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`;
        
        const detailsResponse = await fetch(detailsUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${session.data.session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
          },
        });

        if (!detailsResponse.ok) {
          const errorText = await detailsResponse.text();
          throw new Error(`Failed to get authorization details (${detailsResponse.status}): ${errorText}`);
        }

        const details = await detailsResponse.json();

        // Extract redirect URL (Supabase uses redirect_url, not redirect_uri)
        const redirectUrl = details.redirect_url || details.redirectUrl || 
                           details.redirect_uri || details.redirectUri;

        if (!redirectUrl) {
          throw new Error("No redirect URL found in authorization details");
        }

        // Check if redirect_url already contains authorization code
        // If it does, Supabase has already generated the code and we should redirect directly
        // This happens with public clients (PKCE) where the user is already authenticated
        const redirectUrlObj = new URL(redirectUrl);
        const hasCode = redirectUrlObj.searchParams.has("code");
        const hasState = redirectUrlObj.searchParams.has("state");
        
        // If redirect_url already has code, authorization is ready - skip approval and redirect directly
        if (hasCode && hasState) {
          // Set approving status to avoid showing error screen
          setStatus("approving");
          
          // Redirect directly to the callback URL with the code
          // Use a small delay to ensure React state updates before navigation
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 100);
          return;
        }

        // Extract client info for display (parse from redirect URL if not provided)
        const urlObj = new URL(redirectUrl);
        const clientName = details.client_name || details.clientName || 
                          urlObj.hostname || "MCP Client";
        const clientId = details.client?.id || details.client_id || details.clientId || null;
        const redirectUri = details.redirect_uri || details.redirectUri || null;

        // Store details for approval screen
        setAuthDetails({
          redirectUrl,
          clientName,
          scopes: details.scopes || ["Access your Neotoma data"],
          authorizationId,
          clientId: clientId || undefined,
          redirectUri: redirectUri || undefined,
        });
        setStatus("pending_approval");

      } catch (error: any) {
        console.error("OAuth consent error:", error);
        setStatus("error");
        
        // Build detailed error message from all available error properties
        const errorParts: string[] = [];
        
        // Extract from original error if available
        const originalError = error.originalError || error;
        
        // Error code/identifier
        if (originalError.code || originalError.error_code) {
          errorParts.push(`[${originalError.code || originalError.error_code}]`);
        }
        
        // Main message
        const mainMessage = originalError.error || 
                           originalError.error_description || 
                           originalError.message || 
                           error.message || 
                           "Failed to process OAuth consent";
        errorParts.push(mainMessage);
        
        // Additional details
        if (originalError.status) {
          errorParts.push(`\nHTTP Status: ${originalError.status}`);
        }
        if (originalError.statusText) {
          errorParts.push(`Status Text: ${originalError.statusText}`);
        }
        if (originalError.details) {
          const detailsStr = typeof originalError.details === "object"
            ? JSON.stringify(originalError.details, null, 2)
            : String(originalError.details);
          errorParts.push(`\nDetails: ${detailsStr}`);
        }
        if (originalError.hint) {
          errorParts.push(`\nHint: ${originalError.hint}`);
        }
        
        // Include full error object for debugging
        errorParts.push(`\n\nFull Error Object:\n${JSON.stringify(originalError, null, 2)}`);
        
        setErrorMessage(errorParts.join('\n'));
      }
    };

    loadAuthorizationDetails();
    // Note: Using refs for synchronous guards to prevent duplicate fetches (StrictMode + state batching)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, authLoading]);

  const handleApprove = async () => {
    const authorizationId = searchParams.get("authorization_id");
    if (!authorizationId) return;


    setStatus("approving");
    
    let storedAuthParams: {
      authUrl?: string;
      clientId?: string | null;
      redirectUri?: string | null;
      state?: string | null;
      codeChallenge?: string | null;
      codeChallengeMethod?: string | null;
      scope?: string | null;
      storedAt?: number;
    } | null = null;
    
    try {
      const storedRaw = sessionStorage.getItem("mcp_oauth_auth_url");
      if (storedRaw) {
        storedAuthParams = JSON.parse(storedRaw);
      }
    } catch {
      storedAuthParams = null;
    }

    
    try {
      // Prefer Supabase OAuth client methods per docs
      const oauthClient = (supabase.auth as any).oauth;
      const hasApprove = typeof oauthClient?.approveAuthorization === "function";

      if (hasApprove) {
        const { data, error } = await oauthClient.approveAuthorization(authorizationId);


        if (error) {
          // Extract all available error details from Supabase AuthApiError
          const errorDetails: string[] = [];
          
          // Check for all possible error properties
          if (error.message) errorDetails.push(`Message: ${error.message}`);
          if (error.status) errorDetails.push(`Status: ${error.status}`);
          if (error.statusText) errorDetails.push(`Status Text: ${error.statusText}`);
          if ((error as any).error) errorDetails.push(`Error: ${(error as any).error}`);
          if ((error as any).error_description) errorDetails.push(`Description: ${(error as any).error_description}`);
          if ((error as any).code) errorDetails.push(`Code: ${(error as any).code}`);
          if ((error as any).details) errorDetails.push(`Details: ${(error as any).details}`);
          if ((error as any).hint) errorDetails.push(`Hint: ${(error as any).hint}`);
          
          // Create enhanced error with all details
          const enhancedError = new Error(
            errorDetails.length > 0 
              ? errorDetails.join('\n')
              : error.message || "OAuth authorization failed"
          );
          (enhancedError as any).originalError = error;
          throw enhancedError;
        }

        const redirectTo = data?.redirect_to || data?.redirectTo || data?.url;
        if (!redirectTo) {
          throw new Error("No redirect_to returned from approveAuthorization");
        }

        window.location.href = redirectTo;
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = await supabase.auth.getSession();
      
      if (!session.data.session) {
        throw new Error("Not authenticated");
      }

      // Supabase OAuth 2.1 consent approval: POST to /auth/v1/oauth/authorize with authorization_id
      // This is the standard way to complete the consent flow
      const authorizeUrl = `${supabaseUrl}/auth/v1/oauth/authorize`;
      
      const authorizeResponse = await fetch(authorizeUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.data.session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          authorization_id: authorizationId,
          consent: "allow",
        }).toString(),
      });

      if (authorizeResponse.status === 405) {
        const fallbackParams = new URLSearchParams({
          authorization_id: authorizationId,
          consent: "allow",
        });
        const fallbackClientId = storedAuthParams?.clientId || authDetails?.clientId || null;
        const fallbackRedirectUri = storedAuthParams?.redirectUri || authDetails?.redirectUri || null;
        const fallbackState = storedAuthParams?.state || null;
        const fallbackCodeChallenge = storedAuthParams?.codeChallenge || null;
        const fallbackCodeChallengeMethod = storedAuthParams?.codeChallengeMethod || null;
        const fallbackScope = storedAuthParams?.scope || null;
        
        if (fallbackClientId) {
          fallbackParams.set("client_id", fallbackClientId);
        }
        if (fallbackRedirectUri) {
          fallbackParams.set("redirect_uri", fallbackRedirectUri);
        }
        if (fallbackState) {
          fallbackParams.set("state", fallbackState);
        }
        if (fallbackCodeChallenge) {
          fallbackParams.set("code_challenge", fallbackCodeChallenge);
        }
        if (fallbackCodeChallengeMethod) {
          fallbackParams.set("code_challenge_method", fallbackCodeChallengeMethod);
        }
        if (fallbackScope) {
          fallbackParams.set("scope", fallbackScope);
        }
        fallbackParams.set("response_type", "code");
        const fallbackAuthorizeUrl = `${authorizeUrl}?${fallbackParams.toString()}`;
        

        // Try to inspect the response before navigation
        try {
          const fallbackResponse = await fetch(fallbackAuthorizeUrl, {
            method: "GET",
            redirect: "manual",
          });
          const locationHeader = fallbackResponse.headers.get("location");
          const contentType = fallbackResponse.headers.get("content-type");
          const responseText = contentType?.includes("application/json")
            ? JSON.stringify(await fallbackResponse.json())
            : (await fallbackResponse.text()).slice(0, 500);
          

          if (locationHeader) {
            window.location.href = locationHeader;
            return;
          }
        } catch (fallbackError: any) {
          // Ignore fallback error, will use direct redirect below
        }

        window.location.href = fallbackAuthorizeUrl;
        return;
      }

      // Check if response is a redirect (302/303) - follow it
      if (authorizeResponse.redirected) {
        window.location.href = authorizeResponse.url;
        return;
      }

      // If we get a response body, try to parse it
      let responseData: any = null;
      const contentType = authorizeResponse.headers.get("content-type");
      
      if (contentType?.includes("application/json")) {
        responseData = await authorizeResponse.json();
      } else {
        const responseText = await authorizeResponse.text();
        
        // Check if it's an error
        if (!authorizeResponse.ok) {
          throw new Error(`Authorization failed (${authorizeResponse.status}): ${responseText}`);
        }
        
        // Maybe it's HTML with a redirect or form
        // Check for Location header in response
        const locationHeader = authorizeResponse.headers.get("location");
        if (locationHeader) {
          window.location.href = locationHeader;
          return;
        }
      }


      if (!authorizeResponse.ok) {
        const errorMsg = responseData?.error || responseData?.message || responseData?.msg || "Authorization failed";
        throw new Error(`Failed to complete authorization (${authorizeResponse.status}): ${errorMsg}`);
      }

      // Look for redirect URL in response
      const redirectUrl = responseData?.redirect_url || responseData?.redirectUrl || 
                         responseData?.redirect_uri || responseData?.redirectUri ||
                         responseData?.url;
      
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else if (authDetails?.redirectUrl) {
        // Fallback: redirect to the callback URL (might fail without code, but let's try)
        window.location.href = authDetails.redirectUrl;
      } else {
        throw new Error("No redirect URL in authorize response");
      }
    } catch (error: any) {
      console.error("Failed to approve authorization:", error);
      
      
      setStatus("error");
      
      // Build detailed error message
      const errorParts: string[] = [];
      
      // Error code/identifier
      if (error.code || error.error_code) {
        errorParts.push(`[${error.code || error.error_code}]`);
      }
      
      // Main message
      const mainMessage = error.error || 
                         error.error_description || 
                         error.message || 
                         "Failed to approve authorization";
      errorParts.push(mainMessage);
      
      // Additional details
      if (error.status) {
        errorParts.push(`\nHTTP Status: ${error.status}`);
      }
      if (error.statusText) {
        errorParts.push(`Status Text: ${error.statusText}`);
      }
      if (error.details) {
        const detailsStr = typeof error.details === "object"
          ? JSON.stringify(error.details, null, 2)
          : String(error.details);
        errorParts.push(`\nDetails: ${detailsStr}`);
      }
      if (error.hint) {
        errorParts.push(`\nHint: ${error.hint}`);
      }
      
      // Include full error object for debugging
      errorParts.push(`\n\nFull Error Object:\n${JSON.stringify(error, null, 2)}`);
      
      setErrorMessage(errorParts.join('\n'));
    }
  };

  const handleDeny = () => {
    setStatus("denied");
  };

  if (status === "loading" || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Loading Authorization</CardTitle>
            <CardDescription>Please wait while we load the authorization details...</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "auth_required") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to complete the OAuth authorization</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              You need to be signed in to approve this OAuth connection.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Return to MCP Setup
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "pending_approval" && authDetails) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-full">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Authorize Connection</CardTitle>
                <CardDescription>Review and approve this connection request</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{authDetails.clientName}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                wants to connect to your Neotoma account
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">This will allow the application to:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {authDetails.scopes?.map((scope, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {scope}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleDeny}
              >
                Deny
              </Button>
              <Button 
                className="flex-1"
                onClick={handleApprove}
              >
                Approve
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You can revoke this connection at any time from MCP Settings
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "approving") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Completing Authorization</CardTitle>
            <CardDescription>Please wait while we complete the connection...</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Connection Denied</CardTitle>
            <CardDescription>You have denied the connection request</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              The application was not granted access to your Neotoma account.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Return to MCP Setup
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorization Error</CardTitle>
          <CardDescription>There was a problem processing your authorization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-md bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive mb-2">Error Details</p>
              <pre className="text-xs text-destructive whitespace-pre-wrap break-words font-mono">
                {errorMessage}
              </pre>
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="mb-2">Common fixes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Check server logs for detailed error information</li>
                <li>Verify database migrations are applied: <code className="bg-muted px-1 rounded">npm run migrate</code></li>
                <li>Ensure MCP_TOKEN_ENCRYPTION_KEY is set in .env</li>
                <li>Check Supabase connection and OAuth client configuration</li>
              </ul>
            </div>
            <Button variant="outline" onClick={() => navigate("/mcp-setup")}>
              Return to MCP Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
