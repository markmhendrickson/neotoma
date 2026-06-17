import {
  getApiUrl,
  getDefaultApiUrl,
  getInspectorEnvironment,
  isProxyDefaultEnabled,
  resolveInspectorBadgeEnvironment,
} from "@/api/client";
import { useHealthCheck, useMe, useServerInfo } from "@/hooks/use_infra";
import { SidebarFooter } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatInspectorUserBadge } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Circle, Database, Server, User } from "lucide-react";

type SidebarUserFooterProps = {
  collapsed: boolean;
};

function fileBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const i = normalized.lastIndexOf("/");
  return i >= 0 ? normalized.slice(i + 1) : normalized;
}

function statusLabel(isHealthy: boolean, isLoading: boolean): string {
  if (isHealthy) return "Connected";
  if (isLoading) return "Connecting...";
  return "Disconnected";
}

export function SidebarUserFooter({ collapsed }: SidebarUserFooterProps) {
  const me = useMe();
  const health = useHealthCheck();
  const serverInfo = useServerInfo();

  if (!me.data) {
    return null;
  }

  const label = formatInspectorUserBadge(me.data.email, me.data.user_id);
  const isHealthy = health.data?.ok === true;
  const viteInspectorEnv = getInspectorEnvironment();
  const inspectorEnv = resolveInspectorBadgeEnvironment(serverInfo.data?.neotoma_env, viteInspectorEnv);
  const sqlitePath = me.data.storage?.sqlite_db;
  const dataDir = me.data.storage?.data_dir;
  const storageLabel = sqlitePath
    ? fileBasename(sqlitePath)
    : me.data.storage?.storage_backend
      ? me.data.storage.storage_backend
      : "remote";
  const apiTargetRaw = isProxyDefaultEnabled() ? `proxy /api -> ${getDefaultApiUrl()}` : getApiUrl();
  const apiTarget = apiTargetRaw.trim() ? apiTargetRaw : "Not configured (set in Settings)";
  const connectionLabel = statusLabel(isHealthy, health.isLoading);

  const trigger = (
    <button
      type="button"
      className={cn(
        "flex w-full items-center rounded-md border border-sidebar-border bg-sidebar-accent/40 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "h-9 justify-center p-0" : "gap-2 px-2 py-2",
      )}
    >
      {collapsed ? (
        <span className="relative">
          <User className="h-4 w-4" />
          <Circle
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 fill-current",
              isHealthy ? "text-success" : health.isLoading ? "text-warning" : "text-destructive",
            )}
          />
        </span>
      ) : (
        <>
          <User className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{label}</span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-sidebar-foreground/60">
              <Circle
                className={cn(
                  "h-2 w-2 shrink-0 fill-current",
                  isHealthy ? "text-success" : health.isLoading ? "text-warning" : "text-destructive",
                )}
              />
              <span className="shrink-0">{connectionLabel}</span>
              <span aria-hidden>·</span>
              <span className="shrink-0 capitalize">{inspectorEnv}</span>
              <span aria-hidden>·</span>
              <span className="truncate capitalize">{storageLabel}</span>
            </span>
          </span>
        </>
      )}
    </button>
  );

  return (
    <SidebarFooter className={cn(collapsed && "items-center px-2")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          side={collapsed ? "right" : "top"}
          align="start"
          className="w-80 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel>App session</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="space-y-3 p-2 text-xs">
            <div className="flex min-w-0 items-start gap-2">
              <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium">{label}</p>
                <p className="mt-1 break-all font-mono text-muted-foreground">{me.data.user_id}</p>
                {me.data.sandbox_mode && me.data.sandbox_mode !== "local" ? (
                  <Badge
                    variant={me.data.sandbox_mode === "refuse" ? "destructive" : "secondary"}
                    className="mt-1.5"
                  >
                    {me.data.sandbox_mode}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p>
                  <span className="text-muted-foreground">Connection: </span>
                  {connectionLabel} · <span className="capitalize">{inspectorEnv}</span>
                </p>
                <p className="break-all font-mono text-muted-foreground">{apiTarget}</p>
                <p className="text-muted-foreground">
                  API <span className="font-mono">neotoma_env</span>:{" "}
                  {serverInfo.data?.neotoma_env ?? "..."}; app build default:{" "}
                  <span className="font-mono">{viteInspectorEnv}</span>
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p>
                  <span className="text-muted-foreground">Storage: </span>
                  <span className="capitalize">{storageLabel}</span>
                </p>
                {sqlitePath ? (
                  <>
                    <p className="break-all font-mono text-muted-foreground">{sqlitePath}</p>
                    {dataDir ? (
                      <p className="break-all font-mono text-muted-foreground">
                        <span>Data dir: </span>
                        {dataDir}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Local SQLite path is not disclosed for this session.
                  </p>
                )}
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
}
