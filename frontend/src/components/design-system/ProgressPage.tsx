import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function ProgressPage() {
  return (
    <DesignSystemLayout currentSection="progress" title="Progress">
      <Card>
        <CardHeader>
          <CardTitle>Progress Indicators</CardTitle>
          <CardDescription>
            Visual feedback for upload progress, processing states, and loading operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-sm mb-3 block">File Upload Progress</Label>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>invoice-001.pdf</span>
                  <span className="text-xs text-muted-foreground">100%</span>
                </div>
                <Progress value={100} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>contract-002.pdf</span>
                  <span className="text-xs text-muted-foreground">65%</span>
                </div>
                <Progress value={65} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>receipt-003.pdf</span>
                  <span className="text-xs text-muted-foreground">30%</span>
                </div>
                <Progress value={30} />
              </div>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Recommended for:</strong> FileUploadView upload queue, ingestion
              processing states, bulk operations. Uses primary color for progress bar, smooth
              transitions.
            </p>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
