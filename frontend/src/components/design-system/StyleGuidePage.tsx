import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignSystemLayout } from "./DesignSystemLayout";

export function StyleGuidePage() {
  return (
    <DesignSystemLayout currentSection="style-guide" title="Style Guide">
      <Card>
        <CardHeader>
          <CardTitle>Style Guide</CardTitle>
          <CardDescription>
            Complete UI copy rules from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              docs/ui/design_system/style_guide.md
            </code>
            . Direct, active voice; no em dashes, soft questions, or motivational fluff.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Core Principles */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Core Principles</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Direct and declarative: Simple, clear statements</li>
              <li>• Active voice: "The system processes files" not "Files are processed"</li>
              <li>• One idea per sentence: Break complex thoughts into multiple sentences</li>
              <li>• No AI-generated patterns: Avoid machine-written stylistic quirks</li>
              <li>• Professional tone: Technical and precise, not conversational</li>
            </ul>
          </div>

          {/* Prohibited Patterns */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Prohibited Patterns</h4>
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium mb-1">Never use em dashes (—) or en dashes (–)</div>
                <div className="text-muted-foreground">
                  Use commas, periods, or colons instead. Use hyphens (-) for compound words.
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No conversational transitions</div>
                <div className="text-muted-foreground">
                  Avoid: "Now, let's...", "So, you might...", "Interestingly...", "As you can see..."
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No soft questions or offers</div>
                <div className="text-muted-foreground">
                  Avoid: "Would you like to...?", "Have you considered...?", "Want to try...?"
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No motivational language</div>
                <div className="text-muted-foreground">
                  Avoid: "Get started!", "Try it now!", "You're all set!", "Let's dive in!"
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No excessive parentheticals</div>
                <div className="text-muted-foreground">
                  Avoid multiple parenthetical asides in one sentence. Use separate sentences for explanations.
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No redundant qualifiers</div>
                <div className="text-muted-foreground">
                  Avoid: "very", "quite", "rather", "incredibly", "extremely"
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No complex sentence structures</div>
                <div className="text-muted-foreground">
                  Keep sentences short (15-20 words). One idea per sentence.
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No long paragraphs</div>
                <div className="text-muted-foreground">
                  Keep paragraphs short (3-4 sentences, maximum 5). Use lists for 3+ items.
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">No immediate repetition of proper nouns</div>
                <div className="text-muted-foreground">
                  Use pronouns or descriptive terms after first mention within the same paragraph.
                </div>
              </div>
            </div>
          </div>

          {/* Context-Specific Guidelines */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Context-Specific Guidelines</h4>
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium mb-1">Headers and Titles</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer (Sentence case):</div>
                    <div className="text-muted-foreground">"Entity details", "Upload document", "Settings page", "Design system"</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid (Title case):</div>
                    <div className="text-muted-foreground">"Entity Details", "Upload Document", "Settings Page", "Design System"</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Use sentence case for all headers, titles, and navigation labels. Capitalize only the first word and proper nouns.
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Button Labels</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">"Save", "Upload document", "Retry"</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">"Would you like to save?", "Submit form"</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Error Messages</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">"File too large. Maximum size 10 MB."</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">"Oops! Something went wrong. Please try again!"</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Empty States</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">"No sources yet.", "No entities found."</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">"Get started! Upload your first file!"</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Placeholders</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">"e.g. invoice.pdf", "Enter entity name"</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">"Enter your file name here (e.g. my file)"</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Tooltips</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">One clear idea; no filler</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">Long explanations or promotional text</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Success Messages</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">"Upload complete.", "Entity saved."</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">"You're all set! Great job!"</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Form Labels</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">"Entity type", "Source name", "Date range"</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">"Very important field", "What type of entity is this?"</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-1">Navigation Labels</div>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Prefer:</div>
                    <div className="text-muted-foreground">"Sources", "Entities", "Timeline", "Settings"</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avoid:</div>
                    <div className="text-muted-foreground">"Explore", "Discover", "Check out your sources"</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preferred Patterns */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Preferred Patterns</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Use lists for 3+ related items, features, or concepts</li>
              <li>• Use colons for list item descriptions, not em dashes</li>
              <li>• Keep messages short; use bullet lists for multiple points</li>
              <li>• Use commas for lists and brief clarifications</li>
              <li>• Use periods to separate distinct ideas</li>
              <li>• Use colons to introduce lists or explanations</li>
              <li>• Use hyphens (-) for compound words and ranges</li>
            </ul>
          </div>

          {/* Punctuation */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Punctuation</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• <strong>Commas:</strong> For lists, appositives, and joining related clauses</li>
              <li>• <strong>Periods:</strong> To end sentences and separate distinct ideas</li>
              <li>• <strong>Colons:</strong> To introduce lists, explanations, or definitions</li>
              <li>• <strong>Semicolons:</strong> Sparingly, only to connect closely related independent clauses</li>
              <li>• <strong>Hyphens:</strong> For compound words (file-based, user-controlled) and ranges (v0.1.0-v0.2.0)</li>
            </ul>
          </div>

          {/* Application Checklist */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Application Checklist</h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>No em dashes (—) or en dashes (–)</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>No conversational transitions</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>No soft questions or offers</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>No motivational language</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>No redundant qualifiers</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>Simple, declarative sentences</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>Active voice preferred</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>One idea per sentence</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>Colons used for list descriptions</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>Paragraphs are short (3-4 sentences, maximum 5)</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>No immediate repetition of proper nouns</span>
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" disabled />
                <span>Lists used for 3+ related items or concepts</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              See{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                docs/ui/design_system/style_guide.md
              </code>{" "}
              for complete rules and agent instructions.
            </p>
          </div>
        </CardContent>
      </Card>
    </DesignSystemLayout>
  );
}
