import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function SwitchPage() {
  return (
    <DesignSystemLayout currentSection="switch" title="Switch">
      <Card>
        <CardHeader>
          <CardTitle>Toggle Switches</CardTitle>
          <CardDescription>
            For boolean preferences, feature flags, and settings toggles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Toggle between light and dark theme
                </p>
              </div>
              <Switch />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Receive email updates for new sources
                </p>
              </div>
              <Switch />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Enhancement</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically enhance entities with additional data
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Recommended for:</strong> Settings view (theme, features, integrations),
              integration enable/disable, user preferences. Better UX than checkboxes for on/off
              states.
            </p>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
