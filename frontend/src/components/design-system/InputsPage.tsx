import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function InputsPage() {
  return (
    <DesignSystemLayout currentSection="inputs" title="Inputs">
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
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
