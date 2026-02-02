import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function CollapsiblePage() {
  return (
    <DesignSystemLayout currentSection="collapsible" title="Collapsible">
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
    </DesignSystemLayout>
  );
}
