import { useSearchParams } from "react-router-dom";
import { PageShell } from "@/components/layout/page_shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DesignChromeReferencePanel,
  DesignCodeReferencePanel,
  DesignDataPanel,
  DesignFormsPanel,
  DesignNoticesReferencePanel,
  DesignOverviewPanel,
  DesignOverlaysPanel,
  DesignPatternsPanel,
  DesignPrimitivesPanel,
  DesignProseReferencePanel,
  DesignTablesReferencePanel,
  DesignTokensPanel,
  DesignTypographyPanel,
} from "@/components/design/design_showcase";

const DESIGN_TABS = [
  { value: "overview", label: "Overview" },
  { value: "tokens", label: "Tokens" },
  { value: "typography", label: "Typography" },
  { value: "primitives", label: "Primitives" },
  { value: "forms", label: "Forms" },
  { value: "overlays", label: "Overlays" },
  { value: "data", label: "Data" },
  { value: "patterns", label: "Patterns" },
  { value: "code", label: "Code" },
  { value: "prose", label: "Prose" },
  { value: "tables", label: "Tables" },
  { value: "notices", label: "Notices" },
  { value: "chrome", label: "Chrome" },
] as const;

type DesignTab = (typeof DESIGN_TABS)[number]["value"];

function parseTab(value: string | null): DesignTab {
  if (DESIGN_TABS.some((t) => t.value === value)) {
    return value as DesignTab;
  }
  return "overview";
}

export default function DesignPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  return (
    <PageShell
      title="Design system"
      description="Neotoma app shadcn/ui primitives, semantic tokens, and app documentation patterns (source builds)"
    >
      <Tabs
        value={tab}
        onValueChange={(next) => setSearchParams({ tab: next }, { replace: true })}
        className="space-y-6"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {DESIGN_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <DesignOverviewPanel />
        </TabsContent>
        <TabsContent value="tokens" className="mt-0">
          <DesignTokensPanel />
        </TabsContent>
        <TabsContent value="typography" className="mt-0">
          <DesignTypographyPanel />
        </TabsContent>
        <TabsContent value="primitives" className="mt-0">
          <DesignPrimitivesPanel />
        </TabsContent>
        <TabsContent value="forms" className="mt-0">
          <DesignFormsPanel />
        </TabsContent>
        <TabsContent value="overlays" className="mt-0">
          <DesignOverlaysPanel />
        </TabsContent>
        <TabsContent value="data" className="mt-0">
          <DesignDataPanel />
        </TabsContent>
        <TabsContent value="patterns" className="mt-0">
          <DesignPatternsPanel />
        </TabsContent>
        <TabsContent value="code" className="mt-0">
          <DesignCodeReferencePanel />
        </TabsContent>
        <TabsContent value="prose" className="mt-0">
          <DesignProseReferencePanel />
        </TabsContent>
        <TabsContent value="tables" className="mt-0">
          <DesignTablesReferencePanel />
        </TabsContent>
        <TabsContent value="notices" className="mt-0">
          <DesignNoticesReferencePanel />
        </TabsContent>
        <TabsContent value="chrome" className="mt-0">
          <DesignChromeReferencePanel />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
