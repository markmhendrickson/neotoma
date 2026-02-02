import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info, HelpCircle, Upload, Search } from "lucide-react";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function TooltipPage() {
  return (
    <DesignSystemLayout currentSection="tooltip" title="Tooltips">
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
    </DesignSystemLayout>
  );
}
