import type { ReactNode } from "react";
import { PRODUCT_NAV_SOURCES, type ProductNavSource } from "@/utils/analytics";
import { TrackedProductLink } from "@/components/TrackedProductNav";

const INSTALL_NAV_BY_VARIANT: Record<"faq" | "zero_setup_onboarding", ProductNavSource> = {
  faq: PRODUCT_NAV_SOURCES.faqInstallGuide,
  zero_setup_onboarding: PRODUCT_NAV_SOURCES.zeroSetupOnboardingInstall,
};

/** Tracked `/install` link for MDX (FAQ, zero-setup guarantee, etc.). */
export function MdxTrackedInstallLink({
  variant,
  children,
}: {
  variant: keyof typeof INSTALL_NAV_BY_VARIANT;
  children: ReactNode;
}) {
  return (
    <TrackedProductLink
      to="/install"
      navTarget="install"
      navSource={INSTALL_NAV_BY_VARIANT[variant]}
      className="text-foreground underline hover:text-foreground"
    >
      {children}
    </TrackedProductLink>
  );
}
