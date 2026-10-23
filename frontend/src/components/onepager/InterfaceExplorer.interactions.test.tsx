// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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
import { observeViewportMotion, playPaperScene, springFrames } from "./viewport_motion";
import { PaperScene, PAPER_SCENE_ALTS, type PaperSceneKind } from "./PaperScene";
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
    const tabs = ["App", "CLI", "MCP", "REST API"].map((name) => screen.getByRole("tab", { name }));
    for (const [from, key, to] of [
      [0, "ArrowRight", 1],
      [1, "ArrowLeft", 0],
      [0, "ArrowLeft", 3],
      [3, "ArrowRight", 0],
      [0, "End", 3],
      [3, "Home", 0],
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

  it("restores App for direct and repeated inspect links without changing ordinary tab URLs", () => {
    window.history.replaceState({}, "", "/#inspect");
    render(
      <>
        <a href="#inspect">Inspect</a>
        <InterfaceExplorer />
      </>
    );
    expect(screen.getByRole("tab", { name: "App" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "REST API" }));
    expect(window.location.hash).toBe("#inspect");
    fireEvent.click(screen.getByRole("link", { name: "Inspect" }));
    expect(screen.getByRole("tab", { name: "App" })).toHaveAttribute("aria-selected", "true");
    window.history.replaceState({}, "", "/#example");
    fireEvent.click(screen.getByRole("tab", { name: "MCP" }));
    window.history.replaceState({}, "", "/#inspect");
    fireEvent(window, new Event("popstate"));
    expect(screen.getByRole("tab", { name: "App" })).toHaveAttribute("aria-selected", "true");
    window.history.replaceState({}, "", "/");
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

  it("keeps a delayed copy result with its original panel", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 10_000);
    let finish!: () => void;
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    clipboard(write, () => false);
    render(<InterfaceExplorer />);
    fireEvent.click(screen.getByRole("tab", { name: "CLI" }));
    const cliPanel = screen.getByRole("tabpanel", { name: "CLI" });
    fireEvent.click(within(cliPanel).getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("tab", { name: "MCP" }));
    finish();
    await waitFor(() =>
      expect(
        within(cliPanel).getByRole("button", { name: "Copied", hidden: true })
      ).toBeInTheDocument()
    );
    expect(
      within(screen.getByRole("tabpanel", { name: "MCP" })).getByRole("button", { name: "Copy" })
    ).toBeInTheDocument();
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
      notify(
        [{ target, isIntersecting } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
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

describe("layered paper illustration motion", () => {
  it("serves thirteen distinct object scenes instead of translating images or the Inspector", () => {
    const { container } = render(
      <MemoryRouter>
        <NeotomaOnePager />
      </MemoryRouter>
    );
    const scenes = [...container.querySelectorAll("[data-paper-scene]")];
    expect(scenes).toHaveLength(13);
    expect(container.querySelectorAll('img[src*="/brand/october/"]')).toHaveLength(0);
    expect(new Set(scenes.map((scene) => scene.getAttribute("data-paper-scene")))).toHaveProperty(
      "size",
      13
    );
    const compositions = scenes.map((scene) =>
      [...scene.querySelectorAll("[data-paper-object] path")]
        .map((path) => path.getAttribute("d"))
        .join("|")
    );
    expect(new Set(compositions).size).toBe(13);
    expect(container.querySelector(".plan-inspector")?.hasAttribute("data-paper-scene")).toBe(
      false
    );
  });

  it("animates actual child objects from outside the frame and draws links only after all settle", () => {
    const calls: { target: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: function (this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
        calls.push({ target: this, frames, options });
        return { cancel: vi.fn(), finished: new Promise(() => {}), playState: "running" };
      },
    });
    for (const scene of Object.keys(PAPER_SCENE_ALTS) as PaperSceneKind[]) {
      calls.length = 0;
      const { container, unmount } = render(<PaperScene scene={scene} />);
      const svg = container.querySelector("svg")!;
      expect(
        screen.getByRole("img", { name: new RegExp(PAPER_SCENE_ALTS[scene]) })
      ).toBeInTheDocument();
      expect(svg.querySelector("image")).toBeNull();
      expect(svg.querySelector("feTurbulence")).not.toBeNull();
      playPaperScene(svg);
      const arrivals = calls.filter((call) => call.target.hasAttribute("data-paper-object"));
      const links = calls.filter((call) => call.target.hasAttribute("data-paper-connection"));
      expect(arrivals.length).toBeGreaterThanOrEqual(3);
      expect(links.length).toBeGreaterThan(0);
      expect(calls.some((call) => call.target === svg)).toBe(false);
      expect(calls).toHaveLength(arrivals.length + links.length);
      for (const arrival of arrivals) {
        const target = arrival.target as SVGElement;
        const x = Number(target.dataset.enterX),
          y = Number(target.dataset.enterY);
        expect(Math.abs(x) >= 1050 || Math.abs(y) >= 760).toBe(true);
        expect(Math.abs(Number(target.dataset.enterRotation))).toBeLessThanOrEqual(5);
        expect(arrival.frames[0].transform).toContain(`translate(${x}px, ${y}px)`);
        expect(arrival.frames).toHaveLength(33);
        expect(arrival.frames.slice(-1)[0]?.transform).toBe("translate(0px, 0px) rotate(0deg)");
        expect(arrival.frames.every((frame) => frame.opacity === undefined)).toBe(true);
        expect(arrival.options.easing).toBe("linear");
      }
      const settledAt = Math.max(
        ...arrivals.map(({ options }) => Number(options.delay) + Number(options.duration))
      );
      for (const link of links) {
        expect(Number(link.options.delay)).toBeGreaterThanOrEqual(settledAt + 40);
        expect(link.frames[0].strokeDashoffset).toBe("1");
        expect(link.frames.slice(-1)[0]?.strokeDashoffset).toBe("0");
      }
      unmount();
    }
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
  });

  it("samples momentum and limited damped overshoot into a stable final pose", () => {
    const frames = springFrames(1000, 20, 5);
    const displacements = frames.map((frame) =>
      Number(String(frame.transform).match(/translate\(([-\d.e]+)/)?.[1])
    );
    expect(displacements[0]).toBe(1000);
    expect(displacements[0] - displacements[18]).toBeGreaterThan(800);
    expect(Math.min(...displacements)).toBeLessThan(-1);
    expect(Math.min(...displacements)).toBeGreaterThan(-40);
    expect(Math.max(...displacements.slice(-6).map(Math.abs))).toBeLessThan(1);
    expect(displacements.slice(-1)[0]).toBe(0);
  });

  it("uses unique material and accessibility IDs when scenes repeat", () => {
    const { container } = render(
      <>
        <PaperScene scene="hero" />
        <PaperScene scene="hero" />
      </>
    );
    const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll("svg")) {
      for (const id of (svg.getAttribute("aria-labelledby") ?? "").split(" "))
        expect(document.getElementById(id)).not.toBeNull();
    }
  });
});
