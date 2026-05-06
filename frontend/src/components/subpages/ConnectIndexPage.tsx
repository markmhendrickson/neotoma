import { Link } from "react-router-dom";
import type { ElementType } from "react";
import { ArrowUpRight } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { CodexIcon } from "../icons/CodexIcon";
import { CursorIcon } from "../icons/CursorIcon";
import { IronClawIcon } from "../icons/IronClawIcon";
import { OpenCodeIcon } from "../icons/OpenCodeIcon";
import { OpenClawIcon } from "../icons/OpenClawIcon";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const harnessCardTitleLink =
  "text-[15px] font-medium text-foreground no-underline transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm";
const harnessCardMetaLink =
  "text-muted-foreground no-underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm";

const HARNESS_ICONS: Record<string, ElementType> = {
  "Claude Code": SiClaude,
  "Claude Desktop": SiClaude,
  "claude.ai (remote MCP)": SiClaude,
  "ChatGPT (remote MCP)": SiOpenai,
  Codex: CodexIcon,
  OpenCode: OpenCodeIcon,
  Cursor: CursorIcon,
  OpenClaw: OpenClawIcon,
  IronClaw: IronClawIcon,
};

export function ConnectIndexPage() {
  const { locale, subpage } = useLocale();
  const c = subpage.connect;
  const lp = (path: string) => localizePath(path, locale);

  return (
    <DetailPage title={c.title}>
      <p className="text-[15px] leading-7 text-foreground mb-3">
        {c.introP1BeforeSandbox}
        <Link to={lp("/sandbox")} className={extLink}>
          {c.introSandboxLink}
        </Link>
        {c.introP1AfterSandbox}
        <code className="text-[13px]">/mcp</code>
        {c.introP1AfterMcp}
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        {c.introP2BeforeInstall}
        <Link to={lp("/install")} className={extLink}>
          {c.introInstallLink}
        </Link>
        {c.introP2Middle}
        <Link to={lp("/hosted")} className={extLink}>
          {c.introHostedLink}
        </Link>
        {c.introP2End}
      </p>

      <IntegrationSection title={c.sectionPickHarness} sectionKey="harnesses" dividerBefore={false}>
        <ul className="list-none pl-0 m-0 space-y-2">
          {c.harnesses.map((entry) => {
            const Icon = HARNESS_ICONS[entry.label] ?? SiClaude;
            return (
              <li
                key={entry.label}
                className="rounded-lg border border-border bg-muted/20 p-3 flex items-start gap-3"
              >
                <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Link to={lp(entry.remote)} className={harnessCardTitleLink}>
                      {entry.label}
                    </Link>
                    <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </div>
                  <p className="text-[14px] leading-6 text-muted-foreground mt-0.5 mb-1">{entry.desc}</p>
                  <p className="text-[13px] leading-6 text-muted-foreground">
                    <Link to={lp(entry.remote)} className={harnessCardMetaLink}>
                      {c.linkRemoteMcpSetup}
                    </Link>
                    {entry.local ? (
                      <>
                        {" · "}
                        <Link to={lp(entry.local)} className={harnessCardMetaLink}>
                          {c.linkLocalStdioSetup}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </IntegrationSection>

      <IntegrationSection title={c.sectionHostRequirements} sectionKey="host-requirements">
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">{c.hostReqIntro}</p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-3">
          <li>
            <strong className="text-foreground">{c.hostReqLi1Strong}</strong>
            {c.hostReqLi1Body}
          </li>
          <li>
            <strong className="text-foreground">{c.hostReqLi2Strong}</strong>
            {c.hostReqLi2Body}
          </li>
        </ul>
        <p className="text-[14px] leading-6 text-muted-foreground">{c.hostReqTip}</p>
      </IntegrationSection>

      <IntegrationSection title={c.sectionRelated} sectionKey="related">
        <p className="text-[14px] leading-6 text-muted-foreground">
          <Link to={lp("/install")} className={extLink}>
            {c.relatedInstall}
          </Link>
          {" · "}
          <Link to={lp("/hosted")} className={extLink}>
            {c.relatedHosted}
          </Link>
          {" · "}
          <Link to={lp("/sandbox")} className={extLink}>
            {c.relatedSandbox}
          </Link>
          {" · "}
          <Link to={lp("/tunnel")} className={extLink}>
            {c.relatedTunnel}
          </Link>
          {" · "}
          <Link to={lp("/api")} className={extLink}>
            {c.relatedApi}
          </Link>
          {" · "}
          <Link to={lp("/mcp")} className={extLink}>
            {c.relatedMcp}
          </Link>
        </p>
      </IntegrationSection>
    </DetailPage>
  );
}
