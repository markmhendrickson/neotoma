import type { ReactNode } from "react";

type IntegrationSectionProps = {
  /** Optional id for the section (e.g. for anchor links). */
  sectionKey?: string;
  title: string;
  children: ReactNode;
  headingLevel?: 2 | 3;
  /** When true (default), render an hr above the section to separate from the previous one. Set false for the first section on a page. */
  dividerBefore?: boolean;
};

const sectionHrClass = "my-8 border-border";

/** Static section for integration pages: heading and always-visible content, with optional hr above. */
export function IntegrationSection({
  sectionKey,
  title,
  children,
  headingLevel = 2,
  dividerBefore = true,
}: IntegrationSectionProps) {
  const HeadingTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <>
      {dividerBefore && <hr className={sectionHrClass} aria-hidden />}
      <section
        className="mb-8"
        {...(sectionKey ? { "data-integration-section": sectionKey, id: sectionKey } : {})}
      >
        <HeadingTag className="text-[20px] font-medium tracking-[-0.02em] text-foreground mb-3">
          {title}
        </HeadingTag>
        <div>{children}</div>
      </section>
    </>
  );
}
