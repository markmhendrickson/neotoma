// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProductBenefitPills } from "./ProductBenefitPills";

afterEach(cleanup);

describe("product benefit disclosures", () => {
  it("explains every benefit on focus and keeps only one explanation open", () => {
    render(<ProductBenefitPills />);
    for (const label of ["MIT", "Local-first", "MCP", "REST API", "CLI"]) {
      const trigger = screen.getByRole("button", { name: label });
      fireEvent.focus(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const detail = document.getElementById(trigger.getAttribute("aria-controls")!);
      expect(detail).not.toHaveAttribute("hidden");
      expect(
        within(screen.getByRole("list", { name: "Product details" })).getAllByRole("button", {
          expanded: true,
        })
      ).toHaveLength(1);
      fireEvent.blur(trigger, { relatedTarget: null });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("pins on activation, dismisses on Escape and waits for a fresh interaction", () => {
    render(<ProductBenefitPills />);
    const trigger = screen.getByRole("button", { name: "MCP" });
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.focus(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.pointerLeave(trigger.parentElement!);
    fireEvent.focus(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("allows outside activation to dismiss a pinned disclosure", () => {
    render(
      <>
        <ProductBenefitPills />
        <button type="button">Outside</button>
      </>
    );
    const trigger = screen.getByRole("button", { name: "CLI" });
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on touch activation without a synthetic hover reopening a dismissed pill", () => {
    render(<ProductBenefitPills />);
    const trigger = screen.getByRole("button", { name: "Local-first" });
    fireEvent.pointerEnter(trigger.parentElement!, { pointerType: "touch" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    fireEvent.pointerEnter(trigger.parentElement!, { pointerType: "mouse" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
