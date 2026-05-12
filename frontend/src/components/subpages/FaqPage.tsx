import { useMemo } from "react";
import { faqItemSectionId, getFaqItems } from "@/site/faq_items";
import { useLocale } from "@/i18n/LocaleContext";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";
import { FaqInstallGuideLink } from "@/components/mdx/faq_install_guide_link";
import { MdxSitePage } from "./MdxSitePage";

export type { FaqItem } from "@/site/faq_items";
export {
  FAQ_ITEMS,
  FAQ_ITEMS_EN,
  FAQ_QUESTION_BUILDING_YOUR_OWN_MEMORY_SYSTEM,
  FAQ_QUESTION_GIT_LIKE_AGENT_MEMORY,
  FAQ_QUESTION_NOT_FOR_THOUGHT_PARTNER,
  faqItemSectionId,
  faqQuestionToSectionId,
  getFaqItems,
} from "@/site/faq_items";

/**
 * FAQ Q&A list (locale-aware). Intros live in `docs/site/pages/{en,es}/faq.mdx`; this component
 * covers install analytics + internal links that are not plain markdown.
 */
export function FaqQuestions() {
  const { locale } = useLocale();
  const faqItems = useMemo(() => getFaqItems(locale), [locale]);
  return (
    <>
      {faqItems.map((item) => (
        <section key={item.sectionId} id={faqItemSectionId(item)} className="mb-10 scroll-mt-28">
          <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-2">{item.question}</h2>
          <p className="text-[15px] leading-7 mb-2">{item.answer}</p>
          {item.detail && (
            <p className="text-[14px] leading-7 text-muted-foreground mb-2">{item.detail}</p>
          )}
          {item.link &&
            (item.link.href === "/install" ? (
              <FaqInstallGuideLink>
                {item.link.label} &rarr;
              </FaqInstallGuideLink>
            ) : (
              <MdxI18nLink
                to={item.link.href}
                className="text-[14px] text-foreground underline underline-offset-2 hover:no-underline"
              >
                {item.link.label} &rarr;
              </MdxI18nLink>
            ))}
        </section>
      ))}
    </>
  );
}

export function FaqPage() {
  const { subpage } = useLocale();
  return <MdxSitePage canonicalPath="/faq" detailTitle={subpage.faq.title} />;
}
