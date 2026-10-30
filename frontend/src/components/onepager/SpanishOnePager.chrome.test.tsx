// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { SpanishOnePager } from "./SpanishOnePager";

describe("Spanish one-pager controls", () => {
  it("offers every copy action in Spanish and starts directly with the installed MCP workflow", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/es/"]}>
        <LocaleProvider><SpanishOnePager pageRef={createRef<HTMLElement>()} /></LocaleProvider>
      </MemoryRouter>
    );
    const page = new DOMParser().parseFromString(markup, "text/html");
    const copyButtons = [...page.querySelectorAll<HTMLButtonElement>(".site-snippet-copy")];
    expect(copyButtons.length).toBeGreaterThanOrEqual(4);
    expect(copyButtons.every((button) => button.textContent?.trim() === "Copiar")).toBe(true);
    const activation = page.querySelector<HTMLElement>(".plan-tool-install .site-snippet-prose");
    expect(activation?.textContent).toMatch(/^Empieza por esta conversación\. Usa el MCP de Neotoma instalado/);
    expect(activation?.textContent).not.toMatch(/paso 1|herramientas del host|entidad conocida/);
    expect(page.querySelector(".plan-tool-install .plan-selected-verification")).toBeNull();
  });
});
