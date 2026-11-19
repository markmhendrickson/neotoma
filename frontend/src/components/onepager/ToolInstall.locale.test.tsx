// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { CONNECTIONS } from "../../../../src/shared/harness_connections";
import { activationPrompt } from "./onepager_copy";
import { spanishToolCopy } from "./spanish_tool_install_copy";
import { ToolInstall } from "./ToolInstall";

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  for (const name of ["setPointerCapture", "releasePointerCapture", "scrollIntoView"])
    if (!(name in HTMLElement.prototype))
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: () => {} });
  if (!("hasPointerCapture" in HTMLElement.prototype))
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("copied connection guide locale", () => {
  for (const locale of ["en", "es"] as const) {
    it(`uses ${locale} guide paths for all hosts and copies the same text`, async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      const { container } = render(
        <MemoryRouter initialEntries={[`/${locale}/`]}><LocaleProvider><ToolInstall /></LocaleProvider></MemoryRouter>
      );
      const chooser = screen.getByRole("combobox", { name: locale === "es" ? "Elige tu herramienta" : "Choose your tool" });
      for (const host of CONNECTIONS) {
        await user.click(chooser);
        await user.click(screen.getByRole("option", { name: host.host }));
        const guidePath = `${locale === "es" ? "/es" : ""}${host.guideRoute}`;
        const guideUrl = `https://neotoma.io${guidePath}`;
        const snippets = container.querySelectorAll<HTMLElement>(".plan-tool-install > .site-snippet");
        expect(snippets).toHaveLength(2);
        const prompt = snippets[1].querySelector('.site-snippet-prose')?.textContent;
        expect(prompt).toBe(locale === "es" ? spanishToolCopy(host).activation : activationPrompt(host));
        expect(prompt).toMatch(locale === "es" ? /^Empieza por esta conversación/ : /^Start with this conversation/);
        expect(prompt).not.toMatch(/step 1|paso 1|known entity|entidad conocida|hooks|Inspecciona/);
        if (snippets[0].textContent?.includes("https://neotoma.io/"))
          expect(snippets[0]).toHaveTextContent(guideUrl);
        expect(screen.getByRole("link", { name: new RegExp(host.host) })).toHaveAttribute("href", guidePath);
      }

      // Test the exact clipboard payload, including a manual code snippet and the activation prompt.
      await user.click(chooser);
      await user.click(screen.getByRole("option", { name: "Windsurf" }));
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      const snippets = container.querySelectorAll<HTMLElement>(".plan-tool-install > .site-snippet");
      for (const snippet of snippets) {
        const title = snippet.querySelector(".site-snippet-title")?.textContent?.trim();
        expect(title).toBeTruthy();
        fireEvent.click(within(snippet).getByRole("button", { name: `${locale === "es" ? "Copiar" : "Copy"} ${title}` }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(snippet.querySelector(".site-snippet-prose")?.textContent ?? snippet.querySelector("code")?.textContent));
        writeText.mockClear();
      }
    });
  }
});
