import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function SkeletonPage() {
  return (
    <DesignSystemLayout currentSection="skeleton" title="Skeleton Loading States">
      <Card>
        <CardHeader>
          <CardTitle>Skeleton Placeholders</CardTitle>
          <CardDescription>
            Content placeholders for loading states. Better UX than spinners.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-sm mb-3 block">Table Loading State</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-[80px]" />
              </div>
              <div className="flex items-center space-x-4">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-[80px]" />
              </div>
              <div className="flex items-center space-x-4">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-[80px]" />
              </div>
            </div>
          </div>
          <div>
            <Label className="text-sm mb-3 block">Card Loading State</Label>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-[200px]" />
                <Skeleton className="h-4 w-[300px]" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Recommended for:</strong> SourceTable, EntityList, ObservationList loading
              states; EntityDetail and SourceDetail content loading; Dashboard widget loading.
              Reduces perceived load time.
            </p>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
