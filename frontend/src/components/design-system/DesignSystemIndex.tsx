import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Palette,
  Type,
  Layout,
  MousePointerClick,
  Edit,
  Table as TableIcon,
  FileText,
  Tag,
  Loader2,
  Settings,
  HelpCircle,
  ChevronDown,
  BookOpen,
  FileText as FileTextIcon,
} from "lucide-react";

const SECTIONS = [
  { id: "colors", label: "Colors", icon: Palette, description: "Base colors, semantic colors, and entity type colors" },
  { id: "typography", label: "Typography", icon: Type, description: "Font families, type scale, and text styles" },
  { id: "style-guide", label: "Style Guide", icon: BookOpen, description: "UI copy rules and writing guidelines" },
  { id: "page-formats", label: "Page formats", icon: FileTextIcon, description: "Page layout patterns and card usage guidelines" },
  { id: "spacing", label: "Spacing", icon: Layout, description: "Spacing scale and layout density" },
  { id: "buttons", label: "Buttons", icon: MousePointerClick, description: "Button variants and states" },
  { id: "inputs", label: "Inputs", icon: Edit, description: "Input fields and form controls" },
  { id: "tables", label: "Tables", icon: TableIcon, description: "Table components and functionality" },
  { id: "cards", label: "Cards", icon: FileText, description: "Card components and layouts" },
  { id: "badges", label: "Badges", icon: Tag, description: "Badge and tag components" },
  { id: "tabs", label: "Tabs", icon: FileText, description: "Tab navigation components" },
  { id: "progress", label: "Progress", icon: Loader2, description: "Progress indicators and loading states" },
  { id: "skeleton", label: "Skeleton", icon: FileText, description: "Skeleton loading placeholders" },
  { id: "switch", label: "Switch", icon: Settings, description: "Toggle switch components" },
  { id: "tooltip", label: "Tooltip", icon: HelpCircle, description: "Tooltip components" },
  { id: "collapsible", label: "Collapsible", icon: ChevronDown, description: "Collapsible sections" },
];

export function DesignSystemIndex() {
  return (
    <div className="bg-background min-h-screen px-6 pb-6">
      <div className="max-w-7xl mx-auto space-y-8 pt-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Neotoma Design System</h1>
          <p className="text-muted-foreground mt-2">
            Interactive preview of all design system components and styles
          </p>
        </div>

        {/* Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.id} to={`/design-system/${section.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <CardTitle>{section.label}</CardTitle>
                    </div>
                    <CardDescription>{section.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
