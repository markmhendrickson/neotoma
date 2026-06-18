import {
  DesignPatternSourceNote,
  DesignPatternStack,
} from "@/components/design/design_pattern_source";
import { DesignTableScrollDemo } from "@/components/design/design_table_scroll_demo";
import {
  DesignRow,
  DesignSection,
  DesignSubsection,
} from "@/components/design/design_section";
import { Button } from "@/components/ui/button";
import { CopyableCodeBlock } from "@/components/ui/copyable_code_block";

const SAMPLE_CLI = `neotoma store --json='[{"entity_type":"task","title":"Review design tokens"}]'`;
const SAMPLE_MCP_JSON = `{
  "mcpServers": {
    "neotoma": {
      "command": "neotoma",
      "args": ["mcp", "serve"]
    }
  }
}`;
const SAMPLE_AGENT_PROMPT = `Wire this agent to the local Neotoma dev server.

1. Run \`neotoma status --json\` to identify my current tool and the running dev API port.
2. Run \`neotoma setup --tool <current_tool> --yes --mcp-transport c\` to register the source-checkout stdio MCP.
3. Confirm success by grepping stdout for the \`Neotoma installed at\` line.

This is a developer dev environment (source checkout). See https://neotoma.io/install.md.`;

export function DesignCodeReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection
        title="Code patterns"
        description="The app uses one copy-to-clipboard primitive (CopyableCodeBlock) for shell/config snippets and agent prompts. Use variant=&quot;prompt&quot; for multi-line instructions (app body typography); variant=&quot;code&quot; (default) for monospace snippets. Inline code is a separate token-level pattern."
      >
        <DesignSubsection title="Agent prompt block (variant=prompt)">
          <DesignPatternSourceNote
            paths={[
              "inspector/src/components/ui/copyable_code_block.tsx",
              "inspector/src/components/home/activate_card.tsx (consumer)",
            ]}
          />
          <CopyableCodeBlock
            code={SAMPLE_AGENT_PROMPT}
            variant="prompt"
            copyAriaLabel="Copy agent prompt"
            footer={
              <p className="text-xs text-muted-foreground">
                Footer slot for doc links (see ActivateCard).
              </p>
            }
          />
          <p className="pattern-specimen-note">
            Paste-into-agent instructions: normal app body size/color inside a visibly copyable surface.
            Use the stronger prompt chrome for instructions, not for ordinary prose.
          </p>
        </DesignSubsection>

        <DesignSubsection title="Copyable code block (variant=code)">
          <DesignPatternSourceNote
            paths={[
              "inspector/src/components/ui/copyable_code_block.tsx",
              "inspector/src/components/home/activate_card.tsx (consumer)",
            ]}
          />
          <CopyableCodeBlock code={SAMPLE_CLI} copyAriaLabel="Copy CLI snippet" />
          <p className="pattern-specimen-note">
            One reusable primitive. To attach doc links or follow-up actions below the block, pass a{" "}
            <code className="doc-inline-code">footer</code> ReactNode (see ActivateCard).
          </p>
        </DesignSubsection>

        <DesignSubsection title="Multi-line config snippet">
          <DesignPatternSourceNote paths={["inspector/src/components/ui/copyable_code_block.tsx"]} />
          <CopyableCodeBlock
            code={SAMPLE_MCP_JSON}
            copyAriaLabel="Copy MCP config"
            preClassName="max-h-48"
          />
          <p className="pattern-specimen-note">
            Use <code className="doc-inline-code">preClassName=&quot;max-h-*&quot;</code> when the snippet is long enough
            that it should scroll inside the card instead of expanding the page.
          </p>
        </DesignSubsection>

        <DesignSubsection title="Inline code in prose / lists">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-inline-code)"]} />
          <p className="text-body leading-7 text-foreground">
            Global option <code className="doc-inline-code">--json</code> forces machine-readable output.
          </p>
          <ul className="list-none space-y-2 pl-0">
            <li className="text-body leading-7 text-muted-foreground">
              <code className="doc-inline-code">--offline</code> — force in-process local transport
            </li>
            <li className="text-body leading-7 text-muted-foreground">
              <code className="doc-inline-code">--api-only</code> — fail if API server is unavailable
            </li>
          </ul>
        </DesignSubsection>

        <DesignSubsection title="Action button next to a snippet">
          <DesignPatternSourceNote paths={["inspector/src/components/ui/button.tsx"]} />
          <DesignRow>
            <Button>Run command</Button>
            <Button variant="outline">Open docs</Button>
          </DesignRow>
          <p className="pattern-specimen-note">
            Prefer <code className="doc-inline-code">Button</code> with <code className="doc-inline-code">variant</code>{" "}
            over hand-rolled anchor chrome. CopyableCodeBlock already provides the copy action; pair it with a Button
            only when the user has a separate next step (open docs, run installer, …).
          </p>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignProseReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Prose patterns" description="Markdown body, links, blockquotes, and step rails.">
        <DesignSubsection title="Markdown body (inspector-prose-page)">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.inspector-prose-page)"]} />
          <article className="inspector-prose-page inspector-prose max-w-none">
            <h2>Section heading (h2)</h2>
            <p>
              Body copy uses <code className="doc-inline-code">text-body</code>. Fenced blocks use{" "}
              <code className="doc-inline-code">code-block-palette</code>.
            </p>
            <h3>Subsection (h3)</h3>
            <ul>
              <li>First list item with spacing</li>
              <li>
                Second item with an <a href="#prose-links">in-body link</a>
              </li>
            </ul>
            <pre>neotoma entities list --type task</pre>
          </article>
        </DesignSubsection>

        <DesignSubsection title="Prose links">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.inspector-prose, .inspector-prose-cta)"]} />
          <div className="inspector-prose inspector-prose-page max-w-prose space-y-2">
            <p className="text-body leading-7">
              Default links are underlined; hover removes underline. CTAs use{" "}
              <code className="doc-inline-code">data-inspector-prose-cta</code> with{" "}
              <code className="doc-inline-code">.inspector-prose-cta</code>.
            </p>
            <p className="text-body leading-7">
              <a href="#example">Underlined link</a> versus{" "}
              <a href="#cta" data-inspector-prose-cta className="inspector-prose-cta">
                Install CTA
              </a>
            </p>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Blockquotes">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.blockquote-callout, .blockquote-muted)"]} />
          <blockquote className="blockquote-callout">
            Primary rail — walkthrough and evaluation callouts.
          </blockquote>
          <blockquote className="blockquote-muted">
            Muted italic rail — instruction and evaluation pages.
          </blockquote>
        </DesignSubsection>

        <DesignSubsection title="Step indent rail">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-step-rail)"]} />
          <div className="doc-step-rail mt-2">
            <p className="text-body leading-7 text-muted-foreground">Nested steps with left border grouping.</p>
            <p className="text-body leading-7 text-muted-foreground">Second step in the same rail.</p>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Step number + section kicker">
          <DesignPatternSourceNote
            paths={["inspector/src/index.css (.doc-step-number, .doc-section-kicker, .doc-arrow-accent)"]}
          />
          <p className="text-body leading-7 text-foreground">
            <span className="doc-step-number">1</span>
            <span className="doc-section-kicker">Operating</span> — walkthrough pillar labels use primary tokens.
          </p>
          <p className="text-body leading-7 text-muted-foreground">
            <span className="doc-arrow-accent mt-0.5" aria-hidden>
              &rarr;
            </span>{" "}
            List arrows use <code className="doc-inline-code">doc-arrow-accent</code>.
          </p>
        </DesignSubsection>

        <DesignSubsection title="Tip / callout panel">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-tip-panel)"]} />
          <div className="doc-tip-panel max-w-xl">
            <p className="text-body font-medium text-foreground">You don&apos;t define schemas upfront.</p>
            <p className="text-body leading-7 text-muted-foreground">
              Store any entity with a descriptive type; Neotoma infers schema on first write.
            </p>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Article column width">
          <DesignPatternSourceNote paths={["inspector/src/components/layout/page_shell.tsx"]} />
          <p className="pattern-specimen-note">
            Long-form prose pages cap width with <code className="doc-inline-code">max-w-[52em] mx-auto px-4</code>{" "}
            wrappers; bare landings omit <code className="doc-inline-code">inspector-prose-page</code>.
          </p>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignTablesReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Table patterns" description="GFM markdown tables, scroll wrapper, and plain reference tables.">
        <DesignSubsection title="GFM markdown table">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.markdown-table)"]} />
          <div className="inspector-prose-page overflow-x-auto">
            <table className="markdown-table mb-4 w-full border-collapse text-body">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Modes</th>
                  <th>Install</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cursor</td>
                  <td>stdio, remote HTTP</td>
                  <td>
                    <code className="doc-inline-code">neotoma setup --tool cursor</code>
                  </td>
                </tr>
                <tr>
                  <td>Claude Code</td>
                  <td>stdio, remote HTTP</td>
                  <td>
                    <code className="doc-inline-code">neotoma setup --tool claude-code</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Reference table + scroll hint">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.table-scroll-outer)"]} />
          <DesignTableScrollDemo />
        </DesignSubsection>

        <DesignSubsection title="Plain reference table">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-plain-table)"]} />
          <table className="doc-plain-table">
            <thead>
              <tr>
                <th>Surface</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Entities</td>
                <td className="font-mono text-ui">/entities</td>
              </tr>
            </tbody>
          </table>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignNoticesReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Notice patterns" description="Banners, TOC panels, and environment status chips.">
        <DesignSubsection title="Translation fallback banner">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.translation-banner)"]} />
          <p className="translation-banner">
            Translation for <span className="font-mono text-ui">es</span> is not available yet; showing English source (
            <span className="font-mono text-ui">translated_from_revision=12</span>).
          </p>
        </DesignSubsection>

        <DesignSubsection title="TOC panel">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.toc-panel)"]} />
          <nav className="toc-panel mb-2 rounded-lg border p-4">
            <p className="mb-2 text-ui font-medium text-foreground">On this page</p>
            <ul className="space-y-1 text-body leading-7 text-muted-foreground">
              <li>
                <a href="#toc-1" className="underline underline-offset-2">
                  Deterministic evolution
                </a>
              </li>
              <li>
                <a href="#toc-2" className="underline underline-offset-2">
                  Versioned history
                </a>
              </li>
            </ul>
          </nav>
        </DesignSubsection>

        <DesignSubsection title="Environment status chips">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.env-chip-*)"]} />
          <DesignRow>
            <span className="env-chip-sandbox">Sandbox</span>
            <span className="env-chip-preview">Preview</span>
            <span className="env-chip-destructive">Destructive demo</span>
          </DesignRow>
          <p className="pattern-specimen-note mt-2">
            Product pages may use <code>Badge</code> with the same border/background token mix.
          </p>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignChromeReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Section chrome" description="Section backgrounds and prose text scale.">
        <DesignSubsection title="Hero / section gradients">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.gradient-hero-success)"]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="gradient-hero-success h-24 rounded-lg border border-border" />
            <div className="gradient-section-success h-24 rounded-lg border border-border" />
          </div>
          <p className="pattern-specimen-note">Radial overlays using primary and secondary tokens.</p>
        </DesignSubsection>

        <DesignSubsection title="Prose text scale">
          <DesignPatternSourceNote paths={["inspector/tailwind.config.mjs"]} />
          <ul className="space-y-2 text-body text-muted-foreground">
            <li>
              <code className="font-mono text-ui">text-body</code> — prose paragraphs
            </li>
            <li>
              <code className="font-mono text-ui">text-body-lg</code> — h2 in markdown content
            </li>
            <li>
              <code className="font-mono text-ui">text-ui</code> — chrome and code in cards
            </li>
            <li>
              <code className="font-mono text-ui">text-fine</code> — subtitles under cards
            </li>
            <li>
              <code className="font-mono text-ui">text-caption</code> — pill labels, scroll hints
            </li>
          </ul>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}
