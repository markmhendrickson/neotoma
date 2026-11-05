// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { EvaluationCard, EVALUATION_PROMPT_EN, EVALUATION_PROMPT_ES } from "./EvaluationCard";
import { InstallPageBody } from "../install/install_page_body";
import { EvaluateAgentInstructionsPage } from "../subpages/EvaluateAgentInstructionsPage";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("shared evaluation handoff", () => {
  it.each(["en", "es"])("copies the same complete %s prompt used by homepage and subpages", async (locale) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const path = locale === "es" ? "/es/compare" : "/compare";
    render(<MemoryRouter initialEntries={[path]}><LocaleProvider><EvaluationCard id="compare-evaluate" /></LocaleProvider></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(locale === "es" ? "Comprueba si Neotoma encaja" : "See whether Neotoma fits");
    fireEvent.click(screen.getByRole("button", { name: locale === "es" ? /copiar/i : /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(locale === "es" ? EVALUATION_PROMPT_ES : EVALUATION_PROMPT_EN));
  });

  it.each(["en", "es"])("keeps %s installation reader handoffs inside the preview mount", (locale) => {
    const localized = locale === "es" ? "/es" : "";
    const path = `/pr-314${localized}/install`;
    window.history.replaceState({}, "", path);
    const tree = <MemoryRouter basename="/pr-314" initialEntries={[path]}><LocaleProvider><InstallPageBody /></LocaleProvider></MemoryRouter>;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(tree);
    const view = render(tree, { container, hydrate: true });
    for (const link of view.container.querySelectorAll(".plan-install-guide a"))
      expect(link.getAttribute("href")).toMatch(new RegExp(`^/pr-314${localized}/install/`));
    expect(view.container.querySelector(`a[href="/pr-314${localized}/install/system-changes/"]`)).toBeInTheDocument();
    expect(view.container.querySelector(`a[href="/pr-314${localized}/install/claude-code/"]`)).toBeInTheDocument();
    expect(view.container.querySelector(`a[href^="${localized}/install/"]`)).toBeNull();
  });

  it.each(["en", "es"])("keeps %s agent-guide links inside a hydrated preview mount", (locale) => {
    const localized = locale === "es" ? "/es" : "";
    const path = `/pr-314${localized}/evaluate/agent-instructions`;
    window.history.replaceState({}, "", path);
    const tree = <HelmetProvider><MemoryRouter basename="/pr-314" initialEntries={[path]}><LocaleProvider><EvaluateAgentInstructionsPage /></LocaleProvider></MemoryRouter></HelmetProvider>;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(tree);
    const view = render(tree, { container, hydrate: true });
    for (const host of ["chatgpt", "claude-desktop", "cursor", "claude-code", "codex", "opencode", "openclaw"]) {
      expect(view.container.querySelector(`a[href="/pr-314${localized}/install/${host}/"]`), host).toBeInTheDocument();
    }
    expect(view.container.querySelector(`a[href^="${localized}/install/"]`)).toBeNull();
  });
});
