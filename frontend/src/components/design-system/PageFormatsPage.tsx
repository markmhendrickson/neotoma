import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function PageFormatsPage() {
  return (
    <DesignSystemLayout currentSection="page-formats" title="Page formats">
      <div className="space-y-8">
        {/* Overview */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Overview</h2>
          <p className="text-muted-foreground mb-4">
            Page format guidelines ensure consistent layout patterns across all pages in the application. These patterns define when to use cards, when to use full-width sections, and how to structure content for optimal readability.
          </p>
        </div>

        {/* Full-Width Content Sections */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Full-width content sections</h2>
          <p className="text-muted-foreground mb-4">
            Content sections that span the full width of the page should not use cards. Cards add unnecessary visual boundaries and reduce content width.
          </p>
          
          <div className="space-y-4 mb-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">When to avoid cards</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Main page content that spans full width</li>
                <li>• Article or documentation content</li>
                <li>• Long-form text sections</li>
                <li>• Lists or tables that need maximum width</li>
                <li>• Content that flows naturally without visual separation</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Correct pattern</h3>
              <div className="bg-muted/30 p-4 rounded-md border">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Page title</h4>
                    <p className="text-sm text-muted-foreground">
                      Content flows naturally without card boundaries. Sections use spacing and typography for visual hierarchy.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Section heading</h4>
                    <p className="text-sm text-muted-foreground">
                      Additional content continues in the same flow. No card wrapper needed.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Incorrect pattern</h3>
              <div className="bg-muted/30 p-4 rounded-md border">
                <Card>
                  <CardHeader>
                    <CardTitle>Page title</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Content wrapped in a card unnecessarily reduces width and adds visual boundaries that break content flow.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* When to Use Cards */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">When to use cards</h2>
          <p className="text-muted-foreground mb-4">
            Cards are appropriate for discrete, self-contained content that benefits from visual separation.
          </p>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Appropriate card usage</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Grid layouts with multiple items (e.g., design system index)</li>
                <li>• Forms or input sections that need visual grouping</li>
                <li>• Settings panels or configuration sections</li>
                <li>• Discrete content blocks in multi-column layouts</li>
                <li>• Content that needs clear visual boundaries from surrounding content</li>
              </ul>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Card example</CardTitle>
                  <CardDescription>Appropriate for grid layouts</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Cards work well when you have multiple discrete items in a grid.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Another card</CardTitle>
                  <CardDescription>Self-contained content</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Each card represents a distinct piece of content.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Page Structure Patterns */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Page structure patterns</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Content page pattern</h3>
              <div className="bg-muted/30 p-4 rounded-md border">
                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2">Page title (h1)</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Introduction paragraph describing the page purpose.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Section heading (h2)</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Section content flows naturally. No card wrapper.
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• List items for related content</li>
                      <li>• Additional points as needed</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Another section (h2)</h4>
                    <p className="text-sm text-muted-foreground">
                      More content continues in the same flow.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Grid layout pattern</h3>
              <div className="bg-muted/30 p-4 rounded-md border">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Card item</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Cards are appropriate in grid layouts.
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Card item</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Each card is a discrete content block.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spacing and Layout */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Spacing and layout</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Container width</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Use <code className="rounded bg-muted px-1 py-0.5 text-xs">max-w-5xl</code> or <code className="rounded bg-muted px-1 py-0.5 text-xs">max-w-7xl</code> for content pages</li>
                <li>• Center content with <code className="rounded bg-muted px-1 py-0.5 text-xs">mx-auto</code></li>
                <li>• Add horizontal padding: <code className="rounded bg-muted px-1 py-0.5 text-xs">px-6</code> or <code className="rounded bg-muted px-1 py-0.5 text-xs">px-4</code></li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Section spacing</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Use <code className="rounded bg-muted px-1 py-0.5 text-xs">space-y-8</code> for major sections</li>
                <li>• Use <code className="rounded bg-muted px-1 py-0.5 text-xs">space-y-4</code> for subsections</li>
                <li>• Use <code className="rounded bg-muted px-1 py-0.5 text-xs">mb-4</code> or <code className="rounded bg-muted px-1 py-0.5 text-xs">mb-6</code> for heading spacing</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Examples */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Examples</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">About page (correct)</h3>
              <div className="bg-muted/30 p-4 rounded-md border">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-2xl font-semibold mb-4">About Neotoma</h4>
                    <p className="text-muted-foreground mb-4">
                      Content flows naturally without card boundaries.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-4">Section heading</h4>
                    <p className="text-muted-foreground">
                      More content continues in the same flow.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Design system index (correct)</h3>
              <div className="bg-muted/30 p-4 rounded-md border">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Section card</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Cards are appropriate in grid layouts.
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Section card</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Each card represents a distinct item.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesignSystemLayout>
  );
}
