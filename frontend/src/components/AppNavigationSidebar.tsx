import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import {
  LucideIcon,
  Loader2,
  User,
  Search,
  FileText,
  Layers,
  Eye,
  Database,
  Network,
  Calendar,
  Key,
  Palette,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Check,
  PanelLeft,
  List,
  LogIn,
  UserPlus,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import {
  INTEGRATIONS,
  SIDEBAR_INTEGRATION_COUNT,
  getIntegrationIcon,
} from "@/constants/integrations";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/components/ui/use-toast";
import { formatEntityType } from "@/utils/entityTypeFormatter";
import { cn } from "@/lib/utils";
import { getSchemaIcon, fetchSchemaMetadataBatch, type SchemaMetadata } from "@/utils/schemaIcons";
import { useRealtime } from "@/contexts/RealtimeContext";
import { getApiClient } from "@/lib/api_client";

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface AppNavigationSidebarProps {
  siteName: string;
  menuItems: MenuItem[];
  accountEmail?: string;
  footerActions?: React.ReactNode;
  /** When provided, sidebar shows Search menu item */
  onSearch?: ((query: string) => void) | null;
  onSignOut?: () => void;
}

/**
 * Configurable sidebar for app navigation
 *
 * @param props.siteName - Name to display in sidebar header
 * @param props.menuItems - Array of menu items with path, label, and icon (displayed in footer)
 *
 * Features:
 * - Displays entity types in main sidebar content
 * - Menu items moved to footer
 * - Active state detection based on current pathname
 * - Auto-closes on mobile when navigation link is clicked
 * - Accessible navigation structure
 */
export function AppNavigationSidebar({
  siteName,
  menuItems,
  accountEmail,
  footerActions,
  onSearch,
  onSignOut,
}: AppNavigationSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, setOpen, open, state, toggleSidebar } = useSidebar();
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [entityCounts, setEntityCounts] = useState<Map<string, number>>(new Map());
  const [schemaMetadata, setSchemaMetadata] = useState<Map<string, SchemaMetadata>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken, resetGuestAuth } = useAuth();
  const { theme, setTheme } = useTheme();
  const { subscribe } = useRealtime();
  const { toast } = useToast();

  // Prefer bearer token from keys, fallback to Supabase session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  // Helper function to fetch entity types
  const fetchEntityTypes = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Fetch all entities for the user to get entity types they actually have
      const api = getApiClient(bearerToken);
      const { data, error } = await api.POST("/api/entities/query", {
        body: {
          limit: 1000,
          user_id: user.id,
        },
      });
      if (error || !data) {
        throw new Error("Failed to fetch entities");
      }
      const entities = data.entities || [];

      // Count entities per type
      const counts = new Map<string, number>();
      for (const entity of entities) {
        const type = entity.entity_type;
        counts.set(type, (counts.get(type) || 0) + 1);
      }

      // Get unique entity types sorted
      const userEntityTypes = Array.from(counts.keys()).sort();

      // Fetch schema metadata for these entity types (including icons)
      if (bearerToken) {
        try {
          const metadata = await fetchSchemaMetadataBatch(
            userEntityTypes,
            bearerToken,
            user.id
          );
          setSchemaMetadata(metadata);
        } catch (error) {
          console.error("Failed to fetch schema metadata:", error);
        }
      }

      // Only show entity types where user has at least one entity
      setEntityTypes(userEntityTypes);
      setEntityCounts(counts);
    } catch (error) {
      console.error("Failed to fetch entity types:", error);
      setEntityTypes([]);
    } finally {
      setLoading(false);
    }
  }, [bearerToken, user?.id]);

  // Initial fetch
  useEffect(() => {
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    if (!user?.id) {
      return;
    }

    fetchEntityTypes();
  }, [fetchEntityTypes, keysLoading, sessionToken, settings.bearerToken, user?.id]);

  // Add real-time subscription to refetch when entities change
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribe({
      table: "entities",
      event: "*",
      filter: `user_id=eq.${user.id}`,
      callback: () => {
        fetchEntityTypes();
      },
    });

    return unsubscribe;
  }, [user, subscribe, fetchEntityTypes]);

  // Extract entity type from URL path segment
  useEffect(() => {
    const pathMatch = location.pathname.match(/^\/entities\/([^/]+)$/);
    if (pathMatch) {
      const segment = pathMatch[1];
      // Check if it's an entity type (not an entity ID - entity IDs start with "ent_" or are UUIDs)
      // Entity types are short strings like "task", "invoice", etc.
      // Entity IDs are long hashes starting with "ent_" or UUIDs
      if (!segment.startsWith("ent_") && segment.length < 50 && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        setSelectedEntityType(segment);
      } else {
        setSelectedEntityType(null);
      }
    } else if (location.pathname === "/entities") {
      setSelectedEntityType(null);
    } else {
      setSelectedEntityType(null);
    }
  }, [location]);

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  const handleLinkClick = (event?: React.MouseEvent) => {
    if (event && (event.metaKey || event.ctrlKey || event.button === 1)) {
      return;
    }
    if (isMobile) {
      setOpen(false);
    }
  };

  const openInNewTab = (href: string) => {
    if (typeof window === "undefined") return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleEntityTypeClick = (event: React.MouseEvent, entityType: string) => {
    const href = `/entities/${encodeURIComponent(entityType)}`;
    if (event.metaKey || event.ctrlKey) {
      openInNewTab(href);
      return;
    }
    // Navigate to entities page with type filter using path segment
    navigate(href);
    if (isMobile) {
      setOpen(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div
          className={cn(
            "flex items-center gap-2 h-16 w-full min-w-0",
            state === "collapsed" && "justify-center"
          )}
        >
          {state === "collapsed" ? (
            <SidebarMenuButton
              tooltip="Expand sidebar"
              className="shrink-0 size-8 flex items-center justify-center"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <PanelLeft className="size-4 shrink-0" />
            </SidebarMenuButton>
          ) : (
            <SidebarTrigger className="shrink-0" />
          )}
          {state !== "collapsed" && (
            <Link
              to="/"
              onClick={handleLinkClick}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <span className="text-lg font-semibold truncate">{siteName}</span>
            </Link>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Search - in group without header */}
        {onSearch && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/search")}>
                    <Link to="/search" onClick={handleLinkClick}>
                      <Search className="size-4" />
                      <span>Search</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Entities Section */}
        {(loading || entityTypes.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Entities</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {loading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  entityTypes.map((entityType) => {
                    const count = entityCounts.get(entityType) || 0;
                    const metadata = schemaMetadata.get(entityType);
                    const Icon = getSchemaIcon(entityType, metadata);

                    return (
                      <SidebarMenuItem key={entityType}>
                        <SidebarMenuButton
                          asChild
                          isActive={selectedEntityType === entityType}
                          className="peer/menu-button"
                        >
                          <button
                            onClick={(event) => handleEntityTypeClick(event, entityType)}
                            onMouseDown={(event) => {
                              if (event.button === 1) {
                                event.preventDefault();
                                openInNewTab(`/entities/${encodeURIComponent(entityType)}`);
                              }
                            }}
                            className="w-full flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              {Icon && <Icon className="size-4 shrink-0" />}
                              <span className="truncate">
                                {formatEntityType(entityType)}
                              </span>
                            </div>
                          </button>
                        </SidebarMenuButton>
                        {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Related Data Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Related data</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/sources")}>
                  <Link to="/sources" onClick={handleLinkClick}>
                    <FileText className="size-4" />
                    <span>Sources</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/observations")}>
                  <Link to="/observations" onClick={handleLinkClick}>
                    <Eye className="size-4" />
                    <span>Observations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/interpretations")}>
                  <Link to="/interpretations" onClick={handleLinkClick}>
                    <Layers className="size-4" />
                    <span>Interpretations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/relationships")}>
                  <Link to="/relationships" onClick={handleLinkClick}>
                    <Network className="size-4" />
                    <span>Relationships</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/timeline")}>
                  <Link to="/timeline" onClick={handleLinkClick}>
                    <Calendar className="size-4" />
                    <span>Timeline</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Integrations Section: first 3 in sidebar; View all links to index */}
        <SidebarGroup>
          <SidebarGroupLabel>Integrations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {INTEGRATIONS.slice(0, SIDEBAR_INTEGRATION_COUNT).map(
                ({ path, label, iconKey }) => {
                  const Icon = getIntegrationIcon(iconKey);
                  return (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton asChild isActive={isActive(path)}>
                        <Link to={path} onClick={handleLinkClick}>
                          <Icon className="size-4" />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/integrations")}>
                  <Link to="/integrations" onClick={handleLinkClick}>
                    <List className="size-4" />
                    <span>View all</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Development Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Development</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/docs")}>
                  <Link to="/docs" onClick={handleLinkClick}>
                    <BookOpen className="size-4" />
                    <span>Documentation</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/schemas")}>
                  <Link to="/schemas" onClick={handleLinkClick}>
                    <Database className="size-4" />
                    <span>Schemas</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/oauth")}>
                  <Link to="/oauth" onClick={handleLinkClick}>
                    <Key className="size-4" />
                    <span>OAuth</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {import.meta.env.DEV && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/design-system")}>
                    <Link to="/design-system" onClick={handleLinkClick}>
                      <Palette className="size-4" />
                      <span>Design System</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <User className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-[0.9375rem] leading-tight">
                <span className="truncate font-semibold">
                  {user?.is_anonymous
                    ? "Guest"
                    : (accountEmail || user?.email)?.split("@")[0] ||
                      accountEmail ||
                      user?.email ||
                      "Account"}
                </span>
                {!user?.is_anonymous && (accountEmail || user?.email) && (
                  <span className="truncate text-[0.8125rem] text-muted-foreground">
                    {accountEmail || user?.email}
                  </span>
                )}
                {user?.id && (
                  <span className="truncate text-[0.8125rem] text-muted-foreground font-mono">
                    {user.id}
                  </span>
                )}
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side="top"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer">
              <Sun className="h-4 w-4 mr-2" />
              <span>Light</span>
              {theme === "light" && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
              <Moon className="h-4 w-4 mr-2" />
              <span>Dark</span>
              {theme === "dark" && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer">
              <Monitor className="h-4 w-4 mr-2" />
              <span>System</span>
              {theme === "system" && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {user?.is_anonymous ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/signin")}
                  className="cursor-pointer"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  <span>Sign in</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/signup")}
                  className="cursor-pointer"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  <span>Create account</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    // Show toast immediately before auth state changes
                    toast({
                      title: "Signed out",
                      description: "You are now using a guest account",
                    });
                    // Small delay to ensure toast renders
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await resetGuestAuth();
                  }}
                  className="cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </>
            ) : (
              onSignOut && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={async () => {
                      // Show toast immediately before auth state changes
                      toast({
                        title: "Signed out",
                        description: "You are now using a guest account",
                      });
                      // Small delay to ensure toast renders
                      await new Promise(resolve => setTimeout(resolve, 100));
                      await onSignOut();
                    }} 
                    className="cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
