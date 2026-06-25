import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { redeemSandboxSession } from "@/lib/sandbox_session";

interface SandboxPack {
  id: string;
  kind: string;
  label: string;
}

interface RootLandingPayload {
  sandbox_packs?: SandboxPack[];
  sandbox_default_pack_id?: string;
}

type PickerStatus = "loading" | "idle" | "starting" | "error";

/**
 * Sandbox session starter, rendered on the Inspector home in sandbox modes.
 *
 * Replaces the old server-rendered landing page: the visitor picks a fixture
 * pack, this POSTs `/sandbox/session/new`, redeems the one-time code into a
 * bearer (via {@link redeemSandboxSession}), and reloads so route loaders
 * hydrate with the seeded, per-visitor workspace.
 *
 * Pack list comes from the root JSON (`GET / ` with `Accept: application/json`),
 * which already advertises `sandbox_packs` + `sandbox_default_pack_id` — no
 * extra endpoint needed.
 */
export function SandboxPackPicker() {
  const [packs, setPacks] = useState<SandboxPack[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<PickerStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data: RootLandingPayload) => {
        if (cancelled) return;
        const list = Array.isArray(data.sandbox_packs) ? data.sandbox_packs : [];
        setPacks(list);
        setSelected(data.sandbox_default_pack_id ?? list[0]?.id ?? "");
        setStatus("idle");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    if (!selected) return;
    setStatus("starting");
    setError(null);
    try {
      const res = await fetch("/sandbox/session/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: selected }),
        credentials: "include",
      });
      const data = (await res.json()) as {
        one_time_code?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || data.error || !data.one_time_code) {
        throw new Error(data.message || data.error || "Failed to create session");
      }
      await redeemSandboxSession({ code: data.one_time_code });
      // Reload so route-level data loaders hydrate with the new bearer and the
      // freshly seeded, isolated workspace.
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  const starter = packs.filter((p) => p.kind === "generic" || p.kind === "empty");
  const useCases = packs.filter((p) => p.kind === "use_case");
  const busy = status === "loading" || status === "starting";

  return (
    <Card data-testid="sandbox-pack-picker">
      <CardContent className="space-y-3 p-4">
        <div>
          <h2 className="text-base font-semibold">Start a sandbox session</h2>
          <p className="text-sm text-muted-foreground">
            Choose a data pack to seed your own ephemeral workspace. Your data is deleted when the
            session expires or you end it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sandbox data pack"
            value={selected}
            disabled={busy || packs.length === 0}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {starter.length > 0 && (
              <optgroup label="Starter">
                {starter.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            )}
            {useCases.length > 0 && (
              <optgroup label="Use cases">
                {useCases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Button onClick={start} disabled={!selected || busy}>
            {status === "starting" ? "Starting…" : "Start session"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
