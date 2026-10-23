import { useEffect, type RefObject } from "react";

type Play = (target: Element) => Animation[];

/** Animate only actual entry transitions. The authored final state is always visible without JS. */
export function observeViewportMotion(targets: Element[], play: Play): () => void {
  if (!window.matchMedia || !window.IntersectionObserver || !Element.prototype.animate)
    return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const inside = new Set<Element>();
  const running = new Map<Element, Animation[]>();
  const cancel = (target: Element) => {
    running.get(target)?.forEach((animation) => animation.cancel());
    running.delete(target);
  };
  const enter = (target: Element) => {
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
        const target = entry.target;
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
export function playLogo(target: Element): Animation[] {
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

const PAPER_SPRING_MS = 820;

/** Sample the displacement of a damped spring, with a modest initial velocity toward rest. */
export function springFrames(x: number, y: number, rotation: number): Keyframe[] {
  const frequency = 12,
    damping = 0.8,
    duration = PAPER_SPRING_MS / 1000;
  const decay = damping * frequency;
  const angular = frequency * Math.sqrt(1 - damping * damping);
  return Array.from({ length: 33 }, (_, index) => {
    const t = (index / 32) * duration;
    const remaining =
      index === 32
        ? 0
        : Math.exp(-decay * t) *
          (Math.cos(angular * t) + ((decay - 5) / angular) * Math.sin(angular * t));
    return {
      offset: index / 32,
      transform: `translate(${x * remaining}px, ${y * remaining}px) rotate(${rotation * remaining}deg)`,
    };
  });
}

export function playPaperScene(target: Element): Animation[] {
  const objects = [...target.querySelectorAll<SVGElement>("[data-paper-object]")];
  const duration = PAPER_SPRING_MS;
  let settledAt = duration;
  const arrivals = objects.map((object) => {
    const delay = Number(object.dataset.enterDelay || 0);
    settledAt = Math.max(settledAt, delay + duration);
    return object.animate(
      springFrames(
        Number(object.dataset.enterX),
        Number(object.dataset.enterY),
        Number(object.dataset.enterRotation)
      ),
      { duration, delay, easing: "linear", fill: "both" }
    );
  });
  const connections = [
    ...target.querySelectorAll<SVGGeometryElement>("[data-paper-connection]"),
  ].map((path, index) =>
    path.animate(
      [
        { strokeDasharray: "1", strokeDashoffset: "1" },
        { strokeDasharray: "1", strokeDashoffset: "0" },
      ],
      { duration: 600, delay: settledAt + 40 + index * 70, easing: "ease-out", fill: "both" }
    )
  );
  return [...arrivals, ...connections];
}

export function usePageVisualMotion(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!ref.current) return;
    return observeViewportMotion(
      [...ref.current.querySelectorAll<SVGSVGElement>("[data-paper-scene]")],
      playPaperScene
    );
  }, [ref]);
}
