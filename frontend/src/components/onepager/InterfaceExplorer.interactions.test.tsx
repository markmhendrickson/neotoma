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
import { execFileSync } from "node:child_process";
import { observeViewportMotion } from "./viewport_motion";
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
  if (tab === "MCP") {
    const calls: Record<string, unknown>[] = [];
    const capture = (payload: Record<string, unknown>) => {
      calls.push(payload);
    };
    runInNewContext(code, {
      store: capture,
      correct: capture,
      retrieve_entity_snapshot: capture,
      list_observations: capture,
      retrieve_field_provenance: capture,
    });
    return (calls[0].entities as Record<string, unknown>[])[0];
  }
  // Execute natural shell shapes against local functions, never the real CLI or network.
  execFileSync("/bin/bash", ["-n"], { input: code });
  const args = execFileSync("/bin/bash", [], {
    input: `neotoma() { printf '%s\\0' "$@"; printf '\\1'; }; curl() { neotoma "$@"; }; INVOICE_ID=ent_example; NEOTOMA_URL=http://example.invalid; NEOTOMA_TOKEN=placeholder;\n${code}`,
    encoding: "utf8",
  })
    .split("\x01")[0]
    .split("\0");
  const flag = tab === "CLI" ? "--entities" : "--data-binary";
  const payload = JSON.parse(args[args.indexOf(flag) + 1]);
  return tab === "CLI" ? payload[0] : payload.entities[0];
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
    const evaluate = screen
      .getByText("Ask your agent to evaluate")
      .closest<HTMLElement>(".plan-evaluate");
    if (!evaluate) throw new Error("evaluation card missing");
    fireEvent.click(within(evaluate).getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(within(evaluate).getByRole("status")).toHaveTextContent(
        /copy failed.*try again.*select.*manually/i
      )
    );
    expect(within(evaluate).getByRole("status")).toHaveClass("plan-copy-error");
    expect(fallback).toHaveBeenCalledWith("copy");
    fireEvent.click(within(evaluate).getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(within(evaluate).getByRole("button", { name: "Copied" })).toBeInTheDocument()
    );
    expect(screen.queryByText(/copy failed/i)).not.toBeInTheDocument();
  });
});

describe("shared site snippet content", () => {
  it("copies the exact selectable source including quoted hashes and multiline continuations", async () => {
    const write = vi.fn(async () => {});
    clipboard(write, () => false);
    const source =
      "# Read this comment before running\nprintf '%s' '# retained' \\n  'second argument'";
    render(
      <CodeBlock code={source} copyFeedbackId="exact-source" installBlock="manual_commands" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith(source));
    expect(screen.getByRole("code").textContent).toBe(source);
  });

  it("copies the selected interface's formatted source without altering its JSON", async () => {
    const write = vi.fn(async () => {});
    clipboard(write, () => false);
    render(<InterfaceExplorer />);
    for (const name of ["CLI", "MCP", "REST API"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      const panel = screen.getByRole("tabpanel", { name });
      const source = within(panel).getByRole("code").textContent;
      fireEvent.click(within(panel).getByRole("button", { name: "Copy" }));
      await waitFor(() => expect(write).toHaveBeenLastCalledWith(source));
      expect(source).toContain('"invoice_date": "2026-10-01"');
    }
  });
});

describe("viewport entrance lifecycle", () => {
  it("replays only after exit and re-entry and cancels on reduced motion, hidden documents and cleanup", () => {
    let notify: IntersectionObserverCallback = () => {};
    const disconnect = vi.fn();
    const media = new EventTarget() as MediaQueryList;
    Object.defineProperty(media, "matches", { configurable: true, value: false, writable: true });
    vi.stubGlobal("matchMedia", () => media);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn() });
    const target = document.createElement("div");
    const cancel = vi.fn();
    const play = vi.fn(() => [
      { cancel, finished: new Promise(() => {}), playState: "running" } as unknown as Animation,
    ]);
    const stop = observeViewportMotion([target], play);
    const entry = (isIntersecting: boolean) =>
      notify([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    entry(true);
    expect(play).toHaveBeenCalledTimes(1);
    entry(true);
    expect(play).toHaveBeenCalledTimes(1);
    entry(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    entry(true);
    expect(play).toHaveBeenCalledTimes(2);
    Object.assign(media, { matches: true });
    media.dispatchEvent(new Event("change"));
    expect(cancel).toHaveBeenCalledTimes(2);
    entry(false);
    entry(true);
    expect(play).toHaveBeenCalledTimes(2);
    Object.assign(media, { matches: false });
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    entry(false);
    entry(true);
    expect(play).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(play).toHaveBeenCalledTimes(3);
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledTimes(3);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(play).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
  });

  it("keeps the authored final state when observer or animation support is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const target = document.createElement("div");
    target.textContent = "Record";
    const play = vi.fn();
    observeViewportMotion([target], play)();
    expect(play).not.toHaveBeenCalled();
    expect(target.textContent).toBe("Record");
    expect(target.getAttribute("style")).toBeNull();
    vi.unstubAllGlobals();
  });
});
