import { Info } from "lucide-react";
import type { ServerMode } from "@/types/api";

interface OrientationStripProps {
  mode: ServerMode | undefined;
  dataDir?: string;
}

/**
 * One-line orientation for visitors who arrive without context. Hidden in
 * installed-operator modes (`local`, `production`) because those users already
 * know what Neotoma is and where their data lives — they don't need a sandbox
 * disclaimer above their dashboard.
 *
 * Copy is intentionally one factual sentence per mode. No marketing, no CTA;
 * the CTA lives in `ActivateCard` below.
 */
export function OrientationStrip({ mode, dataDir }: OrientationStripProps) {
  const copy = orientationCopy(mode, dataDir);
  if (!copy) return null;
  return (
    <div
      role="note"
      data-testid="orientation-strip"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0">{copy}</p>
    </div>
  );
}

function orientationCopy(mode: ServerMode | undefined, dataDir?: string): string | null {
  switch (mode) {
    case "hosted_sandbox":
      return "You're in the public Neotoma sandbox. Data here resets weekly and is shared across visitors — install locally to keep your own.";
    case "local_sandbox":
      return "You're connected to a local Neotoma sandbox (developer dev environment). Data lives in this checkout's database.";
    case "refuse":
      return "Neotoma booted in refuse mode — auth and bind configuration are incomplete. The app is read-only until the server is reconfigured.";
    case "local":
    case "production":
    case undefined:
    default:
      // Operators don't need an orientation strip. dataDir surfaces in the
      // settings/server-info page; we don't repeat it here.
      void dataDir;
      return null;
  }
}
