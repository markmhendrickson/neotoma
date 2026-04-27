import React from "react";
import { useLocation } from "react-router-dom";
import { useEffectiveRoutePath } from "@/hooks/useEffectiveRoutePath";
import { SeoHead } from "./SeoHead";
import { getDocPageIcon } from "@/site/doc_icons";
import { SectionDivider } from "./ui/section_divider";

/** Spread onto pill/CTA `<Link>` inside DetailPage so prose link underline/hover color does not apply. */
export const detailPageCtaLinkProps = { "data-post-prose-cta": "" } as const;

interface DetailPageProps {
  title: string;
  children: React.ReactNode;
  /** Centered above the title; pass a static import URL (same treatment as home hero). */
  heroIllustrationSrc?: string;
  /** Larger frame + stronger opacity — for evaluate-style hero art that must read clearly. */
  heroIllustrationProminent?: boolean;
}

function isSectionStartNode(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false;
  if (typeof node.type === "string") {
    return node.type === "section" || node.type === "h2";
  }
  if (typeof node.type === "function") {
    return node.type.name === "SectionHeading";
  }
  return false;
}

function isSectionDividerNode(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === SectionDivider;
}

function addAutoSectionDividers(children: React.ReactNode): React.ReactNode {
  const nodes = React.Children.toArray(children);
  const hasExplicitDividers = nodes.some(isSectionDividerNode);
  if (hasExplicitDividers) return children;

  const withDividers: React.ReactNode[] = [];
  let seenFirstSectionStart = false;

  nodes.forEach((node, index) => {
    if (isSectionStartNode(node)) {
      if (seenFirstSectionStart && !isSectionDividerNode(withDividers[withDividers.length - 1])) {
        withDividers.push(<SectionDivider key={`auto-divider-${index}`} />);
      }
      seenFirstSectionStart = true;
    }
    withDividers.push(node);
  });

  return withDividers;
}

export function DetailPage({
  title,
  children,
  heroIllustrationSrc,
  heroIllustrationProminent,
}: DetailPageProps) {
  const { pathname } = useLocation();
  const effectivePath = useEffectiveRoutePath();
  const renderedChildren = addAutoSectionDividers(children);
  const TitleIcon = getDocPageIcon(effectivePath);
  const seoPathname =
    typeof window !== "undefined" ? window.location.pathname : pathname;
  return (
    <>
      <SeoHead routePath={seoPathname} />
      <div className="min-h-0 bg-background text-foreground">
        <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
          {heroIllustrationSrc ? (
            <figure
              className={
                heroIllustrationProminent
                  ? "mx-auto mb-2 w-full max-w-[200px] sm:max-w-[240px] md:max-w-[260px] pointer-events-none select-none"
                  : "mx-auto mb-6 w-full max-w-[104px] sm:max-w-[120px] pointer-events-none select-none"
              }
            >
              <img
                src={heroIllustrationSrc}
                alt=""
                width={heroIllustrationProminent ? 260 : 120}
                height={heroIllustrationProminent ? 260 : 120}
                className={
                  heroIllustrationProminent
                    ? "mx-auto aspect-square w-full object-contain opacity-[0.52] dark:opacity-[0.78] dark:brightness-[1.08] dark:contrast-[1.05]"
                    : "mx-auto aspect-square w-full object-contain opacity-[0.36] dark:opacity-[0.62] dark:brightness-[1.15] dark:contrast-[1.06]"
                }
                loading="eager"
                decoding="async"
                aria-hidden="true"
              />
            </figure>
          ) : null}
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-6 flex items-start gap-3">
            {TitleIcon ? (
              <TitleIcon className="mt-1 size-7 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            <span className="min-w-0">{title}</span>
          </h1>
          <div>{renderedChildren}</div>
        </div>
      </div>
    </>
  );
}
