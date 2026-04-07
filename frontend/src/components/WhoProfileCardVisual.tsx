import type { LucideIcon } from "lucide-react";
import whoIcpOperatingSquare from "@/assets/images/who/who_icp_operating_square.png";
import whoIcpBuildingPipelinesSquare from "@/assets/images/who/who_icp_building_pipelines_square.png";
import whoIcpDebuggingInfrastructureSquare from "@/assets/images/who/who_icp_debugging_infrastructure_square.png";

type WhoCardVisualConfig = {
  panelClass: string;
  glowClass: string;
  accentClass: string;
  chipClass: string;
};

export const WHO_CARD_VISUALS: Record<string, WhoCardVisualConfig> = {
  operating: {
    panelClass:
      "border-border/70 bg-gradient-to-b from-muted/50 to-muted/25 dark:from-muted/30 dark:to-muted/10",
    glowClass: "bg-sky-400/20 dark:bg-sky-500/15",
    accentClass:
      "border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300",
    chipClass:
      "border-border/80 bg-background/90 text-foreground/85 dark:bg-background/40 dark:text-foreground/90",
  },
  "building-pipelines": {
    panelClass:
      "border-border/70 bg-gradient-to-b from-muted/50 to-muted/25 dark:from-muted/30 dark:to-muted/10",
    glowClass: "bg-violet-400/20 dark:bg-violet-500/15",
    accentClass:
      "border-violet-500/25 bg-violet-500/[0.08] text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
    chipClass:
      "border-border/80 bg-background/90 text-foreground/85 dark:bg-background/40 dark:text-foreground/90",
  },
  "debugging-infrastructure": {
    panelClass:
      "border-border/70 bg-gradient-to-b from-muted/50 to-muted/25 dark:from-muted/30 dark:to-muted/10",
    glowClass: "bg-amber-400/20 dark:bg-amber-500/15",
    accentClass:
      "border-amber-500/25 bg-amber-500/[0.08] text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
    chipClass:
      "border-border/80 bg-background/90 text-foreground/85 dark:bg-background/40 dark:text-foreground/90",
  },
};

const WHO_ICP_SQUARE_ILLUS: Record<string, string> = {
  operating: whoIcpOperatingSquare,
  "building-pipelines": whoIcpBuildingPipelinesSquare,
  "debugging-infrastructure": whoIcpDebuggingInfrastructureSquare,
};

/** Match homepage guarantee card image treatment */
const WHO_ICP_ILLUS_IMG_CLASS =
  "absolute inset-0 h-full w-full rounded-lg object-contain object-center p-1.5 sm:p-2 opacity-[0.95] dark:opacity-100 transition-transform duration-300 group-hover:scale-[1.03] pointer-events-none select-none";

const MODE_ICON_BOX_CLASS =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm";

export function WhoProfileCardVisual({
  profileSlug,
  modeLabel,
  Icon,
}: {
  profileSlug: string;
  modeLabel: string;
  Icon: LucideIcon;
}) {
  const visual = WHO_CARD_VISUALS[profileSlug] ?? WHO_CARD_VISUALS["operating"];
  const illusSrc = WHO_ICP_SQUARE_ILLUS[profileSlug] ?? WHO_ICP_SQUARE_ILLUS["operating"];

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`pointer-events-none relative overflow-hidden rounded-xl border ${visual.panelClass}`}
        aria-hidden="true"
      >
        <div
          className={`pointer-events-none absolute inset-x-6 -top-8 h-16 rounded-full blur-2xl ${visual.glowClass}`}
        />
        <div className="relative flex items-center justify-between gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide ${visual.chipClass}`}
          >
            {modeLabel}
          </span>
          <span className={`${MODE_ICON_BOX_CLASS} ${visual.accentClass}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
        <div className="relative flex justify-center px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
          <div className="relative mx-auto w-full max-w-[160px] sm:max-w-[180px] aspect-square bg-gradient-to-b from-muted/30 to-transparent">
            <img
              src={illusSrc}
              alt=""
              width={1024}
              height={1024}
              className={WHO_ICP_ILLUS_IMG_CLASS}
              loading="lazy"
              decoding="async"
              draggable={false}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}
