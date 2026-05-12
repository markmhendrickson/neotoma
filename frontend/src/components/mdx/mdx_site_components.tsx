import type { ComponentType } from "react";
import { ChangelogLiveBlock } from "@/components/mdx/changelog_live_block";
import { FaqInstallGuideLink } from "@/components/mdx/faq_install_guide_link";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";
import { MdxTrackedInstallLink } from "@/components/mdx/mdx_tracked_install_link";

/** Components available in every `docs/site/pages` MDX document. */
export const mdxSiteProviderComponents: Record<string, ComponentType<never>> = {
  ChangelogLiveBlock: ChangelogLiveBlock as ComponentType<never>,
  FaqInstallGuideLink: FaqInstallGuideLink as ComponentType<never>,
  MdxI18nLink: MdxI18nLink as ComponentType<never>,
  MdxTrackedInstallLink: MdxTrackedInstallLink as ComponentType<never>,
};
