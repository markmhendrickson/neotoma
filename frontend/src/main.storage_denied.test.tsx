// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./hooks/useTheme";

function denyStorage() {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(window, key, {
      configurable: true,
      get: () => { throw new DOMException("Storage denied", "SecurityError"); },
    });
  }
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("public site with denied browser storage", () => {
  it("keeps an in-memory theme when reads and writes throw", async () => {
    denyStorage();
    function ThemeProbe() {
      const { theme, cycleTheme } = useTheme();
      return <button onClick={cycleTheme}>{theme}</button>;
    }
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByRole("button", { name: "system" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "system" }));
    expect(screen.getByRole("button", { name: "light" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  });

  it("boots the real app and changes explicit language routes without storage", async () => {
    denyStorage();
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, "", "/es/privacy/");
    await import("./main");
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("es");
      expect(screen.getByRole("link", { name: "English" })).toBeInTheDocument();
    });
    const english = screen.getByRole("link", { name: "English" });
    english.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(english); // The save attempt must not block the ordinary anchor.
    await act(async () => {
      window.history.pushState({}, "", "/privacy/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
      expect(screen.getByRole("link", { name: "Español" })).toBeInTheDocument();
    });
  });
});
