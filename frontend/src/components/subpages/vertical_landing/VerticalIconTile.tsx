import type { LucideIcon } from "lucide-react";

/** Aligns with `AccentColor` on vertical landing pages. */
export type VerticalIconAccent =
  | "amber"
  | "emerald"
  | "indigo"
  | "sky"
  | "violet"
  | "cyan"
  | "teal"
  | "orange"
  | "blue"
  | "rose"
  | "slate"
  | "pink"
  | "lime";

const TILE_BY_ACCENT: Record<
  VerticalIconAccent,
  { border: string; bg: string; icon: string }
> = {
  amber: { border: "border-amber-500/40", bg: "bg-amber-500/10", icon: "text-amber-500" },
  emerald: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", icon: "text-emerald-500" },
  indigo: { border: "border-indigo-500/40", bg: "bg-indigo-500/10", icon: "text-indigo-500" },
  sky: { border: "border-sky-500/40", bg: "bg-sky-500/10", icon: "text-sky-500" },
  violet: { border: "border-violet-500/40", bg: "bg-violet-500/10", icon: "text-violet-500" },
  cyan: { border: "border-cyan-500/40", bg: "bg-cyan-500/10", icon: "text-cyan-500" },
  teal: { border: "border-teal-500/40", bg: "bg-teal-500/10", icon: "text-teal-500" },
  orange: { border: "border-orange-500/40", bg: "bg-orange-500/10", icon: "text-orange-500" },
  blue: { border: "border-blue-500/40", bg: "bg-blue-500/10", icon: "text-blue-500" },
  rose: { border: "border-rose-500/40", bg: "bg-rose-500/10", icon: "text-rose-500" },
  slate: { border: "border-slate-500/40", bg: "bg-slate-500/10", icon: "text-slate-500" },
  pink: { border: "border-pink-500/40", bg: "bg-pink-500/10", icon: "text-pink-500" },
  lime: { border: "border-lime-500/40", bg: "bg-lime-500/10", icon: "text-lime-500" },
};

export type VerticalIconTileProps = {
  Icon: LucideIcon;
  /** Used when border/bg/icon classes are not passed explicitly. */
  accent?: VerticalIconAccent;
  borderClass?: string;
  bgClass?: string;
  iconClass?: string;
  className?: string;
  /** Default true: icon is decorative next to visible text. */
  decorative?: boolean;
};

export function VerticalIconTile({
  Icon,
  accent = "emerald",
  borderClass,
  bgClass,
  iconClass,
  className = "",
  decorative = true,
}: VerticalIconTileProps) {
  const preset = TILE_BY_ACCENT[accent];
  const b = borderClass ?? preset.border;
  const bg = bgClass ?? preset.bg;
  const ic = iconClass ?? preset.icon;
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 shadow-sm ${b} ${bg} ${className}`.trim()}
      {...(decorative ? { "aria-hidden": true as const } : {})}
    >
      <Icon className={`h-6 w-6 ${ic}`} strokeWidth={2.25} />
    </div>
  );
}
