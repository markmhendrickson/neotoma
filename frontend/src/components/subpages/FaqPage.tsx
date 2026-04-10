import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { FAQ_ITEMS, faqQuestionToSectionId } from "@/site/faq_items";
import { DetailPage } from "../DetailPage";
import { TrackedProductLink } from "../TrackedProductNav";

export type { FaqItem } from "@/site/faq_items";
export { FAQ_ITEMS, FAQ_QUESTION_GIT_LIKE_AGENT_MEMORY, faqQuestionToSectionId } from "@/site/faq_items";

export function FaqPage() {
  return (
    <DetailPage title="Frequently asked questions">
      <p className="text-[15px] leading-7 mb-8">
        Answers to common questions about Neotoma: what it is, how it compares to other memory systems, how to install it, and what guarantees it provides.
      </p>

      {FAQ_ITEMS.map((item) => (
        <section
          key={item.question}
          id={faqQuestionToSectionId(item.question)}
          className="mb-10 scroll-mt-28"
        >
          <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-2">
            {item.question}
          </h2>
          <p className="text-[15px] leading-7 mb-2">{item.answer}</p>
          {item.detail && (
            <p className="text-[14px] leading-7 text-muted-foreground mb-2">
              {item.detail}
            </p>
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
