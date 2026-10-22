// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { runInNewContext } from "node:vm";
import { ENTITY_SCHEMAS } from "../../../../src/services/schema_definitions";
import { InterfaceExplorer } from "./InterfaceExplorer";
import { CodeBlock } from "../InstallCodeBlock";
import { NeotomaOnePager } from "./NeotomaOnePager";

vi.mock("./selected-site-identity.js", () => ({}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderedStorePayload(tab: string): Record<string, unknown> {
  fireEvent.click(screen.getByRole("tab", { name: tab }));
  const code =
    within(screen.getByRole("tabpanel", { name: tab })).getByRole("code").textContent ?? "";
  if (tab === "CLI") {
    const match = code.match(/--entities '([^']+)'/);
    if (!match) throw new Error("CLI store payload missing");
    return JSON.parse(match[1])[0];
  }
  if (tab === "MCP") {
    const match = code.match(/^store\((\{[^\n]+\})\)/m);
    if (!match) throw new Error("MCP store payload missing");
    return runInNewContext(`(${match[1]})`).entities[0];
  }
  const match = code.match(/-d '(\{"entities":\[[^']+\],"observation_source":"import"\})'/);
  if (!match) throw new Error("REST store payload missing");
  return JSON.parse(match[1]).entities[0];
}

describe("one-page interface examples", () => {
  it("renders one schema-complete invoice through all three natural store shapes", () => {
    render(<InterfaceExplorer />);
    const required = Object.entries(ENTITY_SCHEMAS.invoice.schema_definition.fields)
      .filter(([, definition]) => definition.required)
      .map(([field]) => field);
    expect(required).toContain("invoice_date");
    const payloads = ["CLI", "MCP", "REST API"].map(renderedStorePayload);
    for (const payload of payloads) {
      const missing = required.filter(
        (field) => payload[field] === undefined || payload[field] === null
      );
      expect(missing).toEqual([]);
      expect(payload.invoice_date).toBe("2026-10-01");
      expect(payload.invoice_date).not.toBe(payload.date_due);
    }
    expect(payloads[1]).toEqual(payloads[0]);
    expect(payloads[2]).toEqual(payloads[0]);
  });

  it("moves selection, visible panel, and focus with ArrowRight, ArrowLeft, Home and End", () => {
    render(<InterfaceExplorer />);
    const tabs = ["CLI", "MCP", "REST API"].map((name) => screen.getByRole("tab", { name }));
    for (const [from, key, to] of [
      [0, "ArrowRight", 1],
      [1, "ArrowLeft", 0],
      [0, "End", 2],
      [2, "Home", 0],
    ] as const) {
      tabs[from].focus();
      const event = createEvent.keyDown(tabs[from], { key, bubbles: true, cancelable: true });
      fireEvent(tabs[from], event);
      expect(event.defaultPrevented).toBe(true);
      expect(tabs[to]).toHaveAttribute("aria-selected", "true");
      expect(tabs[to]).toHaveFocus();
      expect(
        screen.getByRole("tabpanel", { name: tabs[to].textContent ?? "" })
      ).not.toHaveAttribute("hidden");
    }
  });
});

function clipboard(writeText: () => Promise<void>, execCommand: () => boolean) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
  Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(execCommand) });
}

describe("copy feedback on the one-page site", () => {
  beforeEach(() =>
    clipboard(
      async () => {},
      () => false
    )
  );

  it("reports install-copy failure after both clipboard paths fail, then clears it on retry", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValueOnce(undefined);
    const fallback = vi.fn(() => false);
    clipboard(write, fallback);
    render(
      <CodeBlock
        code="neotoma status --json"
        copyFeedbackId="site-test"
        installBlock="manual_commands"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /copy failed.*try again.*select.*manually/i
      )
    );
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");
    expect(screen.getByText("neotoma status --json")).toBeInTheDocument();
    expect(fallback).toHaveBeenCalledWith("copy");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(screen.getByRole("status")).not.toHaveTextContent(/failed/i);
  });

  it("reports evaluation-copy failure after both clipboard paths fail, then clears it on retry", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValueOnce(undefined);
    const fallback = vi.fn(() => false);
    clipboard(write, fallback);
    render(
      <MemoryRouter>
        <NeotomaOnePager />
      </MemoryRouter>
    );
    const evaluate = screen.getByText("Ask your agent to evaluate").closest(".plan-evaluate");
    if (!evaluate) throw new Error("evaluation card missing");
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() =>
      expect(within(evaluate).getByRole("status")).toHaveTextContent(
        /copy failed.*try again.*select.*manually/i
      )
    );
    expect(within(evaluate).getByRole("status")).toHaveClass("plan-copy-error");
    expect(fallback).toHaveBeenCalledWith("copy");
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(screen.queryByText(/copy failed/i)).not.toBeInTheDocument();
  });
});
