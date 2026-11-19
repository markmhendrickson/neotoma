// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as testingRender, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { ProductBenefitPills } from "./ProductBenefitPills";

function render(ui: ReactElement) {
  return testingRender(<MemoryRouter><LocaleProvider>{ui}</LocaleProvider></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("product benefit links and tooltips", () => {
  it("keeps all five ordinary destinations and gives each a useful focus explanation", () => {
    render(<ProductBenefitPills />);
    const list = screen.getByRole("list", { name: "Product details" });
    const destinations = [
      ["MIT", "/license/"],
      ["Local-first", "/local-first/"],
      ["MCP", "/mcp/"],
      ["REST API", "/rest-api/"],
      ["CLI", "/cli/"],
    ];
    for (const [label, href] of destinations) {
      const link = within(list).getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
      fireEvent.focus(link);
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.textContent!.length).toBeGreaterThan(35);
      expect(link).toHaveAttribute("aria-describedby", tooltip.id);
      expect(screen.getAllByRole("tooltip")).toHaveLength(1);
      fireEvent.blur(link);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    }
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
  });

  it("opens on pointer hover, closes on leave, and ignores touch hover", () => {
    render(<ProductBenefitPills />);
    const link = screen.getByRole("link", { name: "MCP" });
    fireEvent.pointerEnter(link.parentElement!, { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.pointerEnter(link.parentElement!, { pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("MCP client");
    fireEvent.pointerLeave(link.parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("Escape dismisses a focused tooltip without changing the link destination", () => {
    render(<ProductBenefitPills />);
    const link = screen.getByRole("link", { name: "CLI" });
    fireEvent.focus(link);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(link, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/cli/");
    expect(link).not.toHaveAttribute("aria-expanded");
  });

  it("moves a right-edge tooltip inside the viewport", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      return {
        left: this.tagName === "LI" ? 275 : 0,
        width: this.classList.contains("plan-benefit-tooltip") ? 270 : 0,
      } as DOMRect;
    });
    render(<ProductBenefitPills />);
    fireEvent.focus(screen.getByRole("link", { name: "CLI" }));
    expect(screen.getByRole("tooltip")).toHaveStyle("--popover-shift: -237px");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });
});
