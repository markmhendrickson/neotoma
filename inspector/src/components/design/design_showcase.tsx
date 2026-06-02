import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleAlert, MoreHorizontal, Palette } from "lucide-react";
import {
  DesignRow,
  DesignSection,
  DesignSubsection,
  DesignSwatch,
  DesignSwatchGrid,
} from "@/components/design/design_section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OffsetPagination } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ObservationTimeline } from "@/components/shared/observation_timeline";
import { WorldTimeEventTimeline } from "@/components/shared/world_time_event_timeline";
import { QueryErrorAlert, DataTableSkeleton, ListSkeleton } from "@/components/shared/query_status";
import type { Observation, TimelineEvent } from "@/types/api";

const LAYOUT_TOGGLE_GROUP_CLASS =
  "gap-0 [&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md [&>button+button]:border-l-0";

const SAMPLE_OBSERVATIONS: Observation[] = [
  {
    id: "obs_demo_1",
    entity_id: "ent_demo",
    entity_type: "task",
    observed_at: "2026-05-20T14:00:00.000Z",
    source: "MCP store",
    fields: { title: "Review design tokens", status: "open" },
  },
  {
    id: "obs_demo_2",
    entity_id: "ent_demo",
    entity_type: "task",
    observed_at: "2026-05-19T09:30:00.000Z",
    source: "Human correct",
    fields: { status: "in_progress" },
  },
];

const SAMPLE_WORLD_EVENTS: TimelineEvent[] = [
  {
    id: "tev_demo_1",
    entity_id: "ent_demo",
    event_type: "signed",
    event_timestamp: "2026-04-01T00:00:00.000Z",
    source_field: "signed_date",
  },
  {
    id: "tev_demo_2",
    entity_id: "ent_demo",
    event_type: "due",
    event_timestamp: "2026-06-15T00:00:00.000Z",
    source_field: "due_date",
  },
];

type DemoRow = { id: string; name: string; status: string };

const DEMO_COLUMNS: ColumnDef<DemoRow, unknown>[] = [
  { header: "ID", accessorKey: "id" },
  { header: "Name", accessorKey: "name" },
  {
    header: "Status",
    accessorKey: "status",
    cell: ({ getValue }) => <Badge variant="secondary">{String(getValue())}</Badge>,
  },
];

const DEMO_ROWS: DemoRow[] = [
  { id: "ent_001", name: "Acme Corp", status: "active" },
  { id: "ent_002", name: "Design review", status: "open" },
];

export {
  DesignChromeReferencePanel,
  DesignCodeReferencePanel,
  DesignNoticesReferencePanel,
  DesignProseReferencePanel,
  DesignTablesReferencePanel,
} from "@/components/design/design_site_reference";

export function DesignOverviewPanel() {
  return (
    <div className="space-y-4">
      <DesignSection
        title="Inspector design system"
        description="Live reference for shadcn/ui primitives, CSS tokens, and inspection-surface patterns. Canonical docs live in the Neotoma repo under docs/ui/."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">docs/ui/inspector_shadcn_rules.mdc</code>{" "}
            — control selection and MUST/MUST NOT rules
          </li>
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">docs/ui/shadcn_components.md</code> — component
            inventory
          </li>
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">docs/ui/design_system/color_palette.md</code> — token
            registry (Inspector mirrors frontend)
          </li>
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">inspector/src/index.css</code> — deployed CSS
            variables and doc pattern utilities
          </li>
        </ul>
      </DesignSection>

      <DesignSection
        title="Implementation stack"
        description="Tokens → shadcn primitives → composites → route patterns. Doc/marketing specimens (Code–Chrome tabs) share the same semantic tokens as product UI — not a separate palette."
      >
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
          <div>
            <p className="mb-1 font-medium text-foreground">Layers</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>CSS variables (`--primary`, `--doc-*`, surfaces)</li>
              <li>shadcn/ui in <code className="text-xs">components/ui/</code></li>
              <li>Composites (DataTable, ConfirmDialog, …)</li>
              <li>Pages and marketing pattern classes</li>
            </ol>
          </div>
          <div>
            <p className="mb-1 font-medium text-foreground">Site pattern sources</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code className="text-xs">marketing_pattern_classes.ts</code> — snippet card shells
              </li>
              <li>
                <code className="text-xs">frontend/.../code_block_copy_button_classes.ts</code> — product parity
              </li>
              <li>
                Global utilities: <code className="text-xs">code-block-palette</code>,{" "}
                <code className="text-xs">toc-panel</code>, <code className="text-xs">doc-tip-panel</code>
              </li>
            </ul>
          </div>
        </div>
      </DesignSection>

      <DesignSection title="Standards (summary)" description="Prefer these patterns in Inspector feature work.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-medium">Use</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Button variants for actions; Link for navigation</li>
              <li>Select for single-value dropdowns</li>
              <li>DropdownMenu for menus and column visibility</li>
              <li>ToggleGroup for segmented filters</li>
              <li>Switch + Label for boolean settings</li>
              <li>Checkbox + Label for multi-select rows</li>
              <li>QueryErrorAlert / Alert for errors</li>
              <li>ConfirmDialog for destructive confirms (not window.confirm)</li>
              <li>DataTable + OffsetPagination for tabular data</li>
              <li>Design tokens (bg-background, text-muted-foreground, etc.)</li>
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium">Avoid</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Native &lt;select&gt;, &lt;button&gt; with custom chrome</li>
              <li>Hand-built pill spans instead of Badge</li>
              <li>Ad hoc hsl() / hex colors on product chrome</li>
              <li>Raw &lt;table&gt; layouts in pages</li>
              <li>window.confirm for destructive flows</li>
            </ul>
          </div>
        </div>
      </DesignSection>
    </div>
  );
}

export function DesignTokensPanel() {
  return (
    <div className="space-y-4">
      <DesignSection
        id="tokens-surfaces"
        title="Surfaces"
        description="Depth ladder: sidebar (inset) → body → card / popover (elevated)."
      >
        <DesignSwatchGrid>
          <DesignSwatch label="Background" token="bg-background" className="bg-background" />
          <DesignSwatch label="Foreground" token="text-foreground" className="bg-foreground" textClassName="text-background" />
          <DesignSwatch label="Card" token="bg-card" className="bg-card" />
          <DesignSwatch label="Popover" token="bg-popover" className="bg-popover" />
          <DesignSwatch label="Muted" token="bg-muted" className="bg-muted" />
          <DesignSwatch label="Inset" token="bg-inset" className="bg-inset" />
          <DesignSwatch label="Accent" token="bg-accent" className="bg-accent" />
        </DesignSwatchGrid>
      </DesignSection>

      <DesignSection id="tokens-action" title="Action and status">
        <DesignSwatchGrid>
          <DesignSwatch label="Primary" token="bg-primary" className="bg-primary" textClassName="text-primary-foreground" />
          <DesignSwatch
            label="Secondary"
            token="bg-secondary"
            className="bg-secondary"
            textClassName="text-secondary-foreground"
          />
          <DesignSwatch
            label="Destructive"
            token="bg-destructive"
            className="bg-destructive"
            textClassName="text-destructive-foreground"
          />
          <DesignSwatch label="Border" token="border-border" className="bg-border" />
          <DesignSwatch label="Input" token="bg-input" className="bg-input" />
          <DesignSwatch label="Skeleton" token="bg-skeleton" className="bg-skeleton" />
        </DesignSwatchGrid>
      </DesignSection>

      <DesignSection id="tokens-sidebar" title="Sidebar rail">
        <DesignSwatchGrid>
          <DesignSwatch label="Sidebar" token="bg-sidebar" className="bg-sidebar" textClassName="text-sidebar-foreground" />
          <DesignSwatch label="Sidebar accent" token="bg-sidebar-accent" className="bg-sidebar-accent" />
          <DesignSwatch label="Sidebar border" token="border-sidebar-border" className="bg-sidebar-border" />
        </DesignSwatchGrid>
      </DesignSection>

      <DesignSection id="tokens-radius" title="Radius">
        <DesignRow>
          <div className="flex h-16 w-24 items-center justify-center rounded-md border bg-card text-xs">rounded-md</div>
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border bg-card text-xs">rounded-lg</div>
        </DesignRow>
        <p className="text-xs text-muted-foreground">--radius: 0.5rem (see index.css)</p>
      </DesignSection>
    </div>
  );
}

export function DesignTypographyPanel() {
  return (
    <DesignSection title="Typography" description="Body: 0.875rem (14px) Inter. Mono: JetBrains Mono for code and IDs.">
      <div className="space-y-4">
        <p className="text-2xl font-semibold tracking-tight">Page title (text-2xl semibold)</p>
        <p className="text-lg font-semibold">Section title (text-lg semibold)</p>
        <p className="text-base font-medium">Subsection (text-base medium)</p>
        <p className="text-sm">Body default (text-sm) — primary reading size in Inspector.</p>
        <p className="text-sm text-muted-foreground">Muted secondary (text-sm text-muted-foreground)</p>
        <p className="text-xs text-muted-foreground">Caption / meta (text-xs text-muted-foreground)</p>
        <p className="font-mono text-sm">ent_a1b2c3d4e5f6 — entity ID (font-mono text-sm)</p>
      </div>
    </DesignSection>
  );
}

export function DesignPrimitivesPanel() {
  return (
    <div className="space-y-4">
      <DesignSection title="Button" description="Variants and sizes from @/components/ui/button">
        <DesignSubsection title="Variants">
          <DesignRow>
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </DesignRow>
        </DesignSubsection>
        <DesignSubsection title="Sizes">
          <DesignRow>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Icon">
              <Palette className="h-4 w-4" />
            </Button>
          </DesignRow>
        </DesignSubsection>
        <DesignSubsection title="Disabled">
          <DesignRow>
            <Button disabled>Disabled</Button>
            <Button variant="outline" disabled>
              Disabled outline
            </Button>
          </DesignRow>
        </DesignSubsection>
      </DesignSection>

      <DesignSection title="Badge">
        <DesignRow>
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </DesignRow>
      </DesignSection>

      <DesignSection title="Toggle group" description="Segmented single-select (Graph layout, Activity filters).">
        <ToggleGroup type="single" variant="outline" defaultValue="a" className={LAYOUT_TOGGLE_GROUP_CLASS}>
          <ToggleGroupItem value="a">Option A</ToggleGroupItem>
          <ToggleGroupItem value="b">Option B</ToggleGroupItem>
        </ToggleGroup>
      </DesignSection>

      <DesignSection title="Separator">
        <div className="space-y-2">
          <p className="text-sm">Above</p>
          <Separator />
          <p className="text-sm">Below</p>
        </div>
      </DesignSection>
    </div>
  );
}

export function DesignFormsPanel() {
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);

  return (
    <div className="space-y-4">
      <DesignSection title="Input and textarea">
        <div className="grid max-w-md gap-4">
          <div className="space-y-2">
            <Label htmlFor="design-input">Label</Label>
            <Input id="design-input" placeholder="Entity or source ID…" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="design-textarea">Textarea</Label>
            <Textarea id="design-textarea" placeholder="Multi-line text…" rows={3} />
          </div>
        </div>
      </DesignSection>

      <DesignSection title="Select">
        <Select defaultValue="task">
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="contact">Contact</SelectItem>
            <SelectItem value="event">Event</SelectItem>
          </SelectContent>
        </Select>
      </DesignSection>

      <DesignSection title="Checkbox and switch">
        <div className="flex flex-wrap gap-8">
          <div className="flex items-center gap-2">
            <Checkbox id="design-check" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            <Label htmlFor="design-check">Checkbox label</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="design-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
            <Label htmlFor="design-switch">Switch label</Label>
          </div>
        </div>
      </DesignSection>
    </div>
  );
}

export function DesignOverlaysPanel() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="space-y-4">
      <DesignSection title="Dialog and confirm">
        <DesignRow>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog title</DialogTitle>
                <DialogDescription>Modal content uses popover tokens and focus trap.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button">Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            trigger={<Button variant="destructive">Confirm dialog</Button>}
            title="Delete entity?"
            description="This creates a deletion observation; history is preserved."
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={() => undefined}
          />
        </DesignRow>
      </DesignSection>

      <DesignSection title="Sheet">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline">Open sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Sheet panel</SheetTitle>
              <SheetDescription>Slide-over for detail or markdown preview.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </DesignSection>

      <DesignSection title="Popover, dropdown, tooltip">
        <DesignRow>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Popover</Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 text-sm">Floating content anchored to trigger.</PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Menu">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>View entity</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked>Show deleted</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Help">
                  <CircleAlert className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip on icon control</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </DesignRow>
      </DesignSection>
    </div>
  );
}

export function DesignDataPanel() {
  const [pageOffset, setPageOffset] = useState(0);
  const columns = useMemo(() => DEMO_COLUMNS, []);

  return (
    <div className="space-y-4">
      <DesignSection title="Alert">
        <div className="space-y-3 max-w-xl">
          <Alert>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Default alert</AlertTitle>
            <AlertDescription>Informational message with icon offset.</AlertDescription>
          </Alert>
          <QueryErrorAlert title="Could not load data">Use QueryErrorAlert for query failures.</QueryErrorAlert>
        </div>
      </DesignSection>

      <DesignSection title="Card">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Grouped content on inspection surfaces.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">CardContent padding matches PageShell sections.</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">Footer action</Button>
          </CardFooter>
        </Card>
      </DesignSection>

      <DesignSection title="Tabs">
        <Tabs defaultValue="one" className="w-full max-w-md">
          <TabsList>
            <TabsTrigger value="one">Tab one</TabsTrigger>
            <TabsTrigger value="two">Tab two</TabsTrigger>
          </TabsList>
          <TabsContent value="one" className="text-sm text-muted-foreground">
            First panel
          </TabsContent>
          <TabsContent value="two" className="text-sm text-muted-foreground">
            Second panel
          </TabsContent>
        </Tabs>
      </DesignSection>

      <DesignSection title="Skeleton and loading">
        <DesignSubsection title="Inline skeleton">
          <Skeleton className="h-4 w-48" />
        </DesignSubsection>
        <DesignSubsection title="List skeleton">
          <ListSkeleton rows={3} />
        </DesignSubsection>
        <DesignSubsection title="Table skeleton">
          <DataTableSkeleton rows={4} cols={3} />
        </DesignSubsection>
      </DesignSection>

      <DesignSection title="DataTable and pagination">
        <DataTable columns={columns} data={DEMO_ROWS} />
        <OffsetPagination offset={pageOffset} limit={25} total={120} onPageChange={setPageOffset} />
      </DesignSection>

      <DesignSection title="Scroll area">
        <ScrollArea className="h-24 w-full max-w-md rounded-md border p-3">
          <p className="text-sm text-muted-foreground">
            Scrollable region for long JSON or nav lists. Line 1. Line 2. Line 3. Line 4. Line 5. Line 6. Line 7. Line
            8.
          </p>
        </ScrollArea>
      </DesignSection>
    </div>
  );
}

export function DesignPatternsPanel() {
  return (
    <div className="space-y-4">
      <DesignSection
        title="Timeline layers"
        description="Observation history (audit) vs world-time dates (source temporal fields). Do not merge these in UI copy or sort keys."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Observation history</p>
            <p className="text-xs text-muted-foreground">Sorted by observed_at. Muted timeline rail.</p>
            <ObservationTimeline observations={SAMPLE_OBSERVATIONS} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">World-time dates</p>
            <p className="text-xs text-muted-foreground">Sorted by event_timestamp. Amber rail.</p>
            <WorldTimeEventTimeline events={SAMPLE_WORLD_EVENTS} />
          </div>
        </div>
      </DesignSection>

      <DesignSection title="Graph Explorer toolbar" description="Reference pattern: primary Button, outline ToggleGroup, Switch + Label.">
        <DesignRow className="items-center gap-3">
          <Input placeholder="Entity or Source ID…" className="max-w-[220px]" />
          <Button>Explore</Button>
          <ToggleGroup type="single" variant="outline" defaultValue="tree" className={LAYOUT_TOGGLE_GROUP_CLASS}>
            <ToggleGroupItem value="tree">Tree</ToggleGroupItem>
            <ToggleGroupItem value="radial">Radial</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <Switch id="design-graph-rel" defaultChecked />
            <Label htmlFor="design-graph-rel">Relationships</Label>
          </div>
        </DesignRow>
      </DesignSection>
    </div>
  );
}
