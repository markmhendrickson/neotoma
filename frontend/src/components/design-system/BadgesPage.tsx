import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function BadgesPage() {
  return (
    <DesignSystemLayout currentSection="badges" title="Badges">
      <Card>
        <CardHeader>
          <CardTitle>Badge Variants</CardTitle>
          <CardDescription>Tags and labels for entity types and status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-3">Default Variants</div>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-3">Entity Type Badges</div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                Person
              </Badge>
              <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                Company
              </Badge>
              <Badge className="bg-pink-500/10 text-pink-500 border-pink-500/20">
                Location
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                Event
              </Badge>
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                Document
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
