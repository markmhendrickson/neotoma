import type { ElementType } from "react";
import { Link } from "react-router-dom";
import { Clock, RotateCcw } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { TrackedProductLink } from "../TrackedProductNav";
import { CodeBlock } from "../InstallCodeBlock";
import { DetailPage } from "../DetailPage";
import { PermissionsPreflight } from "../PermissionsPreflight";
import { Card, CardContent } from "../ui/card";
import { CodexIcon } from "../icons/CodexIcon";
import { CursorIcon } from "../icons/CursorIcon";
import { IronClawIcon } from "../icons/IronClawIcon";
import { OpenCodeIcon } from "../icons/OpenCodeIcon";
import { OpenClawIcon } from "../icons/OpenClawIcon";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import type { InstallTextSegment } from "@/i18n/locales/install_page_strings";

const INSTALL_INTEGRATION_ICONS: Record<string, ElementType> = {
  "/neotoma-with-claude-code": SiClaude,
  "/neotoma-with-claude": SiClaude,
  "/neotoma-with-chatgpt": SiOpenai,
  "/neotoma-with-codex": CodexIcon,
  "/neotoma-with-opencode": OpenCodeIcon,
  "/neotoma-with-cursor": CursorIcon,
  "/neotoma-with-openclaw": OpenClawIcon,
  "/neotoma-with-ironclaw": IronClawIcon,
};

const codeSm = "text-sm bg-muted px-1.5 py-0.5 rounded";
const codeXs = "text-[12px] bg-muted px-1 py-0.5 rounded";

function renderInstallSegments(segments: InstallTextSegment[]) {
  return segments.map((seg, i) =>
    typeof seg === "string" ? (
      <span key={i}>{seg}</span>
    ) : (
      <code key={i} className={codeSm}>
        {seg.code}
      </code>
    ),
  );
}

function renderInstallSegmentsTight(segments: InstallTextSegment[]) {
  return segments.map((seg, i) =>
    typeof seg === "string" ? (
      <span key={i}>{seg}</span>
    ) : (
      <code key={i} className={codeXs}>
        {seg.code}
      </code>
    ),
  );
}

function WhatChangesSection({
  heading,
  introSegments,
  footnoteSegments,
  tableCreated,
  tablePath,
  tableScope,
  tableReset,
  rows,
}: {
  heading: string;
  introSegments: InstallTextSegment[];
  footnoteSegments: InstallTextSegment[];
  tableCreated: string;
  tablePath: string;
  tableScope: string;
  tableReset: string;
  rows: { what: string; path: string; scope: string; reset: string }[];
}) {
  return (
    <div className="mb-8">
      <hr className="mb-6 border-border" />
      <h2 className="text-[20px] font-medium tracking-[-0.01em]">{heading}</h2>
      <p className="text-[14px] leading-6 text-muted-foreground mt-2 mb-3">
        {renderInstallSegmentsTight(introSegments)}
      </p>

      <div className="rounded-lg border border-border overflow-x-auto mb-3">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-medium text-foreground">{tableCreated}</th>
              <th className="px-3 py-2 text-left font-medium text-foreground">{tablePath}</th>
              <th className="px-3 py-2 text-left font-medium text-foreground">{tableScope}</th>
              <th className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">
                <code className={codeXs}>{tableReset}</code>
              </th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {rows.map((row) => (
              <tr key={row.what} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 text-foreground whitespace-nowrap">{row.what}</td>
                <td className="px-3 py-2 font-mono text-[12px]">{row.path}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.scope}</td>
                <td className="px-3 py-2">{row.reset}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[13px] leading-5 text-muted-foreground">{renderInstallSegmentsTight(footnoteSegments)}</p>
    </div>
  );
}

export function InstallPage() {
  const { locale, subpage } = useLocale();
  const s = subpage.install;
  const lp = (path: string) => localizePath(path, locale);

  return (
    <DetailPage title={s.title}>
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 dark:text-sky-400">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {s.fiveMinuteIntegration}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 dark:text-sky-400">
          <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {s.fullyReversible}
        </span>
      </div>

      <div className="mb-8 rounded-lg border border-border/60 bg-muted/30 p-4">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">{s.evaluateCtaBody}</p>
        <TrackedProductLink
          to={lp("/evaluate")}
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.installPageEvaluateCta}
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground !no-underline hover:!no-underline hover:bg-muted transition-colors"
        >
          {s.startWithEvaluation}
        </TrackedProductLink>
      </div>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-3">{s.agentAssistedInstall}</h2>
      <p className="text-[15px] leading-7 mb-4">{s.agentAssistedLead}</p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.agentInstallPrompt}
        copyFeedbackId="install-copy-agent-assisted"
        installBlock="agent_assisted"
      />

      <div className="mb-6 rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
        <p className="text-[14px] leading-6 text-sky-900 dark:text-sky-50 mb-2">
          <strong>{s.expandedPromptLeadBold}</strong>
          {s.expandedPromptLeadAfterBold}
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-[14px] leading-6 text-sky-900 dark:text-sky-50">
          {s.expandedPromptBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>

      <h3 className="text-[17px] font-medium tracking-[-0.01em] mt-6 mb-3">{s.expandedInstallFirstSequence}</h3>
      <p className="text-[15px] leading-7 mb-3">
        {s.expandedSequenceIntroPrefix}
        <TrackedProductLink
          to={lp("/evaluate")}
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.installPageInlineEvaluate}
          className="underline underline-offset-2 hover:no-underline"
        >
          /evaluate
        </TrackedProductLink>
        {s.expandedSequenceIntroSuffix}
      </p>
      <ol className="list-decimal pl-5 space-y-2 mb-4">
        {s.expandedSteps.map((step) => (
          <li key={step.title} className="text-[15px] leading-7 text-muted-foreground">
            <strong className="text-foreground">{step.title}</strong>
            {renderInstallSegments(step.segments)}
          </li>
        ))}
      </ol>
      <div className="mb-6 rounded-lg border border-border/60 bg-muted/30 p-4">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">{s.permissionsNote}</p>
        <PermissionsPreflight />
      </div>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        {s.canonicalRefPrefix}{" "}
        <a
          href="https://github.com/markmhendrickson/neotoma/blob/main/install.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          install.md
        </a>
        {s.canonicalRefAfterInstallMd}
        <TrackedProductLink
          to={lp("/evaluate")}
          navTarget="evaluate"
          navSource={PRODUCT_NAV_SOURCES.installPageInlineEvaluate}
          className="underline underline-offset-2 hover:no-underline"
        >
          /evaluate
        </TrackedProductLink>
        {s.canonicalRefSuffix}
      </p>

      <p className="text-[13px] leading-5 text-muted-foreground mb-4">
        {s.moreOptions}{" "}
        <Link to={lp("/install/manual")} className="text-foreground underline underline-offset-2 hover:no-underline">
          {s.manualInstallLinkLabel}
        </Link>
        {" · "}
        <Link to={lp("/install/docker")} className="text-foreground underline underline-offset-2 hover:no-underline">
          {s.dockerLinkLabel}
        </Link>
        {" · "}
        <Link to={lp("/cli")} className="text-foreground underline underline-offset-2 hover:no-underline">
          {s.cliReferenceLinkLabel}
        </Link>
      </p>

      <WhatChangesSection
        heading={s.whatChangesOnSystem}
        introSegments={s.whatChangesIntroSegments}
        footnoteSegments={s.whatChangesFootnoteSegments}
        tableCreated={s.impactTableCreated}
        tablePath={s.impactTablePath}
        tableScope={s.impactTableScope}
        tableReset={s.impactTableReset}
        rows={s.impactRows}
      />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-4">{s.directIntegrationDocs}</h2>
      <p className="text-[13px] leading-6 text-muted-foreground mb-3">
        {s.hostedConnectLeadPrefix}
        <Link to={lp("/connect")} className="text-foreground underline underline-offset-2 hover:no-underline">
          {s.hostedConnectConnectLink}
        </Link>
        {s.hostedConnectMiddle}
        <Link to={lp("/sandbox")} className="text-foreground underline underline-offset-2 hover:no-underline">
          {s.hostedConnectSandboxLink}
        </Link>
        {s.hostedConnectSuffix}
      </p>
      <ul className="list-none pl-0 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3 mb-10 [&_a]:!no-underline [&_a]:hover:!no-underline">
        {s.integrationCards.map(({ href, label, desc }) => {
          const Icon = INSTALL_INTEGRATION_ICONS[href] ?? SiClaude;
          return (
            <li key={href} className="h-full">
              <Link
                to={lp(href)}
                className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              >
                <Card className="h-full transition-colors hover:bg-muted/50 border border-border">
                  <CardContent className="p-4 h-full">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                        aria-hidden
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-[15px] text-foreground block">{label}</span>
                        <span className="text-[13px] leading-snug text-muted-foreground block mt-0.5">{desc}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">{s.manualInstallAndDocker}</h2>
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Link
          to={lp("/install/manual")}
          className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            {s.manualInstall}
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">{s.manualCardDesc}</p>
        </Link>
        <Link
          to={lp("/install/docker")}
          className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
        >
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            {s.dockerInstall}
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">{s.dockerCardDesc}</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to={lp("/cli")}
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
        >
          {s.cliReference}
        </Link>
        <a
          href="https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#install"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
        >
          {s.fullReadme}
        </a>
      </div>
    </DetailPage>
  );
}
