import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown,
  Home,
  BookOpen,
  FileText,
  Code,
  Building2,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navigationSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Getting Started', href: '/docs/developer/getting_started.md', icon: BookOpen },
      { label: 'What It Does', href: '/docs/', icon: FileText },
      { label: 'Core Workflow', href: '/docs/', icon: Settings },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { label: 'MCP Actions', href: '/docs/specs/MCP_SPEC.md', icon: Code },
      { label: 'REST API', href: '/docs/api/rest_api.md', icon: Code },
    ],
  },
  {
    title: 'Architecture',
    items: [
      { label: 'Overview', href: '/docs/architecture/architecture.md', icon: Building2 },
      { label: 'Data Models', href: '/docs/foundation/data_models.md', icon: FileText },
      { label: 'Entity Resolution', href: '/docs/foundation/entity_resolution.md', icon: Building2 },
      { label: 'Timeline Events', href: '/docs/foundation/timeline_events.md', icon: FileText },
    ],
  },
  {
    title: 'Developer Guides',
    items: [
      { label: 'Development Workflow', href: '/docs/developer/development_workflow.md', icon: Settings },
      { label: 'CLI overview', href: '/docs/developer/cli_overview.md', icon: Code },
      { label: 'CLI reference', href: '/docs/developer/cli_reference.md', icon: Code },
      { label: 'MCP overview', href: '/docs/developer/mcp_overview.md', icon: Code },
      { label: 'MCP Setup (Cursor)', href: '/docs/developer/mcp_cursor_setup.md', icon: Code },
      { label: 'MCP Setup (ChatGPT)', href: '/docs/developer/mcp_chatgpt_setup.md', icon: Code },
      { label: 'MCP Setup (Claude)', href: '/docs/developer/mcp_claude_code_setup.md', icon: Code },
    ],
  },
  {
    title: "Testing",
    items: [
      { label: "Automated test catalog", href: "/docs/testing/automated_test_catalog.md", icon: FileText },
      { label: "Testing standard", href: "/docs/testing/testing_standard.md", icon: FileText },
      { label: "Test environment configuration", href: "/docs/testing/test_environment_configuration.md", icon: Settings },
      { label: "Route coverage rules", href: "/docs/testing/full_route_coverage_rules.md", icon: FileText },
      { label: "Fixture standards", href: "/docs/testing/fixtures_standard.md", icon: FileText },
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      { label: 'Common Issues', href: '/docs/operations/troubleshooting.md', icon: HelpCircle },
    ],
  },
];

interface DocumentationDirectoryProps {
  onNavigate?: (href: string) => void;
}

export function DocumentationDirectory({ onNavigate }: DocumentationDirectoryProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname;

  const openInNewTab = (href: string) => {
    if (typeof window === 'undefined') return;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const handleNavigate = (event: React.MouseEvent, href: string) => {
    if (event.metaKey || event.ctrlKey) {
      openInNewTab(href);
      return;
    }
    if (onNavigate) {
      onNavigate(href);
    } else {
      navigate(href);
    }
  };

  const handleNavigateMouseDown = (event: React.MouseEvent, href: string) => {
    if (event.button === 1) {
      event.preventDefault();
      openInNewTab(href);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <h2 className="text-lg font-semibold mb-4 text-foreground">Documentation</h2>
      <div className="space-y-2">
        {navigationSections.map((section, sectionIndex) => (
          <Collapsible key={`${section.title}-${sectionIndex}`} defaultOpen className="group/collapsible">
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-2 rounded-md hover:bg-accent transition-colors text-sm font-medium text-foreground">
              <span>{section.title}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-2 mt-1 space-y-1">
                {section.items.map((item, itemIndex) => {
                  const isActive = activePath === item.href || 
                    (item.href === '/docs/' && activePath === '/docs') ||
                    (item.href.startsWith('/docs/') && activePath.startsWith('/docs/') && activePath === item.href);
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${section.title}-${item.label}-${itemIndex}`}
                      onClick={(event) => handleNavigate(event, item.href)}
                      onMouseDown={(event) => handleNavigateMouseDown(event, item.href)}
                      className={cn(
                        "flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-sm transition-colors text-left",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
