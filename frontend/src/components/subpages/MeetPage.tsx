import { ExternalLink, MessageSquareQuote, Network, Wrench } from "lucide-react";
import { HOME_EVALUATE_CTA_CLASS } from "@/components/code_block_copy_button_classes";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import { sendCtaClick } from "@/utils/analytics";

const NOTION_MEET_INTERVIEW =
  "https://calendar.notion.so/meet/markmhendrickson/interview";

export function MeetPage() {
  return (
    <DetailPage title="Meet with the creator">
      <p className="text-[15px] leading-7 mb-6 text-muted-foreground">
        Pick a time that works for you. Sessions are booked through Notion Calendar.
      </p>

      <div className="mb-6">
        <a
          {...detailPageCtaLinkProps}
          href={NOTION_MEET_INTERVIEW}
          target="_blank"
          rel="noopener noreferrer"
          className={`${HOME_EVALUATE_CTA_CLASS} w-full sm:w-auto`}
          onClick={() => sendCtaClick("meet_page_notion_interview")}
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          Book via Notion Calendar
        </a>
      </div>

      <hr className="my-8 border-0 border-t border-border" />

      <section className="space-y-4">
        <h2 className="text-[20px] font-medium tracking-[-0.02em] text-foreground">
          Good reasons to book time
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 inline-flex rounded-lg border border-border/70 bg-background p-2 text-muted-foreground">
              <Network className="h-4 w-4" aria-hidden />
            </div>
            <p className="text-[14px] font-medium text-foreground">Evaluate Neotoma for your stack</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              Talk through whether Neotoma fits your actual agent architecture, data model, and workflow.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 inline-flex rounded-lg border border-border/70 bg-background p-2 text-muted-foreground">
              <Wrench className="h-4 w-4" aria-hidden />
            </div>
            <p className="text-[14px] font-medium text-foreground">Unblock implementation details</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              Get help thinking through MCP, CLI, schema design, ingestion flows, or inspector usage.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 inline-flex rounded-lg border border-border/70 bg-background p-2 text-muted-foreground">
              <MessageSquareQuote className="h-4 w-4" aria-hidden />
            </div>
            <p className="text-[14px] font-medium text-foreground">Share real workflow feedback</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              Bring your current pain points, adoption blockers, or product feedback from serious agent use.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[20px] font-medium tracking-[-0.02em] text-foreground">
          What we can use the time for
        </h2>
        <ul className="space-y-2 text-[14px] leading-7 text-muted-foreground">
          <li>Architecture review for a multi-agent or memory-heavy workflow</li>
          <li>Whether to use Neotoma now, later, or not at all</li>
          <li>How to model your data and avoid state drift across tools</li>
          <li>Roadmap, gaps, and what would need to be true for adoption</li>
        </ul>
      </section>
    </DetailPage>
  );
}
