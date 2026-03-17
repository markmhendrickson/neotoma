import React from "react";
import { useLocation } from "react-router-dom";
import { SeoHead } from "./SeoHead";
import { getDocPageIcon } from "@/site/doc_icons";
import { stripLocaleFromPath } from "@/i18n/routing";
import { SectionDivider } from "./ui/section_divider";

interface DetailPageProps {
  title: string;
  children: React.ReactNode;
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

export function DetailPage({ title, children }: DetailPageProps) {
  const { pathname } = useLocation();
  const renderedChildren = addAutoSectionDividers(children);
  const canonicalPath = stripLocaleFromPath(pathname);
  const seoPathname =
    typeof window !== "undefined" ? window.location.pathname : pathname;
  const TitleIcon = getDocPageIcon(canonicalPath);
  return (
    <>
      <SeoHead routePath={seoPathname} />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-6 flex items-start gap-3">
            {TitleIcon ? (
              <TitleIcon className="mt-1 size-7 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            {title}
          </h1>
          <div className="post-prose [&_a]:underline [&_a]:hover:text-foreground">
            {renderedChildren}
          </div>
        </div>
      </div>
    </>
  );
}
