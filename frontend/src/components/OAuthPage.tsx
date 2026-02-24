/**
 * OAuth Page
 * 
 * Dedicated page for managing MCP OAuth connections
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MCPConnectionsList } from "./MCPConnectionsList";

interface OAuthStatus {
  type: "success" | "error";
  message: string;
  connectionId?: string;
  errorCode?: string;
  errorDetails?: string;
}

export function OAuthPage() {
  const { toast } = useToast();
  
  // OAuth state
  const [oauthConnectionId, setOauthConnectionId] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthAuthUrl, setOauthAuthUrl] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);

  // Check for OAuth callback status in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const connectionId = params.get("connection_id");
    const error = params.get("error");
    const errorCode = params.get("error_code");
    const errorDetails = params.get("error_details");

    if (status === "success" && connectionId) {
      const successMessage = `OAuth connection ${connectionId} is now active`;
      setOauthStatus({
        type: "success",
        message: successMessage,
        connectionId,
      });
      
      toast({
        title: "Connection successful",
        description: successMessage,
      });
      // Clear URL params
      window.history.replaceState({}, "", window.location.pathname);
      
      // Clear status banner after 10 seconds
      setTimeout(() => setOauthStatus(null), 10000);
    } else if (status === "error") {
      // Build detailed error message
      let errorMessage = error || "OAuth connection failed";
      if (errorCode) {
        errorMessage = `[${errorCode}] ${errorMessage}`;
      }
      
      let parsedDetails: string | undefined;
      if (errorDetails) {
        try {
          const details = JSON.parse(errorDetails);
          parsedDetails = typeof details === "object" 
            ? JSON.stringify(details, null, 2)
            : String(details);
        } catch {
          parsedDetails = errorDetails;
        }
      }

      setOauthStatus({
        type: "error",
        message: errorMessage,
        errorCode: errorCode || undefined,
        errorDetails: parsedDetails,
      });

      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
        duration: 10000, // Show longer for detailed errors
      });
      // Clear URL params
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const generateConnectionId = () => {
    const timestamp = new Date().toISOString().split("T")[0];
    const random = Math.random().toString(36).substring(2, 8);
    setOauthConnectionId(`cursor-${timestamp}-${random}`);
  };

  const initiateOAuthFlow = async () => {
    if (!oauthConnectionId) {
      toast({
        title: "Connection ID required",
        description: "Please enter a connection ID",
        variant: "destructive",
      });
      return;
    }

    try {
      setOauthLoading(true);
      // Always use relative URL in development to leverage Vite proxy (which handles branch-based port assignment)
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const isDev = import.meta.env.DEV || apiBase === window.location.origin || !apiBase;
      const apiUrl = isDev ? "/mcp/oauth/initiate" : `${apiBase}/mcp/oauth/initiate`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connection_id: oauthConnectionId,
          client_name: "Web UI",
        }),
      });

      if (!response.ok) {
        // Try to extract structured error information from response body
        let errorMessage = "Failed to initiate OAuth flow";
        let errorCode: string | undefined;
        let errorHint: string | undefined;
        try {
          const errorData = await response.json();
          errorCode = errorData.error_code;
          errorMessage = errorData.error || errorData.message || errorMessage;
          errorHint = errorData.hint;
          
          // Build detailed error message
          if (errorCode) {
            errorMessage = `[${errorCode}] ${errorMessage}`;
          }
          if (errorHint) {
            errorMessage += `\n\n${errorHint}`;
          }
          if (errorData.details) {
            const detailsStr = typeof errorData.details === "string" 
              ? errorData.details 
              : JSON.stringify(errorData.details, null, 2);
            errorMessage += `\n\nDetails: ${detailsStr}`;
          }
        } catch {
          // If response isn't JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setOauthAuthUrl(data.authUrl);
      
      try {
        const authUrl = new URL(data.authUrl);
        const storedParams = {
          authUrl: data.authUrl,
          clientId: authUrl.searchParams.get("client_id"),
          redirectUri: authUrl.searchParams.get("redirect_uri"),
          state: authUrl.searchParams.get("state"),
          codeChallenge: authUrl.searchParams.get("code_challenge"),
          codeChallengeMethod: authUrl.searchParams.get("code_challenge_method"),
          scope: authUrl.searchParams.get("scope"),
          storedAt: Date.now(),
        };
        sessionStorage.setItem("mcp_oauth_auth_url", JSON.stringify(storedParams));
      } catch (storageError) {
        console.warn("Failed to store OAuth auth URL params:", storageError);
      }

      toast({
        title: "OAuth flow initiated",
        description: "Click the button below to authorize in your browser",
      });

      // Start polling for status
      setPollingStatus(true);
      pollConnectionStatus(oauthConnectionId);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate OAuth flow",
        variant: "destructive",
      });
    } finally {
      setOauthLoading(false);
    }
  };

  const pollConnectionStatus = async (connectionId: string) => {
    const maxAttempts = 60; // Poll for 5 minutes (5 second intervals)
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setPollingStatus(false);
        toast({
          title: "Timeout",
          description: "OAuth flow timed out. Please try again.",
          variant: "destructive",
        });
        return;
      }

      try {
        // Always use relative URL in development to leverage Vite proxy (which handles branch-based port assignment)
        const apiBase = import.meta.env.VITE_API_BASE_URL || "";
        const isDev = typeof window !== 'undefined' && (import.meta.env.DEV || apiBase === window.location.origin || !apiBase);
        const apiUrl = isDev 
          ? `/mcp/oauth/status?connection_id=${encodeURIComponent(connectionId)}`
          : `${apiBase}/mcp/oauth/status?connection_id=${encodeURIComponent(connectionId)}`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error("Failed to check status");
        }

        const data = await response.json();

        if (data.status === "active") {
          setPollingStatus(false);
          setOauthAuthUrl(null);
          toast({
            title: "Connection active",
            description: `OAuth connection ${connectionId} is now active`,
          });
          return;
        } else if (data.status === "expired") {
          setPollingStatus(false);
          toast({
            title: "Connection expired",
            description: "Please try again",
            variant: "destructive",
          });
          return;
        }

        // Continue polling
        attempts++;
        setTimeout(poll, 5000);
      } catch (error: any) {
        console.error("Polling error:", error);
        setPollingStatus(false);
      }
    };

    poll();
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">OAuth Connections</h1>
        <p className="text-muted-foreground">
          Manage MCP OAuth connections for secure, long-lived authentication
        </p>
      </div>

      {/* OAuth Status Banner */}
      {oauthStatus && (
        <Card className={`mb-4 ${
          oauthStatus.type === "success" 
            ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" 
            : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
        }`}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {oauthStatus.type === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold mb-1 ${
                  oauthStatus.type === "success" 
                    ? "text-green-900 dark:text-green-100" 
                    : "text-red-900 dark:text-red-100"
                }`}>
                  {oauthStatus.type === "success" ? "Connection Successful" : "Connection Failed"}
                </h3>
                <p className={`text-sm ${
                  oauthStatus.type === "success" 
                    ? "text-green-800 dark:text-green-200" 
                    : "text-red-800 dark:text-red-200"
                }`}>
                  {oauthStatus.message}
                </p>
                {oauthStatus.errorDetails && (
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100">
                      Show error details
                    </summary>
                    <pre className="mt-2 text-xs bg-red-100 dark:bg-red-900 p-2 rounded overflow-auto max-h-40">
                      {oauthStatus.errorDetails}
                    </pre>
                  </details>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOauthStatus(null)}
                className="flex-shrink-0"
              >
                ×
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Create MCP OAuth Connection</CardTitle>
            <CardDescription>
              Authenticate your MCP client using OAuth for secure, long-lived connections
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oauth-connection-id" className="text-sm">Connection ID</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="oauth-connection-id"
                  value={oauthConnectionId}
                  onChange={(e) => setOauthConnectionId(e.target.value)}
                  placeholder="cursor-2025-01-21-abc123"
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateConnectionId}
                >
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A unique identifier for this MCP connection (you&apos;ll use this in your MCP client config)
              </p>
            </div>

            {!oauthAuthUrl ? (
              <Button
                onClick={initiateOAuthFlow}
                disabled={oauthLoading || !oauthConnectionId}
                className="w-full"
              >
                {oauthLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Initiating...
                  </>
                ) : (
                  "Start OAuth Flow"
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-medium mb-2">Step 1: Authorize Connection</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Click the button below to open your browser and authorize this connection
                  </p>
                  <Button
                    onClick={() => {
                      if (oauthAuthUrl) {
                        window.location.href = oauthAuthUrl;
                      }
                    }}
                    className="w-full"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Authorization Page
                  </Button>
                </div>

                {pollingStatus && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <p className="text-sm font-medium">Waiting for authorization...</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Complete the authorization in your browser. This page will update automatically.
                    </p>
                  </div>
                )}
              </div>
            )}

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How OAuth Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>OAuth provides secure, long-lived MCP connections</li>
              <li>Refresh tokens are stored encrypted in the database</li>
              <li>Access tokens are automatically refreshed when needed</li>
              <li>You can revoke connections anytime from the list below</li>
              <li>Use connection ID in your MCP client config (not session token)</li>
            </ul>
          </CardContent>
        </Card>

        <MCPConnectionsList />
      </div>
    </div>
  );
}
