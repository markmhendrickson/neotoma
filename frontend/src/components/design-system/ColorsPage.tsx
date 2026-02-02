import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { DesignSystemLayout } from "./DesignSystemLayout";

interface ColorSwatch {
  name: string;
  value: string;
  description?: string;
}

const lightColors: ColorSwatch[] = [
  { name: "Background Primary", value: "#FFFFFF", description: "Main canvas" },
  { name: "Background Secondary", value: "#F9FAFB", description: "Cards/sections" },
  { name: "Background Tertiary", value: "#F3F4F6", description: "Hover states" },
  { name: "Foreground Primary", value: "#111827", description: "Primary text" },
  { name: "Foreground Secondary", value: "#6B7280", description: "Secondary text" },
  { name: "Foreground Tertiary", value: "#9CA3AF", description: "Tertiary text" },
  { name: "Border", value: "#E5E7EB", description: "Borders" },
  { name: "Primary", value: "#0066CC", description: "Trust/Action" },
  { name: "Success", value: "#10B981", description: "Success states" },
  { name: "Error", value: "#EF4444", description: "Error states" },
  { name: "Warning", value: "#F59E0B", description: "Warning states" },
];

const darkColors: ColorSwatch[] = [
  { name: "Background Primary", value: "#0F172A", description: "Main canvas" },
  { name: "Background Secondary", value: "#1E293B", description: "Cards/sections" },
  { name: "Background Tertiary", value: "#334155", description: "Hover states" },
  { name: "Foreground Primary", value: "#F1F5F9", description: "Primary text" },
  { name: "Foreground Secondary", value: "#94A3B8", description: "Secondary text" },
  { name: "Foreground Tertiary", value: "#64748B", description: "Tertiary text" },
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

export function ColorsPage() {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <DesignSystemLayout currentSection="colors" title="Colors">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Base Colors ({isDark ? "Dark" : "Light"} Mode)</CardTitle>
                <CardDescription>
                  Primary color palette for backgrounds, foregrounds, and borders
                </CardDescription>
              </div>
              <Button variant="outline" size="icon" onClick={toggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
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
                      <div className="text-xs text-muted-foreground mt-1">{color.description}</div>
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
                      <div className="text-xs text-muted-foreground mt-1">{color.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DesignSystemLayout>
  );
}
