import { useState } from "react";
import {
  getDefaultApiUrl,
  getInspectorEnvironment,
  getSavedApiUrl,
  isProxyDefaultEnabled,
  resolveInspectorBadgeEnvironment,
  setApiUrl,
  clearApiUrl,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
} from "@/api/client";
import { useHealthCheck, useServerInfo, useMe, useHealthCheckSnapshots } from "@/hooks/use_infra";
import { PageShell } from "@/components/layout/page_shell";
import { InlineSkeleton } from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CopyableCodeBlock } from "@/components/ui/copyable_code_block";
import { JsonViewer } from "@/components/shared/json_viewer";
import { AttributionSummary } from "@/components/shared/attribution_summary";
import { SessionAttestationCard } from "@/components/shared/session_attestation_card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatInspectorUserId } from "@/lib/constants";
import { areDestructiveActionsHidden, isApiUrlOverrideDisabled } from "@/lib/sandbox";
import { readStoredSandboxSession } from "@/lib/sandbox_session";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Circle, RefreshCw } from "lucide-react";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { InspectorThemeToggle } from "@/components/shared/inspector_theme_toggle";

const LOCAL_PROXY_PLACEHOLDER = "/api";

/** Harness connection snippets for Claude Code and Claude Desktop. */
function ConnectHarnessCard({ mcpUrl }: { mcpUrl: string }) {
  const claudeCodeSnippet = `claude mcp add neotoma --transport http ${mcpUrl}`;
  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        neotoma: {
          type: "http",
          url: mcpUrl,
        },
      },
    },
    null,
    2,
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Connect your harness</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-5 text-sm">
        <div className="space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="font-medium">Claude Code</span>
          </div>
          <CopyableCodeBlock
            code={claudeCodeSnippet}
            variant="code"
            copyAriaLabel="Copy Claude Code command"
            preClassName="text-xs break-all"
          />
        </div>
        <div className="space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div>
              <span className="font-medium">Claude Desktop</span>
              <p className="text-xs text-muted-foreground">
                Add to <span className="font-mono">claude_desktop_config.json</span>
              </p>
            </div>
          </div>
          <CopyableCodeBlock
            code={claudeDesktopSnippet}
            variant="code"
            copyAriaLabel="Copy Claude Desktop JSON"
            preClassName="text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          MCP URL: <span className="font-mono break-all">{mcpUrl}</span>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const defaultApiUrl = getDefaultApiUrl();
  const inspectorEnvironment = getInspectorEnvironment();
  const proxyDefaultEnabled = isProxyDefaultEnabled();
  const savedApiUrl = getSavedApiUrl();
  const [apiUrl, setApiUrlLocal] = useState(savedApiUrl || "");
  const [token, setTokenLocal] = useState(getAuthToken() || "");
  const activeSandboxSession = readStoredSandboxSession();
  const [showAdvanced, setShowAdvanced] = useState(activeSandboxSession === null);

  const health = useHealthCheck();
  const serverInfo = useServerInfo();
  const me = useMe();
  const snapshotHealth = useHealthCheckSnapshots();
  const connectionEnvBadge = resolveInspectorBadgeEnvironment(
    serverInfo.data?.neotoma_env,
    inspectorEnvironment,
  );

  function handleSaveConnection() {
    if (apiUrl.trim()) {
      setApiUrl(apiUrl);
    } else {
      clearApiUrl();
    }
    if (token) {
      setAuthToken(token);
    } else {
      clearAuthToken();
    }
    qc.invalidateQueries();
    toast.success(apiUrl.trim() ? "Connection override saved" : "Using default connection");
  }

  return (
    <PageShell title="Settings" description="Configure API connection and view server details">
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose how the app looks on this device.
            </p>
            <InspectorThemeToggle showLabels className="border-border bg-muted/40" />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Server Info</CardTitle>
              {showBackgroundQueryRefresh(serverInfo) ? <QueryRefreshIndicator /> : null}
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-2 text-sm">
            {showInitialQuerySkeleton(serverInfo) ? (
              <div className="space-y-2">
                <InlineSkeleton className="h-4 w-full max-w-xs" />
                <InlineSkeleton className="h-4 w-full max-w-sm" />
              </div>
            ) : serverInfo.data ? (
              <>
                <div className="flex min-w-0 justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">API</span>
                  <span className={health.data?.ok ? "text-success" : "text-destructive"}>
                    {health.data?.ok ? "Healthy" : "Unreachable"}
                  </span>
                </div>
                <div className="flex min-w-0 justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">HTTP Port</span>
                  <span className="min-w-0 text-right">{serverInfo.data.httpPort}</span>
                </div>
                <div className="flex min-w-0 justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">API Base</span>
                  <span className="min-w-0 break-all text-right font-mono text-xs">
                    {serverInfo.data.apiBase || "—"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">MCP URL</span>
                  <p className="font-mono text-xs break-all">{serverInfo.data.mcpUrl || "—"}</p>
                </div>
                {serverInfo.data.version && (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="shrink-0 text-muted-foreground">Version</span>
                    <span className="min-w-0 text-right font-mono text-xs">{serverInfo.data.version}</span>
                  </div>
                )}
                {serverInfo.data.git_sha && (
                  <div className="flex min-w-0 justify-between gap-2">
                    <span className="shrink-0 text-muted-foreground">Git SHA</span>
                    <span className="min-w-0 truncate text-right font-mono text-xs" title={serverInfo.data.git_sha}>
                      {serverInfo.data.git_sha.slice(0, 12)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Unable to load server info.</span>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base">API Connection</CardTitle></CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {activeSandboxSession ? (
              <div className="min-w-0 break-words rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                A redeemed sandbox session is driving this connection
                (<span className="font-mono">{activeSandboxSession.apiBase}</span>, pack{" "}
                <span className="font-mono">{activeSandboxSession.packId || "unknown"}</span>). The
                manual overrides below are collapsed by default — expand them only if you need to
                point the app at a different Neotoma instance.
              </div>
            ) : null}
            {activeSandboxSession && !showAdvanced ? (
              <div className="flex min-w-0 flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit max-w-full"
                  onClick={() => setShowAdvanced(true)}
                >
                  Show advanced connection settings
                </Button>
                <div className="flex items-center gap-2 text-sm">
                  <Circle className={`h-2.5 w-2.5 shrink-0 fill-current ${health.data?.ok ? "text-success" : "text-destructive"}`} />
                  <span>{health.data?.ok ? "Connected" : "Disconnected"}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  <Label>API Base URL Override</Label>
                  <Input
                    className="min-w-0 max-w-full"
                    value={apiUrl}
                    onChange={(e) => setApiUrlLocal(e.target.value)}
                    placeholder={
                      proxyDefaultEnabled
                        ? LOCAL_PROXY_PLACEHOLDER
                        : defaultApiUrl || "https://your-neotoma-api.example.com"
                    }
                    disabled={isApiUrlOverrideDisabled()}
                  />
                  <p className="mt-2 min-w-0 break-words text-xs text-muted-foreground">
                    {proxyDefaultEnabled
                      ? `Local dev default for ${connectionEnvBadge}: /api -> ${defaultApiUrl}`
                      : `Default for the current Neotoma environment (${connectionEnvBadge}): ${defaultApiUrl}`}
                  </p>
                </div>
                <div className="min-w-0">
                  <Label>Bearer Token</Label>
                  <Input
                    className="min-w-0 max-w-full"
                    type="password"
                    value={token}
                    onChange={(e) => setTokenLocal(e.target.value)}
                    placeholder="Optional auth token"
                    disabled={isApiUrlOverrideDisabled()}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex min-w-0 flex-wrap gap-2">
                    <Button
                      className="w-fit max-w-full shrink-0"
                      onClick={handleSaveConnection}
                      disabled={isApiUrlOverrideDisabled()}
                    >
                      Save & Reconnect
                    </Button>
                    <Button
                      variant="outline"
                      className="w-fit max-w-full shrink-0"
                      onClick={() => {
                        setApiUrlLocal("");
                        clearApiUrl();
                        qc.invalidateQueries();
                        toast.success("Reverted to default connection");
                      }}
                      disabled={isApiUrlOverrideDisabled() || (!savedApiUrl && !apiUrl.trim())}
                    >
                      Use Default
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Circle className={`h-2.5 w-2.5 shrink-0 fill-current ${health.data?.ok ? "text-success" : "text-destructive"}`} />
                    <span>{health.data?.ok ? "Connected" : "Disconnected"}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Current User</CardTitle>
              {showBackgroundQueryRefresh(me) ? <QueryRefreshIndicator /> : null}
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-2 text-sm">
            {showInitialQuerySkeleton(me) ? (
              <div className="space-y-2">
                <InlineSkeleton className="h-4 w-full max-w-xs" />
                <InlineSkeleton className="h-4 w-full max-w-md" />
              </div>
            ) : me.data ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User ID</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-mono text-xs cursor-default">
                        {formatInspectorUserId(me.data.user_id)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-sm">
                      <p className="text-xs text-muted-foreground">User ID</p>
                      <p className="font-mono text-xs break-all">{me.data.user_id}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {me.data.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{me.data.email}</span></div>}
                {me.data.storage && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Backend</span><Badge variant="secondary">{me.data.storage.storage_backend}</Badge></div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Data Dir</span>
                      <p className="font-mono text-xs break-all">{me.data.storage.data_dir}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">SQLite DB</span>
                      <p className="font-mono text-xs break-all">{me.data.storage.sqlite_db}</p>
                    </div>
                  </>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Not authenticated or unable to fetch user info.</span>
            )}
          </CardContent>
        </Card>

        {areDestructiveActionsHidden() ? null : (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base flex min-w-0 flex-wrap items-center justify-between gap-2">
              Snapshot Health
              <Button
                variant="outline"
                size="sm"
                onClick={() => snapshotHealth.mutate(false)}
                disabled={snapshotHealth.isPending}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${snapshotHealth.isPending ? "animate-spin" : ""}`} />
                Check
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotHealth.data ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Stale Snapshots</span>
                  <span className="font-medium">{snapshotHealth.data.stale_snapshots ?? 0}</span>
                </div>
                {snapshotHealth.data.stale_snapshots && snapshotHealth.data.stale_snapshots > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => snapshotHealth.mutate(true)}
                    disabled={snapshotHealth.isPending}
                  >
                    Auto-fix Stale Snapshots
                  </Button>
                )}
                {snapshotHealth.data.details && (
                  <JsonViewer data={snapshotHealth.data.details} />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click Check to run snapshot health analysis.</p>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* Endpoints + Connect harness — shown when serverInfo is loaded */}
      {serverInfo.data && (
        <>
          <Separator className="my-6" />
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            {/* Endpoints card */}
            {serverInfo.data.endpoints && Object.keys(serverInfo.data.endpoints).length > 0 && (
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-base">Endpoints</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-2 text-sm">
                  {Object.entries(serverInfo.data.endpoints).map(([key, path]) => {
                    const fullUrl = serverInfo.data!.apiBase
                      ? `${serverInfo.data!.apiBase.replace(/\/$/, "")}${path}`
                      : path;
                    return (
                      <div key={key} className="flex min-w-0 justify-between gap-2">
                        <span className="shrink-0 text-muted-foreground">{key.replace(/_/g, " ")}</span>
                        <span className="min-w-0 break-all text-right font-mono text-xs">{fullUrl}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Connect your harness card */}
            {serverInfo.data.mcpUrl && (
              <ConnectHarnessCard mcpUrl={serverInfo.data.mcpUrl} />
            )}
          </div>
        </>
      )}

      <Separator className="my-6" />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <SessionAttestationCard />
        <AttributionSummary />
      </div>
    </PageShell>
  );
}
