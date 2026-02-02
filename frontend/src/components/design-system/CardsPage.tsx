import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function CardsPage() {
  return (
    <DesignSystemLayout currentSection="cards" title="Cards">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card description text</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Card content goes here. This is a standard card component.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Card with Footer</CardTitle>
            <CardDescription>Example card with footer section</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Card content with additional information.</p>
          </CardContent>
        </Card>
      </div>
    </DesignSystemLayout>
  );
}
