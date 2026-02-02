import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function TypographyPage() {
  return (
    <DesignSystemLayout currentSection="typography" title="Typography">
      <Card>
        <CardHeader>
          <CardTitle>Type Scale</CardTitle>
          <CardDescription>
            Font sizes, weights, and line heights.
            <span className="block mt-1 font-mono text-xs">
              Font families: Inter (UI), JetBrains Mono (data/code)
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              H1 - 2rem (32px), 700 weight, -0.02em letter-spacing
            </div>
            <h1>Heading 1 - Bold, 700 weight</h1>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              H2 - 1.5rem (24px), 600 weight, -0.01em letter-spacing
            </div>
            <h2>Heading 2 - Semibold, 600 weight</h2>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              H3 - 1.25rem (20px), 600 weight
            </div>
            <h3>Heading 3 - Semibold, 600 weight</h3>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              H4 - 1rem (16px), 600 weight
            </div>
            <h4>Heading 4 - Semibold, 600 weight</h4>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              Body - 0.9375rem (15px), 400 weight, 1.6 line-height
            </div>
            <p>
              Body text - Regular, 400 weight. This is the default text size for UI elements. It
              provides comfortable reading while maintaining information density.
            </p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              Body Large - 1rem (16px), 400 weight, 1.6 line-height
            </div>
            <p className="text-base">
              Body large text - Regular, 400 weight. Used for slightly more prominent content.
            </p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              Small - 0.8125rem (13px), 400 weight, 1.5 line-height
            </div>
            <p className="text-sm">
              Small text - Regular, 400 weight. Used for metadata, timestamps, labels, and
              secondary information.
            </p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              Monospace - 0.875rem (14px), 400 weight, 1.5 line-height
            </div>
            <p className="font-mono text-sm">
              Monospace text - Used for source IDs, entity IDs, observation IDs, timestamps,
              code snippets, and extracted field values. Example: src_a1b2c3d4e5f6
            </p>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
