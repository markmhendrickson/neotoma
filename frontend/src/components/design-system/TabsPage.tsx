import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function TabsPage() {
  return (
    <DesignSystemLayout currentSection="tabs" title="Tabs">
      <Card>
        <CardHeader>
          <CardTitle>Tabbed Content</CardTitle>
          <CardDescription>
            Organize content into sections. Used in EntityDetail and SourceDetail for
            multi-section views.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="snapshot" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
              <TabsTrigger value="observations">Observations</TabsTrigger>
              <TabsTrigger value="relationships">Relationships</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="snapshot" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Entity Snapshot</CardTitle>
                  <CardDescription>
                    Current truth computed from all observations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entity Type:</span>
                      <Badge variant="secondary">company</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Canonical Name:</span>
                      <span className="font-medium">Acme Corp</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Observations:</span>
                      <span className="font-mono text-xs">12</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="observations" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">
                    12 observations from 5 sources
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="relationships" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">
                    3 relationships (PART_OF, REFERS_TO)
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">8 timeline events</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Usage:</strong> Tabs are actively used in EntityDetail and SourceDetail
              components to organize multi-section content. Muted background for tab list,
              active tab uses primary background.
            </p>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
