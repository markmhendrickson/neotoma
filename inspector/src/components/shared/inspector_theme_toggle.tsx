import { Monitor, Moon, Sun } from "lucide-react";
import { use_theme, type Theme } from "@/hooks/use_theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

type InspectorThemeToggleProps = {
  showLabels?: boolean;
  className?: string;
};

export function InspectorThemeToggle({ showLabels = false, className }: InspectorThemeToggleProps) {
  const { theme, set_theme } = use_theme();
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/40 p-1.5",
        className,
      )}
      role="radiogroup"
      aria-label="Theme"
    >
      <div className={cn("grid grid-cols-3 gap-1", showLabels && "gap-2")}>
        {THEME_OPTIONS.map((option) => {
          const ThemeIcon = option.icon;
          const selected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${option.label} theme`}
              title={`${option.label} theme`}
              onClick={() => set_theme(option.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                showLabels
                  ? "px-2 py-2 hover:bg-accent hover:text-accent-foreground"
                  : "h-7 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                showLabels
                  ? selected && "bg-accent text-accent-foreground shadow-sm"
                  : selected &&
                      "bg-sidebar text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border",
                !selected && (showLabels ? "text-muted-foreground" : "text-sidebar-foreground/60"),
              )}
            >
              <ThemeIcon className={cn("shrink-0", showLabels ? "size-4" : "size-3.5")} aria-hidden />
              {showLabels ? (
                <span className="text-xs font-medium">{option.label}</span>
              ) : (
                <span className="sr-only">{option.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
