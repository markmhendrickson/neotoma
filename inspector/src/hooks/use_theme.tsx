import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function read_stored_theme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
}

function apply_theme_to_dom(theme_value: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark");
  if (theme_value === "system") {
    const system_prefers_dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (system_prefers_dark) root.classList.add("dark");
  } else if (theme_value === "dark") {
    root.classList.add("dark");
  }
}

type Theme_context_value = {
  theme: Theme;
  set_theme: (theme: Theme) => void;
};

const Theme_context = createContext<Theme_context_value | null>(null);

export function Theme_provider({ children }: { children: ReactNode }) {
  const [theme, set_theme_state] = useState<Theme>(read_stored_theme);

  const set_theme = useCallback((next: Theme) => {
    set_theme_state(next);
  }, []);

  useEffect(() => {
    apply_theme_to_dom(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    if (theme === "system") {
      const media_query = window.matchMedia("(prefers-color-scheme: dark)");
      const handle_change = () => apply_theme_to_dom("system");
      media_query.addEventListener("change", handle_change);
      return () => media_query.removeEventListener("change", handle_change);
    }
  }, [theme]);

  return (
    <Theme_context.Provider value={{ theme, set_theme }}>{children}</Theme_context.Provider>
  );
}

export function use_theme(): Theme_context_value {
  const value = useContext(Theme_context);
  if (!value) {
    throw new Error("use_theme must be used within Theme_provider");
  }
  return value;
}

/** Run before React mounts so the first paint matches stored or system preference. */
export function initialize_theme_on_load() {
  const stored = localStorage.getItem(STORAGE_KEY) || "system";
  const root = document.documentElement;
  if (stored === "system") {
    const system_prefers_dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", system_prefers_dark);
  } else {
    root.classList.toggle("dark", stored === "dark");
  }
}
