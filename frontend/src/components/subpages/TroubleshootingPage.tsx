import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

const TROUBLESHOOTING_ITEMS = [
  {
    issue: "Agent is not storing memory entries",
    check: "Confirm MCP server is configured and running, then verify tool calls include store actions.",
    fix: "Recheck client config (`.cursor/mcp.json`, `.mcp.json`, or `.codex/config.toml`) and restart the client.",
  },
  {
    issue: "Entity query returns empty results",
    check: "Verify the entity type and filters used by your query.",
    fix: "Run `neotoma entities list --type <entity_type>` without search first, then narrow filters.",
  },
  {
    issue: "Unexpected or conflicting state values",
    check: "Inspect observations and provenance for that entity and field.",
    fix: "Use correction flows (`correct`, `reinterpret`) and confirm deterministic merge rules in schema/reducer logic.",
  },
  {
    issue: "CLI command behavior differs from API",
    check: "Check transport mode (`--offline`, `--api-only`, base URL) and environment selection.",
    fix: "Pin the mode explicitly for reproducible debugging, then compare with API endpoint responses.",
  },
  {
    issue: "Need to reset local state safely",
    check: "Export data first for auditability.",
    fix: "Back up data directory, then reinitialize. Avoid deleting data until exports are verified.",
  },
];

export function TroubleshootingPage() {
  return (
    <DetailPage title="Troubleshooting and FAQ">
      <p className="text-[15px] leading-7 mb-6">
        Use this guide when setup or behavior is unclear. For deterministic systems, the fastest path is to
        inspect state, provenance, and transport mode instead of guessing.
      </p>

      {TROUBLESHOOTING_ITEMS.map((item) => (
        <section key={item.issue} className="mb-8">
          <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-2">{item.issue}</h2>
          <p className="text-[15px] leading-7 mb-2">
            <strong>Check:</strong> {item.check}
          </p>
          <p className="text-[15px] leading-7">
            <strong>Fix:</strong> {item.fix}
          </p>
        </section>
      ))}

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-3">Useful commands</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Inspect entities
neotoma entities list --type task --limit 20

# Trace lineage for one entity
neotoma observations list --entity-id <entity_id>
neotoma relationships list --entity-id <entity_id>

# Confirm server health
neotoma stats`}</pre>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        ,{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        , and{" "}
        <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
          architecture
        </Link>
        {" "}for deeper diagnostics.
      </p>
    </DetailPage>
  );
}
