import { useEffect, type RefObject } from "react";

type Play = (target: HTMLElement) => Animation[];

/** Animate only actual entry transitions. The authored final state is always visible without JS. */
export function observeViewportMotion(targets: HTMLElement[], play: Play): () => void {
  if (!window.matchMedia || !window.IntersectionObserver || !Element.prototype.animate)
    return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const inside = new Set<HTMLElement>();
  const running = new Map<HTMLElement, Animation[]>();
  const cancel = (target: HTMLElement) => {
    running.get(target)?.forEach((animation) => animation.cancel());
    running.delete(target);
  };
  const enter = (target: HTMLElement) => {
    cancel(target);
    if (reduced.matches || document.hidden) return;
    const animations = play(target);
    running.set(target, animations);
    for (const animation of animations) {
      void animation.finished
        .then(() => {
          animation.cancel();
          if (
            running.get(target) === animations &&
            animations.every((item) => item.playState !== "running")
          )
            running.delete(target);
        })
        .catch(() => {});
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          if (!inside.has(target)) {
            inside.add(target);
            enter(target);
          }
        } else {
          inside.delete(target);
          cancel(target);
        }
      }
    },
    { threshold: 0.12 }
  );
  targets.forEach((target) => observer.observe(target));
  const motionChange = () => {
    if (reduced.matches) targets.forEach(cancel);
  };
  const visibilityChange = () => {
    if (document.hidden) targets.forEach(cancel);
    else inside.forEach(enter);
  };
  reduced.addEventListener("change", motionChange);
  document.addEventListener("visibilitychange", visibilityChange);
  return () => {
    observer.disconnect();
    targets.forEach(cancel);
    reduced.removeEventListener("change", motionChange);
    document.removeEventListener("visibilitychange", visibilityChange);
  };
}

const timing = { duration: 650, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both" } as const;
export function playLogo(target: HTMLElement): Animation[] {
  return [...target.querySelectorAll<SVGElement>("[data-brand-part]")].map((part) =>
    part.animate(
      [
        { transform: "translateY(-3px)", opacity: 0.15 },
        { transform: "translateY(0px)", opacity: 1 },
      ],
      { ...timing, duration: 550, delay: (2 - Number(part.dataset.brandPart)) * 90 }
    )
  );
}

export function usePageVisualMotion(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!ref.current) return;
    return observeViewportMotion(
      [...ref.current.querySelectorAll<HTMLElement>("img, .plan-inspector, .plan-vision-diagram")],
      (target) => {
        if (target.matches(".plan-vision-diagram")) {
          const records = [...target.querySelectorAll<SVGElement>("[data-vision-record]")].map(
            (record, index) =>
              record.animate(
                [
                  { transform: `translate(${index % 2 ? 24 : -24}px, 12px)`, opacity: 0.1 },
                  { transform: "translate(0, 0)", opacity: 1 },
                ],
                { ...timing, delay: index * 90 }
              )
          );
          const connections = [
            ...target.querySelectorAll<SVGGeometryElement>("[data-vision-connection]"),
          ].map((path) =>
            path.animate(
              [
                { strokeDasharray: "1", strokeDashoffset: "1" },
                { strokeDasharray: "1", strokeDashoffset: "0" },
              ],
              { ...timing, delay: 280, duration: 700 }
            )
          );
          return [...records, ...connections];
        }
        // Existing photographs are flat assets: reveal the complete scene, not invented layers.
        return [
          target.animate(
            [
              { transform: "translateY(18px)", opacity: 0.35 },
              { transform: "translateY(0)", opacity: 1 },
            ],
            timing
          ),
        ];
      }
    );
  }, [ref]);
}
