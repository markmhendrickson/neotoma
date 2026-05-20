import { Fragment } from "react";
import { SiGithub, SiNpm } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

export function SidebarExternalLinks({ collapsed }: SidebarExternalLinksProps) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-sidebar-border",
        collapsed ? "flex flex-col items-center gap-0.5 px-2 py-2" : "flex items-center gap-0.5 px-3 py-2",
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
    </div>
  );
}
