import { useEffect } from "react";
import light from "../../../public/brand/n2-nav-light.svg?raw";
import dark from "../../../public/brand/n2-nav-dark.svg?raw";
import "./selected-site-identity.css";

// The first three accepted paths form the existing symbol. Only mark them for the
// selected-site-identity entrance; the path data and wordmark are not redrawn.
function markParts(svg: string, theme: "light" | "dark") {
  let part = 0;
  return svg
    .replace(/<svg /, `<svg class="logo-on-${theme}" aria-hidden="true" focusable="false" `)
    .replace(/<path /g, (match) => (part < 3 ? `<path data-brand-part="${part++}" ` : match));
}

const artwork = markParts(light, "light") + markParts(dark, "dark");

export function AnimatedLockup() {
  useEffect(() => {
    // Existing selected-site identity player from the accepted draft. It reveals
    // the three symbol paths in 550 ms and skips animation for reduced motion.
    // @ts-expect-error static site script intentionally has no TypeScript declarations
    void import("./selected-site-identity.js");
  }, []);
  return (
    <span
      className="selected-site-logo neotoma plan-animated-lockup"
      role="img"
      aria-label="Neotoma"
      data-brand-entrance="neotoma"
      dangerouslySetInnerHTML={{ __html: artwork }}
    />
  );
}
