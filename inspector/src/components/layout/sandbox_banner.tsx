import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  isSandboxUiEnabled,
  SANDBOX_HOST_LABEL,
  SANDBOX_WEEKLY_RESET_LABEL,
} from "@/lib/sandbox";
import {
  clearSandboxSession,
  forgetSandboxSessionClient,
  formatRemaining,
  readStoredSandboxSession,
  remainingSessionMs,
  type SandboxSessionDescriptor,
} from "@/lib/sandbox_session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use_infra";
import { AlertTriangle, Flag, RefreshCw, LogOut } from "lucide-react";

function tierLabel(tier?: string): { label: string; className: string } {
  switch (tier) {
    case "hardware":
      return { label: "Hardware-verified", className: "border-green-600 text-green-700" };
    case "software":
      return { label: "Software-verified", className: "border-emerald-600 text-emerald-700" };
    case "unverified_client":
      return { label: "Unverified client", className: "border-amber-600 text-amber-700" };
    case "anonymous":
      return { label: "Anonymous", className: "border-muted-foreground text-muted-foreground" };
    default:
      return { label: tier || "Unknown", className: "border-muted-foreground text-muted-foreground" };
  }
}

/**
 * Tick the session descriptor once a second so the countdown label updates.
 * Returns `null` when no session is stored (static sandbox UI mode still
 * renders the banner, just without the ephemeral-session controls).
 */
function useLiveSandboxSession(): SandboxSessionDescriptor | null {
  const [descriptor, setDescriptor] = useState<SandboxSessionDescriptor | null>(() =>
    readStoredSandboxSession(),
  );
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!descriptor) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [descriptor]);
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.storageArea !== window.sessionStorage) return;
      setDescriptor(readStoredSandboxSession());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  if (!descriptor) return null;
  return descriptor;
}

async function resetSandboxSession(descriptor: SandboxSessionDescriptor): Promise<void> {
  try {
    const res = await fetch("/sandbox/session/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pack_id: descriptor.packId || null }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { inspector_redirect_url?: string };
    if (data?.inspector_redirect_url) {
      window.location.assign(data.inspector_redirect_url);
      return;
    }
  } catch {
    // Fall through: clear client state and send user back to sandbox picker.
  }
  clearSandboxSession();
  window.location.assign(`${descriptor.apiBase}/?from=inspector`);
}

async function endSandboxSession(descriptor: SandboxSessionDescriptor): Promise<void> {
  try {
    await fetch("/sandbox/session", {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // best effort; purge client state regardless
  }
  forgetSandboxSessionClient();
  window.location.assign(`${descriptor.apiBase}/?from=inspector`);
}

export function SandboxBanner() {
  const session = useSession();
  const descriptor = useLiveSandboxSession();
  if (!isSandboxUiEnabled() && !descriptor) return null;

  const tier = session.data?.attribution?.tier;
  const chip = tierLabel(tier);
  const remaining = descriptor ? formatRemaining(remainingSessionMs(descriptor)) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        <span>{descriptor ? "Sandbox session" : "Public sandbox"}</span>
      </div>
      {descriptor ? (
        <span className="text-amber-800/90 dark:text-amber-200/90">
          Pack <span className="font-mono">{descriptor.packId || "unknown"}</span> · expires in{" "}
          <span className="font-mono">{remaining}</span>. Data auto-deletes on end / reset / expiry.
        </span>
      ) : (
        <span className="text-amber-800/90 dark:text-amber-200/90">
          Running on <span className="font-mono">{SANDBOX_HOST_LABEL}</span>. All data is public,
          rate-limited, and wiped weekly ({SANDBOX_WEEKLY_RESET_LABEL}).
        </span>
      )}
      {tier ? (
        <Badge variant="outline" className={`font-normal ${chip.className}`}>
          AAuth: {chip.label}
        </Badge>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        {descriptor ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => resetSandboxSession(descriptor)}
              title="Purge this session and start a fresh one"
            >
              <RefreshCw className="h-3 w-3" aria-hidden /> Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => endSandboxSession(descriptor)}
              title="Hard-delete this session and return to the picker"
            >
              <LogOut className="h-3 w-3" aria-hidden /> End session
            </Button>
          </>
        ) : null}
        <Link
          to="/sandbox#terms"
          className="underline-offset-2 hover:underline focus:outline-none focus:underline"
        >
          Terms
        </Link>
        <Link
          to="/sandbox#report"
          className="inline-flex items-center gap-1 underline-offset-2 hover:underline focus:outline-none focus:underline"
        >
          <Flag className="h-3 w-3" aria-hidden />
          Report abuse
        </Link>
      </div>
    </div>
  );
}
