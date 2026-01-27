import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  ChevronDown,
  Home,
  BookOpen,
  FileText,
  Code,
  Building2,
  Settings,
  Plug,
  HelpCircle,
  Database,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  isActive?: boolean;
}

const navigationSections: NavSection[] = [
  {
    title: 'Application',
    items: [
      { label: 'Neotoma App', href: '/', icon: Home },
    ],
  },
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
      { label: 'MCP Setup (Cursor)', href: '/docs/developer/mcp_cursor_setup.md', icon: Code },
      { label: 'MCP Setup (ChatGPT)', href: '/docs/developer/mcp_chatgpt_setup.md', icon: Code },
      { label: 'MCP Setup (Claude)', href: '/docs/developer/mcp_claude_code_setup.md', icon: Code },
    ],
  },
  {
    title: 'Integration Guides',
    items: [
      { label: 'Gmail Setup', href: '/docs/integrations/gmail_setup.md', icon: Plug },
      { label: 'External Providers', href: '/docs/integrations/external_providers.md', icon: Plug },
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      { label: 'Common Issues', href: '/docs/operations/troubleshooting.md', icon: HelpCircle },
    ],
  },
];

interface AppSidebarProps {
  currentPath?: string;
  onNavigate?: (href: string) => void;
}

/**
 * Documentation sidebar component
 * 
 * @param props.currentPath - Current path for active state detection
 * @param props.onNavigate - Optional navigation handler for docs
 * 
 * Features:
 * - Collapsible navigation sections
 * - Active state detection
 * - Auto-closes on mobile when navigation link is clicked
 */
export function AppSidebar({
  currentPath,
  onNavigate,
}: AppSidebarProps) {
  const { isMobile, setOpen } = useSidebar();

  const handleNavigate = (href: string, e?: React.MouseEvent<HTMLAnchorElement>) => {
    if (e) {
      e.preventDefault();
    }

    // Auto-close sidebar on mobile
    if (isMobile) {
      setOpen(false);
    }

    // If navigating to main app, do full page navigation
    if (href === '/') {
      window.location.href = '/';
      return;
    }
    // If navigating to docs, check if it's a markdown file
    if (href.startsWith('/docs/')) {
      if (onNavigate) {
        onNavigate(href);
      } else {
        window.location.href = href;
      }
      return;
    }
    // For other routes, use full page navigation
    window.location.href = href;
  };

  // Determine current path from window if not provided
  const activePath = currentPath || window.location.pathname;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center gap-2 py-2 px-3 h-16">
        <Database className="h-5 w-5 shrink-0" />
        <h2 className="text-lg font-semibold">Neotoma</h2>
      </SidebarHeader>
      <SidebarContent>
        {navigationSections.map((section, sectionIndex) => (
          <Collapsible key={`${section.title}-${sectionIndex}`} defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="w-full">
                  {section.title}
                  <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item, itemIndex) => {
                      const isActive = activePath === item.href || 
                        (item.href === '/' && activePath === '/') ||
                        (item.href.startsWith('/docs/') && activePath.startsWith('/docs/') && activePath === item.href);
                      const uniqueKey = `${section.title}-${item.label}-${itemIndex}`;
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={uniqueKey}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                          >
                            <a
                              href={item.href}
                              onClick={(e) => handleNavigate(item.href, e)}
                            >
                              <Icon />
                              <span>{item.label}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

