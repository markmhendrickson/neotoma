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
  { name: "Background Primary", value: "#FCFCFF", description: "Main canvas" },
  { name: "Background Secondary", value: "#F4F2FF", description: "Cards/sections" },
  { name: "Background Tertiary", value: "#EDE9FE", description: "Hover states" },
  { name: "Foreground Primary", value: "#1F1A33", description: "Primary text" },
  { name: "Foreground Secondary", value: "#4C4566", description: "Secondary text" },
  { name: "Foreground Tertiary", value: "#7B7399", description: "Tertiary text" },
  { name: "Border", value: "#DDD6FE", description: "Borders" },
  { name: "Primary", value: "#7C3AED", description: "Brand violet" },
  { name: "Success", value: "#059669", description: "Success states" },
  { name: "Error", value: "#DC2626", description: "Error states" },
  { name: "Warning", value: "#D97706", description: "Warning states" },
];

const darkColors: ColorSwatch[] = [
  { name: "Background Primary", value: "#0F0B1A", description: "Main canvas" },
  { name: "Background Secondary", value: "#1A1230", description: "Cards/sections" },
  { name: "Background Tertiary", value: "#2A1E4A", description: "Hover states" },
  { name: "Foreground Primary", value: "#F4F1FF", description: "Primary text" },
  { name: "Foreground Secondary", value: "#C9BEF3", description: "Secondary text" },
  { name: "Foreground Tertiary", value: "#9E8FD3", description: "Tertiary text" },
  { name: "Border", value: "#3A2A63", description: "Borders" },
  { name: "Primary", value: "#A78BFA", description: "Brand violet (dark mode)" },
  { name: "Success", value: "#34D399", description: "Success states" },
  { name: "Error", value: "#F87171", description: "Error states" },
  { name: "Warning", value: "#FBBF24", description: "Warning states" },
];

const entityColors: ColorSwatch[] = [
  { name: "Person", value: "#6366F1", description: "Indigo" },
  { name: "Company", value: "#8B5CF6", description: "Violet" },
  { name: "Location", value: "#14B8A6", description: "Teal" },
  { name: "Event", value: "#F59E0B", description: "Amber" },
  { name: "Document", value: "#10B981", description: "Emerald" },
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
