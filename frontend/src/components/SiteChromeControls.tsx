import { useNavigate, useLocation } from "react-router-dom";
import { Globe, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/i18n/LocaleContext";
import { LOCALE_LANGUAGE_NAME, SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";
import { localizePath, saveLocale } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const footerControlClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function ThemeToggleNavButton() {
  const { theme, cycleTheme } = useTheme();
  const { dict } = useLocale();
  const label =
    theme === "system" ? dict.themeSystem : theme === "dark" ? dict.themeDark : dict.themeLight;
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={label}
      title={label}
      className={footerControlClass}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function LanguageNavButton() {
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const { locale, dict } = useLocale();

  const handleSelect = (newLocale: SupportedLocale) => {
    if (newLocale === locale) return;
    saveLocale(newLocale);
    const targetPath = localizePath(pathname, newLocale);
    const target = `${targetPath}${hash || ""}`;
    if (typeof window !== "undefined") {
      window.location.assign(target);
      return;
    }
    navigate(target);
  };

  const trigger = (
    <button
      type="button"
      aria-label={dict.language}
      title={dict.language}
      className={footerControlClass}
    >
      <Globe className="h-4 w-4" aria-hidden />
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem] bg-popover" translate="no">
        {SUPPORTED_LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleSelect(loc)}
            className="cursor-pointer"
          >
            {LOCALE_LANGUAGE_NAME[loc]}
            {loc === locale ? " ✓" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
