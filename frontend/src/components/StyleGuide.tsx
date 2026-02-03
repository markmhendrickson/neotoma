import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Moon,
  Sun,
  Palette,
  Type,
  Layout,
  MousePointerClick,
  Table as TableIcon,
  Tag,
  AlertCircle,
  Loader2,
  FileText,
  X,
  Edit,
  Upload,
  Settings,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  ChevronDown,
  Info,
  HelpCircle,
} from "lucide-react";

interface ColorSwatch {
  name: string;
  value: string;
  description?: string;
}

const lightColors: ColorSwatch[] = [
  { name: "Background Primary", value: "#FFFFFF", description: "Main canvas" },
  {
    name: "Background Secondary",
    value: "#F9FAFB",
    description: "Cards/sections",
  },
  {
    name: "Background Tertiary",
    value: "#F3F4F6",
    description: "Hover states",
  },
  { name: "Foreground Primary", value: "#111827", description: "Primary text" },
  {
    name: "Foreground Secondary",
    value: "#6B7280",
    description: "Secondary text",
  },
  {
    name: "Foreground Tertiary",
    value: "#9CA3AF",
    description: "Tertiary text",
  },
  { name: "Border", value: "#E5E7EB", description: "Borders" },
  { name: "Primary", value: "#0066CC", description: "Trust/Action" },
  { name: "Success", value: "#10B981", description: "Success states" },
  { name: "Error", value: "#EF4444", description: "Error states" },
  { name: "Warning", value: "#F59E0B", description: "Warning states" },
];

const darkColors: ColorSwatch[] = [
  { name: "Background Primary", value: "#0F172A", description: "Main canvas" },
  {
    name: "Background Secondary",
    value: "#1E293B",
    description: "Cards/sections",
  },
  {
    name: "Background Tertiary",
    value: "#334155",
    description: "Hover states",
  },
  { name: "Foreground Primary", value: "#F1F5F9", description: "Primary text" },
  {
    name: "Foreground Secondary",
    value: "#94A3B8",
    description: "Secondary text",
  },
  {
    name: "Foreground Tertiary",
    value: "#64748B",
    description: "Tertiary text",
  },
  { name: "Border", value: "#334155", description: "Borders" },
  { name: "Primary", value: "#3B82F6", description: "Trust/Action" },
  { name: "Success", value: "#22C55E", description: "Success states" },
  { name: "Error", value: "#F87171", description: "Error states" },
  { name: "Warning", value: "#FBBF24", description: "Warning states" },
];

const entityColors: ColorSwatch[] = [
  { name: "Person", value: "#6366F1", description: "Indigo" },
  { name: "Company", value: "#8B5CF6", description: "Purple" },
  { name: "Location", value: "#EC4899", description: "Pink" },
  { name: "Event", value: "#F59E0B", description: "Amber" },
  { name: "Document", value: "#10B981", description: "Green" },
];

const spacingScale = [
  { name: "xs", value: "0.25rem", pixels: "4px" },
  { name: "sm", value: "0.5rem", pixels: "8px" },
  { name: "md", value: "1rem", pixels: "16px" },
  { name: "lg", value: "1.5rem", pixels: "24px" },
  { name: "xl", value: "2rem", pixels: "32px" },
  { name: "2xl", value: "3rem", pixels: "48px" },
  { name: "3xl", value: "4rem", pixels: "64px" },
];

interface StyleGuideProps {
  onClose?: () => void;
}

const SECTIONS = [
  { id: "colors", label: "Colors", icon: Palette },
  { id: "typography", label: "Typography", icon: Type },
  { id: "spacing", label: "Spacing", icon: Layout },
  { id: "buttons", label: "Buttons", icon: MousePointerClick },
  { id: "inputs", label: "Inputs", icon: Edit },
  { id: "tables", label: "Tables", icon: TableIcon },
  { id: "cards", label: "Cards", icon: FileText },
  { id: "badges", label: "Badges", icon: Tag },
  { id: "tabs", label: "Tabs", icon: FileText },
  { id: "progress", label: "Progress", icon: Loader2 },
  { id: "skeleton", label: "Skeleton", icon: FileText },
  { id: "switch", label: "Switch", icon: Settings },
  { id: "tooltip", label: "Tooltip", icon: HelpCircle },
  { id: "collapsible", label: "Collapsible", icon: ChevronDown },
];

export function StyleGuide({ onClose }: StyleGuideProps) {
  const [isDark, setIsDark] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
    }
  };

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sections = SECTIONS.map((s) => s.id);
      const scrollPosition = window.scrollY + 200; // Offset for header

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i]);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-background min-h-screen">
      <div className="flex">
        {/* Sidebar Navigation */}
        <div className="w-64 border-r bg-muted/30 p-4 sticky top-0 h-screen overflow-y-auto">
          <div className="space-y-2">
            <div className="mb-4">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                Navigation
              </h2>
            </div>
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeSection === section.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 px-6 pb-6">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between pt-6">
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Neotoma Design System</h1>
                <p className="text-muted-foreground mt-2">
                  Interactive preview of all design system components and styles
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={toggleTheme}>
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                {onClose && (
                  <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

        {/* Colors Section */}
        <section id="colors">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Colors</h2>
          </div>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Base Colors ({isDark ? "Dark" : "Light"} Mode)</CardTitle>
                <CardDescription>
                  Primary color palette for backgrounds, foregrounds, and borders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(isDark ? darkColors : lightColors).map((color) => (
                    <div key={color.name} className="space-y-2">
                      <div
                        className="h-20 rounded-md border border-border shadow-sm"
                        style={{ backgroundColor: color.value }}
                      />
                      <div>
                        <div className="font-medium text-sm">{color.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{color.value}</div>
                        {color.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {color.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Entity Type Colors</CardTitle>
                <CardDescription>
                  Colors for entity badges, timeline markers, and graph nodes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {entityColors.map((color) => (
                    <div key={color.name} className="space-y-2">
                      <div
                        className="h-20 rounded-md border border-border shadow-sm"
                        style={{ backgroundColor: color.value }}
                      />
                      <div>
                        <div className="font-medium text-sm">{color.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{color.value}</div>
                        {color.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {color.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Typography Section */}
        <section id="typography">
          <div className="flex items-center gap-2 mb-4">
            <Type className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Typography</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Type Scale</CardTitle>
              <CardDescription>
                Font sizes, weights, and line heights.
                <span className="block mt-1 font-mono text-xs">
                  Font families: Inter (UI), JetBrains Mono (data/code)
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  H1 - 1.5rem (24px), 700 weight, -0.02em letter-spacing
                </div>
                <h1>Heading 1 - Bold, 700 weight</h1>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  H2 - 1.25rem (20px), 600 weight, -0.01em letter-spacing
                </div>
                <h2>Heading 2 - Semibold, 600 weight</h2>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  H3 - 1rem (16px), 600 weight
                </div>
                <h3>Heading 3 - Semibold, 600 weight</h3>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  H4 - 0.875rem (14px), 600 weight
                </div>
                <h4>Heading 4 - Semibold, 600 weight</h4>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  Body - 0.8125rem (13px), 400 weight, 1.6 line-height
                </div>
                <p>
                  Body text - Regular, 400 weight. This is the default text size for UI elements. It
                  provides comfortable reading while maintaining information density.
                </p>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  Body Large - 0.875rem (14px), 400 weight, 1.6 line-height
                </div>
                <p className="text-sm">
                  Body large text - Regular, 400 weight. Used for slightly more prominent content.
                </p>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  Small - 0.625rem (10px), 400 weight, 1.5 line-height
                </div>
                <p className="text-[0.625rem]">
                  Small text - Regular, 400 weight. Used for metadata, timestamps, labels, and
                  secondary information.
                </p>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-mono">
                  Monospace - 0.8125rem (13px), 400 weight, 1.5 line-height
                </div>
                <p className="font-mono text-[0.8125rem]">
                  Monospace text - Used for source IDs, entity IDs, observation IDs, timestamps,
                  code snippets, and extracted field values. Example: src_a1b2c3d4e5f6
                </p>
              </div>
            </CardContent>
          </Card>

        </section>

        <Separator />

        {/* Spacing Section */}
        <section id="spacing">
          <div className="flex items-center gap-2 mb-4">
            <Layout className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Spacing</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Spacing Scale</CardTitle>
              <CardDescription>
                Consistent spacing values for layouts and components
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {spacingScale.map((spacing) => (
                  <div key={spacing.name} className="flex items-center gap-4">
                    <div className="w-20 text-sm font-medium">{spacing.name}</div>
                    <div className="flex-1">
                      <div className="bg-primary/20 h-8 rounded" style={{ width: spacing.value }} />
                    </div>
                    <div className="w-24 text-xs text-muted-foreground font-mono text-right">
                      {spacing.value}
                    </div>
                    <div className="w-16 text-xs text-muted-foreground text-right">
                      {spacing.pixels}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Buttons Section */}
        <section id="buttons">
          <div className="flex items-center gap-2 mb-4">
            <MousePointerClick className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Buttons</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Button Variants</CardTitle>
              <CardDescription>All button styles and states</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="text-sm font-medium mb-3">Primary</div>
                <div className="flex flex-wrap gap-3">
                  <Button>Primary Button</Button>
                  <Button disabled>Disabled</Button>
                  <Button size="sm">Small</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon">
                    <FileText className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-3">Secondary</div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary">Secondary Button</Button>
                  <Button variant="secondary" disabled>
                    Disabled
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-3">Outline</div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline">Outline Button</Button>
                  <Button variant="outline" disabled>
                    Disabled
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-3">Ghost</div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="ghost">Ghost Button</Button>
                  <Button variant="ghost" disabled>
                    Disabled
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-3">Destructive</div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="destructive">Delete</Button>
                  <Button variant="destructive" disabled>
                    Disabled
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Inputs Section */}
        <section id="inputs">
          <div className="flex items-center gap-2 mb-4">
            <Edit className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Inputs</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Form Inputs</CardTitle>
              <CardDescription>Text inputs, labels, and states</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="input-default">Default Input</Label>
                <Input id="input-default" placeholder="Enter text..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="input-disabled">Disabled Input</Label>
                <Input id="input-disabled" placeholder="Disabled" disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="input-error">Error Input</Label>
                <Input id="input-error" placeholder="Error state" className="border-destructive" />
                <p className="text-xs text-destructive">This field has an error</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="input-monospace">Monospace Input (for IDs)</Label>
                <Input
                  id="input-monospace"
                  placeholder="ent_a1b2c3d4e5f6"
                  className="font-mono text-mono"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Tables Section */}
        <section id="tables">
          <div className="flex items-center gap-2 mb-4">
            <TableIcon className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Tables</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Table Component</CardTitle>
              <CardDescription>
                High-density table layout for source lists, entity lists, and observation lists.
                Includes sorting, filtering, search, column management, and row interactions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Table Controls */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Input placeholder="Search sources..." className="w-full" />
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="invoice">invoice</SelectItem>
                    <SelectItem value="document">document</SelectItem>
                    <SelectItem value="travel">travel</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked>ID</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked>Type</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked>Summary</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked>Created</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem>Status</DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Table with Sortable Headers */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <input type="checkbox" className="rounded border-input" />
                    </TableHead>
                    <TableHead className="w-[100px]">
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        ID
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        TYPE
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        SUMMARY
                        <ArrowUp className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        CREATED
                        <ArrowDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-[80px]">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <input type="checkbox" className="rounded border-input" />
                    </TableCell>
                    <TableCell className="font-mono text-xs">src_abc123</TableCell>
                    <TableCell>
                      <Badge variant="secondary">invoice</Badge>
                    </TableCell>
                    <TableCell>Invoice #INV-2024-001</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      2024-01-15
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <input type="checkbox" className="rounded border-input" />
                    </TableCell>
                    <TableCell className="font-mono text-xs">src_def456</TableCell>
                    <TableCell>
                      <Badge variant="secondary">IdentityDocument</Badge>
                    </TableCell>
                    <TableCell>Passport - John Doe</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      2024-01-14
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <input type="checkbox" className="rounded border-input" />
                    </TableCell>
                    <TableCell className="font-mono text-xs">src_ghi789</TableCell>
                    <TableCell>
                      <Badge variant="secondary">travel</Badge>
                    </TableCell>
                    <TableCell>Flight LAX → JFK</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      2024-01-13
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Table Features Description */}
              <div className="text-sm text-muted-foreground space-y-2 pt-2 border-t">
                <p>
                  <strong>Table Functionality:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    <strong>Sorting:</strong> Click column headers to sort (ascending/descending).
                    Sort indicators show current state.
                  </li>
                  <li>
                    <strong>Search:</strong> Global search input filters sources or entities across
                    all visible columns.
                  </li>
                  <li>
                    <strong>Type Filter:</strong> Dropdown to filter by entity type.
                  </li>
                  <li>
                    <strong>Column Management:</strong> Show/hide columns, reorder via
                    drag-and-drop, resize column widths.
                  </li>
                  <li>
                    <strong>Row Selection:</strong> Checkbox column for bulk actions.
                  </li>
                  <li>
                    <strong>Row Actions:</strong> Dropdown menu per row (view, delete, etc.).
                  </li>
                  <li>
                    <strong>Keyboard Navigation:</strong> Arrow keys, Enter to select, Space to
                    toggle selection.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Cards Section */}
        <section id="cards">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Cards</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Card Title</CardTitle>
                <CardDescription>Card description text</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  Card content goes here. This is a standard card component.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Card with Footer</CardTitle>
                <CardDescription>Example card with footer section</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">Card content with additional information.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Badges Section */}
        <section id="badges">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Badges</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Badge Variants</CardTitle>
              <CardDescription>Tags and labels for entity types and status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-3">Default Variants</div>
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-3">Entity Type Badges</div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                    Person
                  </Badge>
                  <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                    Company
                  </Badge>
                  <Badge className="bg-pink-500/10 text-pink-500 border-pink-500/20">
                    Location
                  </Badge>
                  <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                    Event
                  </Badge>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                    Document
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* States Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">States</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Empty State */}
            <Card>
              <CardHeader>
                <CardTitle>Empty State</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium mb-2">No sources yet</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Upload your first document to create sources
                </p>
                <Button size="sm">Upload Document</Button>
              </CardContent>
            </Card>

            {/* Loading State */}
            <Card>
              <CardHeader>
                <CardTitle>Loading State</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
                <p className="text-sm font-medium mb-2">Loading sources</p>
                <p className="text-xs text-muted-foreground">
                  Please wait while we fetch your data
                </p>
              </CardContent>
            </Card>

            {/* Error State */}
            <Card>
              <CardHeader>
                <CardTitle>Error State</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
                <p className="text-sm font-medium mb-2">Failed to load sources</p>
                <p className="text-xs text-muted-foreground mb-4">
                  An error occurred while fetching data
                </p>
                <Button variant="outline" size="sm">
                  Retry
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Data Visualization Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layout className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Data Visualization</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Timeline Example */}
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>Chronological event list</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-background" />
                      <div className="w-0.5 h-full bg-border mt-2" />
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="text-xs font-mono text-muted-foreground mb-1">2024-01-15</div>
                      <div className="text-sm font-medium">Invoice Issued</div>
                      <div className="text-xs text-muted-foreground">Invoice #INV-2024-001</div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-indigo-500 border-2 border-background" />
                      <div className="w-0.5 h-full bg-border mt-2" />
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="text-xs font-mono text-muted-foreground mb-1">2024-01-14</div>
                      <div className="text-sm font-medium">Flight Departure</div>
                      <div className="text-xs text-muted-foreground">LAX → JFK</div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-mono text-muted-foreground mb-1">2024-01-13</div>
                      <div className="text-sm font-medium">Document Uploaded</div>
                      <div className="text-xs text-muted-foreground">Passport - John Doe</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Entity Graph Example */}
            <Card>
              <CardHeader>
                <CardTitle>Entity Graph</CardTitle>
                <CardDescription>Entity relationships visualization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-medium">
                      JD
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">John Doe</div>
                      <div className="text-xs text-muted-foreground">Person</div>
                    </div>
                  </div>
                  <div className="ml-4 pl-4 border-l-2 border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-medium">
                        AC
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Acme Corp</div>
                        <div className="text-xs text-muted-foreground">Company</div>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 pl-4 border-l-2 border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-medium">
                        NY
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">New York</div>
                        <div className="text-xs text-muted-foreground">Location</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Onboarding Components Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Onboarding Components</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Welcome Screen */}
            <Card>
              <CardHeader>
                <CardTitle>Welcome Screen</CardTitle>
                <CardDescription>First-time user onboarding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold mb-2">Neotoma</h1>
                  <p className="text-muted-foreground mb-4">Your structured AI memory</p>
                </div>
                <p className="text-sm mb-4">Transform fragmented documents into AI-ready truth.</p>
                <Button className="w-full" size="lg">
                  Upload Your First Document
                </Button>
                <Button variant="ghost" size="sm" className="w-full">
                  I've used Neotoma before
                </Button>
              </CardContent>
            </Card>

            {/* Processing Indicator */}
            <Card>
              <CardHeader>
                <CardTitle>Processing Indicator</CardTitle>
                <CardDescription>Step-by-step progress</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center text-white text-xs">
                      ✓
                    </div>
                    <span className="text-sm">Extracting text</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center text-white text-xs">
                      ✓
                    </div>
                    <span className="text-sm">Detecting document type</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <span className="text-sm">Extracting fields...</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Identifying entities...</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Building timeline...</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">Step 3 of 5</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* File Upload Components Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Upload className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">File Upload Components</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Upload Zone States */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Zone States</CardTitle>
                <CardDescription>Drag-and-drop file upload</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <p className="text-sm mb-2">Drag and drop a file or click to browse</p>
                  <p className="text-xs text-muted-foreground">
                    Supported: PDF, JPG, PNG (max 50MB)
                  </p>
                </div>
                <div className="border-2 border-primary bg-primary/10 rounded-lg p-8 text-center">
                  <p className="text-sm font-medium text-primary">Drop to upload</p>
                </div>
              </CardContent>
            </Card>

            {/* Upload Queue */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Queue</CardTitle>
                <CardDescription>Bulk upload with progress tracking</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>invoice-001.pdf</span>
                    <Badge variant="outline" className="bg-success/10 text-success">
                      Complete
                    </Badge>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1">
                    <div className="bg-success h-1 rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>receipt-002.pdf</span>
                    <span className="text-xs text-muted-foreground">45%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1">
                    <div className="bg-primary h-1 rounded-full" style={{ width: "45%" }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>contract-003.pdf</span>
                    <Badge variant="destructive">Error</Badge>
                  </div>
                  <Button variant="outline" size="sm">
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Dashboard Components Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layout className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Dashboard Components</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dashboard Widgets</CardTitle>
              <CardDescription>Stats and quick actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-3xl font-bold mb-1">1,234</div>
                    <div className="text-sm text-muted-foreground">Total Sources</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-3xl font-bold mb-1">567</div>
                    <div className="text-sm text-muted-foreground">Entities</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-3xl font-bold mb-1">890</div>
                    <div className="text-sm text-muted-foreground">Events</div>
                  </CardContent>
                </Card>
              </div>
              <div className="flex gap-2">
                <Button>Upload Document</Button>
                <Button variant="outline">View Timeline</Button>
                <Button variant="outline">Search</Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Authentication Components Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Edit className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Authentication Components</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sign In Form */}
            <Card>
              <CardHeader>
                <CardTitle>Sign In Form</CardTitle>
                <CardDescription>User authentication</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signin">Email</Label>
                  <Input id="email-signin" type="email" placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signin">Password</Label>
                  <Input id="password-signin" type="password" />
                </div>
                <Button className="w-full">Sign In</Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>
                <Button variant="outline" className="w-full">
                  Continue with Google
                </Button>
                <Button variant="outline" className="w-full">
                  Continue with GitHub
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Don't have an account?{" "}
                  <Button variant="link" className="p-0 h-auto">
                    Sign up
                  </Button>
                </p>
              </CardContent>
            </Card>

            {/* Password Reset */}
            <Card>
              <CardHeader>
                <CardTitle>Password Reset</CardTitle>
                <CardDescription>Password recovery flow</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email-reset">Email</Label>
                  <Input id="email-reset" type="email" placeholder="you@example.com" />
                </div>
                <Button className="w-full">Send Reset Link</Button>
                <Button variant="ghost" className="w-full" size="sm">
                  Back to sign in
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Billing Components Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Billing Components</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Plan Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Plan Selection</CardTitle>
                <CardDescription>Subscription plans</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Card className="border-primary">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Individual</CardTitle>
                      <Badge>Current Plan</Badge>
                    </div>
                    <div className="text-2xl font-bold">
                      €50<span className="text-sm font-normal">/month</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-2 mb-4">
                      <li>• Unlimited records</li>
                      <li>• All extraction types</li>
                      <li>• AI queries</li>
                    </ul>
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Team</CardTitle>
                    <div className="text-2xl font-bold">
                      €500<span className="text-sm font-normal">/month</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-2 mb-4">
                      <li>• Everything in Individual</li>
                      <li>• 2-20 team members</li>
                      <li>• Shared workspace</li>
                    </ul>
                    <Button className="w-full">Upgrade to Team</Button>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            {/* Invoice History */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice History</CardTitle>
                <CardDescription>Past invoices and payments</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-sm">2024-01-15</TableCell>
                      <TableCell className="text-sm">€50.00</TableCell>
                      <TableCell>
                        <Badge className="bg-success/10 text-success">Paid</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-sm">2023-12-15</TableCell>
                      <TableCell className="text-sm">€50.00</TableCell>
                      <TableCell>
                        <Badge className="bg-success/10 text-success">Paid</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Settings Components Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Settings Components</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Settings Form</CardTitle>
              <CardDescription>User preferences and integrations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Locale</Label>
                <Select defaultValue="en-us">
                  <SelectTrigger>
                    <SelectValue placeholder="Select locale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-us">English (US)</SelectItem>
                    <SelectItem value="es-es">Spanish (ES)</SelectItem>
                    <SelectItem value="fr-fr">French (FR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Theme</Label>
                  <p className="text-xs text-muted-foreground">Light or dark mode</p>
                </div>
                <Button variant="outline" size="icon" onClick={toggleTheme}>
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Advanced Search Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Advanced Search</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Search with Filters</CardTitle>
              <CardDescription>Multi-dimensional search interface</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search Query</Label>
                <Input placeholder="Search sources and entities..." />
                <p className="text-xs text-muted-foreground">Press "/" to focus search</p>
              </div>
              <div className="flex gap-2">
                <Button variant={isDark ? "secondary" : "outline"} size="sm">
                  Keyword
                </Button>
                <Button variant="outline" size="sm">
                  Semantic
                </Button>
                <Button variant="outline" size="sm">
                  Both
                </Button>
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Filters</Label>
                <div className="space-y-2">
                  <Label className="text-xs">Type</Label>
                  <Select defaultValue="all">
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="invoice">invoice</SelectItem>
                      <SelectItem value="document">document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Date Range</Label>
                  <div className="flex gap-2">
                    <Input type="date" className="flex-1" />
                    <Input type="date" className="flex-1" />
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Visual Hierarchy Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layout className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Visual Hierarchy</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Information Density</CardTitle>
              <CardDescription>
                High information density without clutter - clear visual grouping, consistent
                alignment, typography hierarchy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Content Structure Examples</h3>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-semibold mb-2">Source/Entity List Structure</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Table layout with sortable columns, row hover states, clear headers
                      (SourceTable, EntityList)
                    </p>
                    <div className="text-xs font-mono text-muted-foreground">
                      • High density table
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      • Sortable columns
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      • Row hover feedback
                    </div>
                  </div>
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-semibold mb-2">Source/Entity Detail Structure</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Card-based sections with tabs, clear headers, monospace metadata
                      (SourceDetail, EntityDetail)
                    </p>
                    <div className="text-xs font-mono text-muted-foreground">
                      • Card sections with tabs
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      • H3 section headers
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      • Monospace for IDs
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Alignment Principles</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium mb-2">Text Alignment</div>
                    <div className="text-left">Left-align text content</div>
                    <div className="text-right">Right-align numbers</div>
                  </div>
                  <div>
                    <div className="font-medium mb-2">Visual Grouping</div>
                    <div className="border rounded p-2 mb-2">Borders for grouping</div>
                    <div className="bg-muted/50 rounded p-2">Backgrounds for sections</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Dark Mode Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Moon className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Dark Mode</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dark Mode Strategy</CardTitle>
              <CardDescription>
                System preference detection with manual override. Brighter colors for readability,
                softer backgrounds.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Current Theme</Label>
                  <div className="p-4 border rounded-lg bg-background">
                    <p className="text-sm font-medium mb-2">Theme: {isDark ? "Dark" : "Light"}</p>
                    <p className="text-xs text-muted-foreground">
                      {isDark
                        ? "Brighter foregrounds, softer backgrounds, adjusted borders"
                        : "High contrast, neutral grays, professional appearance"}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Color Adjustments</Label>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Foreground:</span>
                      <span className="font-mono text-xs">
                        {isDark ? "Brighter" : "High contrast"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Background:</span>
                      <span className="font-mono text-xs">
                        {isDark ? "Soft slate" : "Pure white"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Borders:</span>
                      <span className="font-mono text-xs">
                        {isDark ? "Adjusted visibility" : "Subtle gray"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Rationale:</strong> Tier 1 ICPs (especially developers, AI-native users)
                  strongly prefer dark mode. All components maintain WCAG AA contrast ratios in both
                  themes.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Motion and Animation Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Motion and Animation</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Animation Principles</CardTitle>
              <CardDescription>
                Minimal, fast, functional - no decorative animations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Transition Timing</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="border rounded-lg p-4">
                    <div className="font-medium mb-2">Fast (150ms)</div>
                    <div className="text-xs text-muted-foreground">
                      Hover states, button feedback
                    </div>
                    <Button className="mt-3 w-full">Hover me</Button>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="font-medium mb-2">Normal (200ms)</div>
                    <div className="text-xs text-muted-foreground">Color changes, opacity</div>
                    <Input className="mt-3" placeholder="Focus me" />
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="font-medium mb-2">Slow (300ms)</div>
                    <div className="text-xs text-muted-foreground">
                      Layout changes, page transitions
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Modal/dialog enter/exit
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Allowed Animations</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <Badge variant="outline">Button hover/active</Badge>
                  <Badge variant="outline">Input focus</Badge>
                  <Badge variant="outline">Modal enter/exit</Badge>
                  <Badge variant="outline">Loading states</Badge>
                  <Badge variant="outline">Toast notifications</Badge>
                  <Badge variant="outline">Skeleton screens</Badge>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Forbidden:</strong> Decorative animations, playful transitions, excessive
                  motion, auto-playing animations
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Accessibility Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MousePointerClick className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Accessibility</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Accessibility Standards</CardTitle>
              <CardDescription>
                WCAG AA compliance, keyboard navigation, focus indicators
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Focus Indicators</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Focus Style</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      2px solid primary color, 2px offset, matches element border radius
                    </p>
                    <div className="flex gap-4">
                      <Button className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        Focus me (Tab)
                      </Button>
                      <Input
                        placeholder="Focus me (Tab)"
                        className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Contrast Requirements</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="border rounded-lg p-4">
                    <div className="font-medium mb-2">WCAG AA Minimum</div>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• Normal text: 4.5:1 contrast</li>
                      <li>• Large text (18px+): 3:1 contrast</li>
                      <li>• UI components: 3:1 contrast</li>
                    </ul>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="font-medium mb-2">WCAG AAA Target</div>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• Normal text: 7:1 contrast</li>
                      <li>• Large text: 4.5:1 contrast</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Keyboard Navigation</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-muted border rounded text-xs">Tab</kbd>
                    <span className="text-muted-foreground">Navigate between elements</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-muted border rounded text-xs">Enter</kbd>
                    <span className="text-muted-foreground">Activate buttons, select items</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-muted border rounded text-xs">Space</kbd>
                    <span className="text-muted-foreground">Toggle checkboxes, scroll</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-muted border rounded text-xs">Arrow Keys</kbd>
                    <span className="text-muted-foreground">Navigate tables, lists</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-muted border rounded text-xs">Esc</kbd>
                    <span className="text-muted-foreground">Close modals, menus</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Iconography Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Iconography</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Icon Style and Usage</CardTitle>
              <CardDescription>
                Lucide Icons - minimal, line-based, consistent stroke width
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Icon Sizes</h3>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">16px</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-5 w-5" />
                    <span className="text-xs text-muted-foreground">20px</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-6 w-6" />
                    <span className="text-xs text-muted-foreground">24px</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Icon Usage Examples</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon">
                      <Search className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">Icon-only button (with ARIA label)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                    <span className="text-sm">Icon + text button</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      <Tag className="h-3 w-3 mr-1" />
                      Tagged
                    </Badge>
                    <span className="text-sm">Icon in badge</span>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Guidelines:</strong> Use icons sparingly, match icon color to text
                  hierarchy, provide ARIA labels for icon-only buttons, consistent stroke width
                  (1.5-2px)
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Responsive Design Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layout className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Responsive Design</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Breakpoints and Mobile Considerations</CardTitle>
              <CardDescription>Desktop-first approach with mobile adaptations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Breakpoints</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="border rounded-lg p-3">
                    <div className="font-medium mb-1">Mobile</div>
                    <div className="text-xs font-mono text-muted-foreground">640px</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="font-medium mb-1">Tablet</div>
                    <div className="text-xs font-mono text-muted-foreground">768px</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="font-medium mb-1">Desktop</div>
                    <div className="text-xs font-mono text-muted-foreground">1024px</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="font-medium mb-1">Wide</div>
                    <div className="text-xs font-mono text-muted-foreground">1280px</div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Mobile Adaptations</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                    <span>Stack columns on mobile</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                    <span>Full-width tables (horizontal scroll if needed)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                    <span>Touch-friendly targets (44px minimum)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                    <span>Simplified navigation</span>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Priority:</strong> Desktop-first (Tier 1 ICPs primarily use desktop)
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Tabs Section */}
        <section id="tabs">
          <div className="flex items-center gap-2 mb-4">
            <Layout className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Tabs</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tabbed Content</CardTitle>
              <CardDescription>
                Organize content into sections. Used in EntityDetail and SourceDetail for
                multi-section views.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="snapshot" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
                  <TabsTrigger value="observations">Observations</TabsTrigger>
                  <TabsTrigger value="relationships">Relationships</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>
                <TabsContent value="snapshot" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Entity Snapshot</CardTitle>
                      <CardDescription>
                        Current truth computed from all observations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Entity Type:</span>
                          <Badge variant="secondary">company</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Canonical Name:</span>
                          <span className="font-medium">Acme Corp</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Observations:</span>
                          <span className="font-mono text-xs">12</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="observations" className="mt-4">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground text-center">
                        12 observations from 5 sources
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="relationships" className="mt-4">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground text-center">
                        3 relationships (PART_OF, REFERS_TO)
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="timeline" className="mt-4">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground text-center">8 timeline events</p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Usage:</strong> Tabs are actively used in EntityDetail and SourceDetail
                  components to organize multi-section content. Muted background for tab list,
                  active tab uses primary background.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Progress Section */}
        <section id="progress">
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Progress</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Progress Indicators</CardTitle>
              <CardDescription>
                Visual feedback for upload progress, processing states, and loading operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-sm mb-3 block">File Upload Progress</Label>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>invoice-001.pdf</span>
                      <span className="text-xs text-muted-foreground">100%</span>
                    </div>
                    <Progress value={100} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>contract-002.pdf</span>
                      <span className="text-xs text-muted-foreground">65%</span>
                    </div>
                    <Progress value={65} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>receipt-003.pdf</span>
                      <span className="text-xs text-muted-foreground">30%</span>
                    </div>
                    <Progress value={30} />
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended for:</strong> FileUploadView upload queue, ingestion
                  processing states, bulk operations. Uses primary color for progress bar, smooth
                  transitions.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Skeleton Section */}
        <section id="skeleton">
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Skeleton Loading States</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Skeleton Placeholders</CardTitle>
              <CardDescription>
                Content placeholders for loading states. Better UX than spinners.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-sm mb-3 block">Table Loading State</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-[80px]" />
                  </div>
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-[80px]" />
                  </div>
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-[80px]" />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-sm mb-3 block">Card Loading State</Label>
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-[200px]" />
                    <Skeleton className="h-4 w-[300px]" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended for:</strong> SourceTable, EntityList, ObservationList loading
                  states; EntityDetail and SourceDetail content loading; Dashboard widget loading.
                  Reduces perceived load time.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Switch Section */}
        <section id="switch">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Switch</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Toggle Switches</CardTitle>
              <CardDescription>
                For boolean preferences, feature flags, and settings toggles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Dark Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Toggle between light and dark theme
                    </p>
                  </div>
                  <Switch defaultChecked={isDark} onCheckedChange={toggleTheme} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive email updates for new sources
                    </p>
                  </div>
                  <Switch />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-Enhancement</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically enhance entities with additional data
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended for:</strong> Settings view (theme, features, integrations),
                  integration enable/disable, user preferences. Better UX than checkboxes for on/off
                  states.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Tooltip Section */}
        <section id="tooltip">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Tooltips</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Hover Tooltips</CardTitle>
              <CardDescription>
                Helpful hints, icon button explanations, and contextual information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <TooltipProvider>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label>Icon Button with Tooltip:</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon">
                          <Info className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View additional information</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="entity-id">Entity ID</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground">
                            <HelpCircle className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            Deterministic hash-based ID (format: ent_abc123)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="entity-id"
                      placeholder="ent_abc123def456"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline">
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Upload a source file (PDF, image, or structured JSON)</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline">
                          <Search className="h-4 w-4 mr-2" />
                          Search
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Search entities, sources, and observations</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </TooltipProvider>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended for:</strong> Form field help text, icon-only buttons (ARIA
                  labels + tooltips), table column headers (sorting hints), settings option
                  descriptions. Subtle fade-in animation.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Collapsible Section */}
        <section id="collapsible">
          <div className="flex items-center gap-2 mb-4">
            <ChevronDown className="h-5 w-5" />
            <h2 className="text-2xl font-semibold">Collapsible</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Collapsible Sections</CardTitle>
              <CardDescription>
                Expandable sections for advanced options and detailed information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span>Advanced Options</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  <Card className="bg-muted/30">
                    <CardContent className="pt-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <Label>Enable debug logging</Label>
                          <Switch />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Show raw fragments</Label>
                          <Switch />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span>Provenance Details</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <Card className="bg-muted/30">
                    <CardContent className="pt-4">
                      <div className="space-y-2 text-xs font-mono">
                        <div>
                          <span className="text-muted-foreground">Source ID:</span> src_abc123def456
                        </div>
                        <div>
                          <span className="text-muted-foreground">Observation ID:</span>{" "}
                          obs_xyz789abc123
                        </div>
                        <div>
                          <span className="text-muted-foreground">Observed at:</span>{" "}
                          2025-01-15T10:30:00Z
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended for:</strong> SourceDetail advanced sections (raw text,
                  metadata), EntityDetail provenance and raw fragments, filter panels (show/hide
                  advanced filters), settings advanced options. Smooth expand/collapse animations.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

            {/* Footer */}
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>Neotoma Design System - Based on specifications from design_system.md</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
