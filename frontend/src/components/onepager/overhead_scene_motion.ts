import { observeViewportMotion, springFrames } from "./viewport_motion";

const SPRING_MS = 820;

function settle(svg: SVGSVGElement) {
  for (const port of svg.querySelectorAll<SVGElement>("[data-paper-port]"))
    port.style.opacity = "1";
  for (const envelope of svg.querySelectorAll<SVGElement>("[data-paper-envelope-state]"))
    envelope.style.opacity = envelope.dataset.paperEnvelopeState === "open" ? "1" : "0";
  for (const letter of svg.querySelectorAll<SVGElement>("[data-paper-letter]"))
    letter.style.opacity = "1";
  for (const field of svg.querySelectorAll<SVGElement>("[data-paper-field-state]"))
    field.style.opacity = field.dataset.paperFieldState === "current" ? "1" : "0";
}

export function playOverheadScene(svg: SVGSVGElement): Animation[] {
  // The complete still is the underlying state. Only live WAAPI effects stage
  // hidden objects, so cancellation or unavailable APIs cannot strand them.
  settle(svg);
  const targets = [
    ...svg.querySelectorAll<SVGElement>(
      "[data-paper-object], [data-paper-connection], [data-paper-port], [data-paper-field-state], [data-paper-envelope-state], [data-paper-letter]"
    ),
  ];
  // External SVGs have their own realm; the outer page's API guard is insufficient.
  if (targets.some((target) => typeof target.animate !== "function")) return [];
  const animations: Animation[] = [];
  try {
    for (const object of svg.querySelectorAll<SVGElement>("[data-paper-object]")) {
      animations.push(
        object.animate(
          springFrames(
            Number(object.dataset.enterX || 0),
            Number(object.dataset.enterY || 0),
            0
          ).map((frame, index) => ({ ...frame, opacity: Math.min(1, index / 5) })),
          {
            duration: SPRING_MS,
            delay: Number(object.dataset.enterDelay || 0),
            easing: "linear",
            fill: "both",
          }
        )
      );
    }

    const portArrival = new Map<string, number>();
    for (const path of svg.querySelectorAll<SVGGeometryElement>("[data-paper-connection]")) {
      const delay = Number(path.dataset.connectionDelay || 0);
      animations.push(
        path.animate(
          [
            { strokeDasharray: "1", strokeDashoffset: "1", opacity: 0 },
            { strokeDasharray: "1", strokeDashoffset: "1", opacity: 1, offset: 0.02 },
            { strokeDasharray: "1", strokeDashoffset: "0", opacity: 1 },
          ],
          { duration: 650, delay, easing: "ease-out", fill: "both" }
        )
      );
      for (const id of [path.dataset.connectionFrom, path.dataset.connectionTo]) {
        if (id) portArrival.set(id, Math.max(portArrival.get(id) || 0, delay + 650));
      }
    }
    for (const port of svg.querySelectorAll<SVGElement>("[data-paper-port]")) {
      const delay = portArrival.get(port.dataset.paperPort || "");
      if (delay == null) continue;
      animations.push(
        port.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 180,
          delay,
          easing: "ease-out",
          fill: "both",
        })
      );
    }
    for (const field of svg.querySelectorAll<SVGElement>("[data-paper-field-state]")) {
      const current = field.dataset.paperFieldState === "current";
      animations.push(
        field.animate(
          [
            { opacity: current ? 0 : 1, offset: 0 },
            { opacity: current ? 0 : 1, offset: 0.62 },
            { opacity: current ? 1 : 0, offset: 0.72 },
            { opacity: current ? 1 : 0, offset: 1 },
          ],
          { duration: 4200, easing: "ease-in-out", fill: "both" }
        )
      );
    }
    for (const envelope of svg.querySelectorAll<SVGElement>("[data-paper-envelope-state]")) {
      const open = envelope.dataset.paperEnvelopeState === "open";
      animations.push(
        envelope.animate(
          open
            ? [
                { opacity: 0, offset: 0 },
                { opacity: 0, offset: 0.16 },
                { opacity: 1, offset: 1 },
              ]
            : [
                { opacity: 1, offset: 0 },
                { opacity: 1, offset: 0.16 },
                { opacity: 0, offset: 1 },
              ],
          { duration: 680, easing: "ease-in-out", fill: "both" }
        )
      );
    }
    for (const letter of svg.querySelectorAll<SVGElement>("[data-paper-letter]")) {
      animations.push(
        letter.animate(
          [
            { transform: "translateY(48px)", opacity: 0 },
            { transform: "translateY(0px)", opacity: 1 },
          ],
          { duration: 750, delay: 560, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both" }
        )
      );
    }
  } catch {
    for (const animation of animations) {
      try {
        animation.cancel();
      } catch {
        /* Continue releasing any other effects. */
      }
    }
    settle(svg);
    return [];
  }
  // Cancellation on viewport exit must leave a complete still, not hidden ports or a closed envelope.
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(() =>
    settle(svg)
  );
  return animations;
}

/** The published SVG is a same-origin document, so it stays out of the JS bundle. */
export function observeOverheadPaperScene(object: HTMLObjectElement): () => void {
  const svg = object.contentDocument?.querySelector<SVGSVGElement>("svg");
  if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg") return () => {};
  settle(svg);
  return observeViewportMotion([object], () => playOverheadScene(svg));
}
