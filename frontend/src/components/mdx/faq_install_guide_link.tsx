import type { ReactNode } from "react";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { TrackedProductLink } from "@/components/TrackedProductNav";

/** Tracked install link for FAQ MDX (replaces plain `MdxI18nLink` for `/install` only). */
export function FaqInstallGuideLink({ children }: { children: ReactNode }) {
  return (
    <TrackedProductLink
      to="/install"
      navTarget="install"
      navSource={PRODUCT_NAV_SOURCES.faqInstallGuide}
      className="text-[14px] text-foreground underline underline-offset-2 hover:no-underline"
    >
      {children}
    </TrackedProductLink>
  );
}
