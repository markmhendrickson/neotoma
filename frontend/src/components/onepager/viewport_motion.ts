import { useEffect, type RefObject } from "react";

type Play = (target: Element) => Animation[];
const MAX_ACTIVE_SCENES = 2;

type Registration = { target: Element; play: Play; inside: boolean; eligible: boolean; waiting: boolean; animations?: Animation[] };
const coordinators = new WeakMap<Document, ReturnType<typeof createCoordinator>>();

/** One parent-document observer owns the FIFO budget for inline and external scenes alike. */
function createCoordinator(page: Document) {
  const registrations = new Map<Element, Registration>();
  const queue: Registration[] = [];
  const running = new Set<Registration>();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const visible = (target: Element) => {
    for (let node: Element | null = target; node; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  };
  const dequeue = (item: Registration) => {
    const index = queue.indexOf(item);
    if (index !== -1) queue.splice(index, 1);
  };
  const cancel = (item: Registration) => {
    dequeue(item);
    const animations = item.animations;
    item.animations = undefined;
    running.delete(item);
    animations?.forEach((animation) => {
      try { animation.cancel(); } catch { /* Release other effects even if one API fails. */ }
    });
  };
  const pump = () => {
    if (reduced.matches || page.hidden) return;
    while (running.size < MAX_ACTIVE_SCENES && queue.length) {
      const item = queue.shift()!;
      if (!item.inside || !item.eligible || !item.waiting || !registrations.has(item.target) || !visible(item.target)) continue;
      item.waiting = false;
      let animations: Animation[];
      try { animations = item.play(item.target); } catch { continue; }
      if (!animations.length) continue;
      item.animations = animations;
      running.add(item);
      void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
        if (item.animations !== animations) return;
        cancel(item);
        pump();
      });
    }
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const item = registrations.get(entry.target);
      if (!item) continue;
      if (!entry.isIntersecting || !visible(item.target)) {
        item.inside = false; item.eligible = false; item.waiting = false;
        cancel(item);
      } else {
        item.eligible = entry.intersectionRatio >= 0.35;
        if (item.eligible && !item.inside) {
          item.inside = true;
          item.waiting = !reduced.matches && !page.hidden;
        }
        if (!item.eligible) dequeue(item);
        else if (item.waiting && !queue.includes(item)) queue.push(item);
      }
    }
    pump();
  }, { threshold: [0, 0.35] });
  const motionChange = () => {
    if (reduced.matches) registrations.forEach((item) => { item.waiting = false; cancel(item); });
  };
  const visibilityChange = () => {
    if (page.hidden) registrations.forEach((item) => { item.waiting = false; cancel(item); });
    // Resuming a tab or motion preference keeps stills settled until a fresh viewport entry.
  };
  const layoutChange = () => {
    registrations.forEach((item) => {
      if (!visible(item.target)) { item.inside = false; item.eligible = false; item.waiting = false; cancel(item); }
    });
    pump();
  };
  reduced.addEventListener("change", motionChange);
  page.addEventListener("visibilitychange", visibilityChange);
  window.addEventListener("resize", layoutChange);
  return {
    register(targets: Element[], play: Play) {
      const owned: Registration[] = [];
      for (const target of targets) {
        if (registrations.has(target)) continue;
        const item = { target, play, inside: false, eligible: false, waiting: false };
        owned.push(item); registrations.set(target, item); observer.observe(target);
      }
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        for (const item of owned) {
          cancel(item); registrations.delete(item.target); observer.unobserve?.(item.target);
        }
        if (registrations.size) pump();
        else {
          observer.disconnect();
          reduced.removeEventListener("change", motionChange);
          page.removeEventListener("visibilitychange", visibilityChange);
          window.removeEventListener("resize", layoutChange);
          coordinators.delete(page);
        }
      };
    },
  };
}

/** Animate actual entries only; complete authored artwork needs no animation support. */
export function observeViewportMotion(targets: Element[], play: Play): () => void {
  if (!targets.length || !window.matchMedia || !window.IntersectionObserver || !Element.prototype.animate)
    return () => {};
  const page = targets[0].ownerDocument;
  let coordinator = coordinators.get(page);
  if (!coordinator) { coordinator = createCoordinator(page); coordinators.set(page, coordinator); }
  return coordinator.register(targets, play);
}

const timing = { duration: 650, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both" } as const;
export function playLogo(target: Element): Animation[] {
  const parts = [...target.querySelectorAll<SVGElement>("[data-brand-part]")];
  if (parts.some((part) => typeof part.animate !== "function")) return [];
  const animations: Animation[] = [];
  try {
    for (const part of parts) animations.push(part.animate(
      [{ transform: "translateY(-3px)", opacity: 0.15 }, { transform: "translateY(0px)", opacity: 1 }],
      { ...timing, duration: 550, delay: (2 - Number(part.dataset.brandPart)) * 90 }
    ));
  } catch {
    animations.forEach((animation) => {
      try { animation.cancel(); } catch { /* Continue releasing partial setup. */ }
    });
    return [];
  }
  return animations;
}

const PAPER_SPRING_MS = 820;
const springCache = new Map<string, Keyframe[]>();

/** Sample the displacement of a damped spring, with a modest initial velocity toward rest. */
export function springFrames(x: number, y: number, rotation: number): Keyframe[] {
  const key = `${x}:${y}:${rotation}`;
  const cached = springCache.get(key);
  if (cached) return cached;
  const frequency = 12,
    damping = 0.8,
    duration = PAPER_SPRING_MS / 1000;
  const decay = damping * frequency;
  const angular = frequency * Math.sqrt(1 - damping * damping);
  const frames = Array.from({ length: 33 }, (_, index) => {
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
  springCache.set(key, frames);
  return frames;
}

export function playPaperScene(target: Element): Animation[] {
  const objects = [...target.querySelectorAll<SVGElement>("[data-paper-object]")];
  const paths = [...target.querySelectorAll<SVGGeometryElement>("[data-paper-connection]")];
  if ([...objects, ...paths].some((part) => typeof part.animate !== "function")) return [];
  const animations: Animation[] = [];
  const duration = PAPER_SPRING_MS;
  let settledAt = duration;
  try {
    for (const object of objects) {
      const delay = Number(object.dataset.enterDelay || 0);
      settledAt = Math.max(settledAt, delay + duration);
      animations.push(object.animate(
        springFrames(Number(object.dataset.enterX), Number(object.dataset.enterY), Number(object.dataset.enterRotation)),
        { duration, delay, easing: "linear", fill: "both" }
      ));
    }
    paths.forEach((path, index) => animations.push(path.animate(
      [{ strokeDasharray: "1", strokeDashoffset: "1" }, { strokeDasharray: "1", strokeDashoffset: "0" }],
      { duration: 600, delay: settledAt + 40 + index * 70, easing: "ease-out", fill: "both" }
    )));
  } catch {
    animations.forEach((animation) => {
      try { animation.cancel(); } catch { /* Continue releasing partial setup. */ }
    });
    return [];
  }
  return animations;
}

export function usePageVisualMotion(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!ref.current) return;
    return observeViewportMotion(
      [...ref.current.querySelectorAll<SVGSVGElement>("svg[data-paper-scene]")],
      playPaperScene
    );
  }, [ref]);
}
