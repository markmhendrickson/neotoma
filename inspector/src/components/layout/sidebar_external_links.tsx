import { Fragment } from "react";
import { SiGithub, SiNpm } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useServerInfo } from "@/hooks/use_infra";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/markmhendrickson/neotoma";
const NPM_URL = "https://www.npmjs.com/package/neotoma";

const externalLinks = [
  { href: GITHUB_URL, label: "GitHub", Icon: SiGithub },
  { href: NPM_URL, label: "npm", Icon: SiNpm },
] as const;

type SidebarExternalLinksProps = {
  collapsed: boolean;
};

function formatBuildVersionLabel(version?: string, gitSha?: string | null): string | null {
  const trimmedVersion = version?.trim();
  const trimmedSha = gitSha?.trim();
  if (!trimmedVersion && !trimmedSha) return null;
  if (trimmedVersion && trimmedSha) {
    return `v${trimmedVersion} · ${trimmedSha.slice(0, 7)}`;
  }
  if (trimmedVersion) return `v${trimmedVersion}`;
  return trimmedSha!.slice(0, 7);
}

export function SidebarExternalLinks({ collapsed }: SidebarExternalLinksProps) {
  const serverInfo = useServerInfo();
  const buildVersionLabel = formatBuildVersionLabel(
    serverInfo.data?.version,
    serverInfo.data?.git_sha,
  );

  const buildVersion = buildVersionLabel ? (
    <span
      className={cn(
        "font-mono text-sidebar-foreground/60",
        collapsed ? "max-w-full truncate text-[10px] leading-none" : "ml-auto truncate text-xs",
      )}
      title={buildVersionLabel}
    >
      {buildVersionLabel}
    </span>
  ) : null;

  return (
    <div
      className={cn(
        "shrink-0 border-t border-sidebar-border",
        collapsed
          ? "flex flex-col items-center gap-0.5 px-2 py-2"
          : "flex min-w-0 items-center gap-0.5 px-3 py-2",
      )}
    >
      {externalLinks.map(({ href, label, Icon }) => {
        const link = (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              collapsed ? "h-9 w-9" : "h-8 w-8",
            )}
            aria-label={label}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
          </a>
        );

        if (collapsed) {
          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        }

        return <Fragment key={href}>{link}</Fragment>;
      })}
      {buildVersion && !collapsed ? buildVersion : null}
      {buildVersion && collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex max-w-full">{buildVersion}</span>
          </TooltipTrigger>
          <TooltipContent side="right">Build {buildVersionLabel}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
