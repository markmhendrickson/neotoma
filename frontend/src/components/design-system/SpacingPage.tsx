import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignSystemLayout } from "./DesignSystemLayout";

const spacingScale = [
  { name: "xs", value: "0.25rem", pixels: "4px" },
  { name: "sm", value: "0.5rem", pixels: "8px" },
  { name: "md", value: "1rem", pixels: "16px" },
  { name: "lg", value: "1.5rem", pixels: "24px" },
  { name: "xl", value: "2rem", pixels: "32px" },
  { name: "2xl", value: "3rem", pixels: "48px" },
  { name: "3xl", value: "4rem", pixels: "64px" },
];

export function SpacingPage() {
  return (
    <DesignSystemLayout currentSection="spacing" title="Spacing">
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
    </DesignSystemLayout>
  );
}
