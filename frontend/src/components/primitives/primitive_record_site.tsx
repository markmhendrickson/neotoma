import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";
import { Card, CardContent } from "@/components/ui/card";
import { DOC_NAV_ICONS } from "@/site/doc_icons";
import {
  CODE_BLOCK_CARD_INNER_CLASS,
  CODE_BLOCK_CARD_SHELL_CLASS,
  CODE_BLOCK_CHROME_STACK_CLASS,
  CODE_BLOCK_CHROME_SUBTITLE_CLASS,
  EVALUATE_PROMPT_PILL_CLASS,
} from "@/components/code_block_copy_button_classes";

import type { PrimitiveRecordTypeGuide } from "./primitive_record_guides";
import {
  PRIMITIVE_RECORD_TYPE_GUIDES,
  PRIMITIVE_RECORD_TYPE_GUIDES_LIST,
  PRIMITIVE_RECORD_TYPE_SLUGS,
  REPO_DOCS_BASE,
} from "./primitive_record_guides";

export {
  PRIMITIVE_RECORD_TYPE_GUIDES,
  PRIMITIVE_RECORD_TYPE_GUIDES_LIST,
  PRIMITIVE_RECORD_TYPE_SLUGS,
} from "./primitive_record_guides";

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="mb-4">
      <div className={CODE_BLOCK_CARD_SHELL_CLASS}>
        <div className="mb-3 flex flex-col gap-3">
          <div className={CODE_BLOCK_CHROME_STACK_CLASS}>
            <div className={EVALUATE_PROMPT_PILL_CLASS}>
              <span
                className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80"
                aria-hidden
              />
              {label}
            </div>
            <div className={CODE_BLOCK_CHROME_SUBTITLE_CLASS}>
              Schema or pattern reference for this primitive.
            </div>
          </div>
        </div>
        <div
          className={`${CODE_BLOCK_CARD_INNER_CLASS} p-4 font-mono text-[13px] leading-6 overflow-x-auto whitespace-pre`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="group scroll-mt-6 text-[20px] font-medium tracking-[-0.02em] mt-14 mb-3"
    >
      {children}
      <a
        href={`#${id}`}
        className="ml-2 inline-flex items-center text-muted-foreground no-underline border-none opacity-40 group-hover:opacity-70 hover:!opacity-100 hover:text-foreground transition"
        aria-label="Link to section"
      >
        #
      </a>
    </h2>
  );
}

function PrimitiveRecordTypeContent({
  guide,
}: {
  guide: PrimitiveRecordTypeGuide;
}) {
  return (
    <>
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">
        {guide.intro}
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground italic mb-6">
        {guide.flowPosition}
      </p>

      {guide.schemaCode ? (
        <>
          <SectionHeading id="schema">Schema</SectionHeading>
          {guide.schemaTitle ? (
            <p className="text-[15px] leading-7 text-muted-foreground mb-4">
              {guide.schemaTitle}
            </p>
          ) : null}
          <CodeBlock label="SQL / TS">{guide.schemaCode}</CodeBlock>
          {guide.schemaFields && guide.schemaFields.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden mb-6">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-foreground">
                      Field
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">
                      Type
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">
                      Purpose
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {guide.schemaFields.map((f) => (
                    <tr key={f.field} className="border-t border-border">
                      <td className="px-4 py-2">
                        <code className="text-[13px]">{f.field}</code>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        <code className="text-[13px]">{f.type}</code>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {f.purpose}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      {guide.sections.map((section) => (
        <section key={section.id}>
          <SectionHeading id={section.id}>{section.heading}</SectionHeading>
          <p className="text-[15px] leading-7 text-muted-foreground mb-4">
            {section.body}
          </p>
        </section>
      ))}

      <SectionHeading id="invariants">Invariants</SectionHeading>
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">
        Every {guide.singularLabel} satisfies the following constraints:
      </p>
      <p className="text-[14px] font-medium text-foreground mb-2">
        MUST
      </p>
      <ul className="list-disc pl-5 space-y-1 mb-5 text-[15px] leading-7 text-muted-foreground">
        {guide.mustList.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-[14px] font-medium text-foreground mb-2">MUST NOT</p>
      <ul className="list-disc pl-5 space-y-1 mb-6 text-[15px] leading-7 text-muted-foreground">
        {guide.mustNotList.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <SectionHeading id="related">Related</SectionHeading>
      <ul className="list-none pl-0 space-y-2 mb-2">
        {guide.related.map((link) => {
          const isExternal = link.external || link.href.startsWith("http");
          const labelEl = (
            <span className="text-[15px] text-foreground underline underline-offset-2 hover:no-underline">
              {link.label}
            </span>
          );
          return (
            <li key={link.href} className="text-[15px] leading-7">
              {isExternal ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline"
                >
                  {labelEl}
                </a>
              ) : (
                <MdxI18nLink to={link.href} className="no-underline">
                  {labelEl}
                </MdxI18nLink>
              )}{" "}
              <span className="text-muted-foreground text-[14px]">
               , {link.desc}
              </span>
            </li>
          );
        })}
      </ul>

      <SectionHeading id="more">Where to go next</SectionHeading>
      <ul className="list-none pl-0 space-y-2">
        <li>
          <MdxI18nLink
            to="/primitives"
            className="text-[15px] text-foreground underline underline-offset-2 hover:no-underline"
          >
            All primitive record types
          </MdxI18nLink>{" "}
          <span className="text-muted-foreground text-[14px]">
           , index of sources, interpretations, observations, relationships, and timeline events
          </span>
        </li>
        <li>
          <MdxI18nLink
            to="/architecture"
            className="text-[15px] text-foreground underline underline-offset-2 hover:no-underline"
          >
            Architecture
          </MdxI18nLink>{" "}
          <span className="text-muted-foreground text-[14px]">
           , how the primitives compose into Neotoma's deterministic state
          </span>
        </li>
        <li>
          <MdxI18nLink
            to="/terminology"
            className="text-[15px] text-foreground underline underline-offset-2 hover:no-underline"
          >
            Terminology
          </MdxI18nLink>{" "}
          <span className="text-muted-foreground text-[14px]">
           , canonical glossary of terms used across Neotoma docs
          </span>
        </li>
      </ul>
    </>
  );
}

export function PrimitiveRecordTypePageBody({ slug }: { slug: string }) {
  const guide = PRIMITIVE_RECORD_TYPE_GUIDES.find((g) => g.slug === slug);
  if (!guide) return null;
  return <PrimitiveRecordTypeContent guide={guide} />;
}

export function PrimitivesIndexPageBody() {
  return (
    <>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Neotoma has seven primitive record types. They are the system-level
        building blocks every application-level entity, observation, and
        snapshot is composed from. Together they give Neotoma its
        determinism, immutability, and full provenance.
      </p>
      <p className="text-[15px] leading-7 text-muted-foreground mb-8">
        Primitive record types are distinct from{" "}
        <MdxI18nLink
          to="/types/contacts"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          application-level record types
        </MdxI18nLink>{" "}
        like contacts, tasks, transactions, and events. Application types are
        what agents and users write through the API. Primitive types are what
        Neotoma uses internally to store, audit, and compose that data.
      </p>

      <ul className="list-none pl-0 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3 mb-12">
        {PRIMITIVE_RECORD_TYPE_GUIDES.map((guide) => {
          const Icon = DOC_NAV_ICONS[guide.iconName] ?? DOC_NAV_ICONS.BookOpen;
          return (
            <li key={guide.slug} className="h-full">
              <MdxI18nLink
                to={`/primitives/${guide.slug}`}
                className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              >
                <Card className="h-full transition-colors hover:bg-muted/50 border border-border [&_a]:no-underline [&_a]:hover:no-underline">
                  <CardContent className="p-4 h-full">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                        aria-hidden
                      >
                        {Icon ? (
                          <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-[15px] text-foreground block">
                          {guide.label}
                        </span>
                        <span className="text-[13px] leading-snug text-muted-foreground block mt-0.5">
                          {guide.cardTagline}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </MdxI18nLink>
            </li>
          );
        })}
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-3">
        How they compose
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">
        The three-layer truth model is{" "}
        <code className="text-[13px] bg-muted px-1.5 py-0.5 rounded">
          Source → Interpretation → Observation → Snapshot
        </code>
        . Sources hold raw bytes. Interpretations record how those bytes were
        read. Observations capture granular facts that link back to both, and
        the reducer composes them into snapshots. Relationships follow the
        same observation-snapshot pattern but for typed graph edges. Timeline
        events fall out as a deterministic side-effect of writing snapshots
        with date fields.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground">
        For the full architectural picture see the{" "}
        <MdxI18nLink
          to="/architecture"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          architecture overview
        </MdxI18nLink>{" "}
        and the{" "}
        <a
          href={`${REPO_DOCS_BASE}/architecture/determinism.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          determinism doctrine
        </a>
        .
      </p>
    </>
  );
}
