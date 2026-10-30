// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { playOverheadScene } from "./overhead_scene_motion";

function scene() {
  const root = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">
    <g data-paper-object=""/><path data-paper-connection="" data-connection-from="a" data-connection-to="b"/>
    <circle data-paper-port="a"/><circle data-paper-port="b"/>
    <g data-paper-envelope-state="open"/><g data-paper-envelope-state="closed" opacity="0"/>
    <g data-paper-letter="email"/><g data-paper-field-state="current" opacity="1"/>
    <g data-paper-field-state="prior" opacity="0"/>
  </svg>`,
    "image/svg+xml"
  ).documentElement as unknown as SVGSVGElement;
  document.body.appendChild(root);
  return root;
}

function expectComplete(svg: SVGSVGElement) {
  for (const el of svg.querySelectorAll<SVGElement>(
    '[data-paper-port], [data-paper-letter], [data-paper-envelope-state="open"], [data-paper-field-state="current"]'
  ))
    expect(el.style.opacity || el.getAttribute("opacity") || "1").toBe("1");
  for (const el of svg.querySelectorAll<SVGElement>(
    '[data-paper-envelope-state="closed"], [data-paper-field-state="prior"]'
  ))
    expect(el.style.opacity || el.getAttribute("opacity")).toBe("0");
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("overhead scene static fallback", () => {
  it("keeps a complete still when an inner-document target has no animation API", () => {
    const svg = scene();
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => {}) }));
    for (const el of svg.querySelectorAll("*"))
      Object.defineProperty(el, "animate", { value: animate, configurable: true });
    Object.defineProperty(svg.querySelector("[data-paper-letter]"), "animate", {
      value: undefined,
    });
    expect(() => playOverheadScene(svg)).not.toThrow();
    expect(animate).not.toHaveBeenCalled();
    expectComplete(svg);
  });

  it("cancels partial animation effects and restores the still if animation setup throws", () => {
    const svg = scene();
    const cancels: ReturnType<typeof vi.fn>[] = [];
    let calls = 0;
    const animate = () => {
      if (++calls === 4) throw new Error("unsupported effect");
      const cancel = vi.fn();
      cancels.push(cancel);
      return { cancel, finished: new Promise(() => {}) };
    };
    for (const el of svg.querySelectorAll("*"))
      Object.defineProperty(el, "animate", { value: animate });
    expect(() => playOverheadScene(svg)).not.toThrow();
    expect(cancels).toHaveLength(3);
    for (const cancel of cancels) expect(cancel).toHaveBeenCalledOnce();
    expectComplete(svg);
  });
});
