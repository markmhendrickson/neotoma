import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function ButtonsPage() {
  return (
    <DesignSystemLayout currentSection="buttons" title="Buttons">
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
    </DesignSystemLayout>
  );
}
