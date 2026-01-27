import { useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Read from localStorage or default to system
    const stored = localStorage.getItem("theme") as Theme | null;
    return stored || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (themeValue: Theme) => {
      // Remove existing dark class first
      root.classList.remove("dark");
      
      if (themeValue === "system") {
        const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (systemPrefersDark) {
          root.classList.add("dark");
        }
      } else if (themeValue === "dark") {
        root.classList.add("dark");
      }
      // light mode: don't add dark class (already removed above)
    };

    applyTheme(theme);
    localStorage.setItem("theme", theme);

    // Listen for system theme changes when using system mode
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  return { theme, setTheme };
}
