import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { faqItemSectionId, getFaqItems } from "@/site/faq_items";
import { DetailPage } from "../DetailPage";
import { TrackedProductLink } from "../TrackedProductNav";
import { useLocale } from "@/i18n/LocaleContext";

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

export function FaqPage() {
  const { locale, subpage } = useLocale();
  const faqItems = useMemo(() => getFaqItems(locale), [locale]);
  return (
    <DetailPage title={subpage.faq.title}>
      <p className="text-[15px] leading-7 mb-8">{subpage.faq.intro}</p>

      {faqItems.map((item) => (
        <section key={item.sectionId} id={faqItemSectionId(item)} className="mb-10 scroll-mt-28">
          <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-2">{item.question}</h2>
          <p className="text-[15px] leading-7 mb-2">{item.answer}</p>
          {item.detail && (
            <p className="text-[14px] leading-7 text-muted-foreground mb-2">{item.detail}</p>
          )}
          {item.link &&
            (item.link.href === "/install" ? (
              <TrackedProductLink
                to="/install"
                navTarget="install"
                navSource={PRODUCT_NAV_SOURCES.faqInstallGuide}
                className="text-[14px] text-foreground underline underline-offset-2 hover:no-underline"
              >
                {item.link.label} &rarr;
              </TrackedProductLink>
            ) : (
              <Link
                to={item.link.href}
                className="text-[14px] text-foreground underline underline-offset-2 hover:no-underline"
              >
                {item.link.label} &rarr;
              </Link>
            ))}
        </section>
      ))}
    </DetailPage>
  );
}
