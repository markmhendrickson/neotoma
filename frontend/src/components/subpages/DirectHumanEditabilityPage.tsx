import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function DirectHumanEditabilityPage() {
  return (
    <DetailPage title="Direct human editability">
      <p className="text-[15px] leading-7 mb-4">
        Direct human editability means a person can open the memory store in a standard editor (VS Code,
        Notepad, vim) and modify it directly. File-based memory systems use plain text formats like Markdown
        or JSON that any tool can read and write without a runtime or API layer.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Trade-offs</h2>
      <p className="text-[15px] leading-7 mb-4">
        Editable files are maximally accessible but lack structural guarantees. A typo, a malformed JSON key,
        or an accidental deletion can silently corrupt state. There is no built-in{" "}
        <Link to="/versioned-history" className="text-foreground underline hover:text-foreground">
          versioned history
        </Link>{" "}
        unless the user maintains it (e.g. via git), and no{" "}
        <Link to="/schema-constraints" className="text-foreground underline hover:text-foreground">
          schema constraints
        </Link>{" "}
        to reject invalid edits.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">How Neotoma compares</h2>
      <p className="text-[15px] leading-7 mb-4">
        Neotoma stores data in a structured, schema-validated format. While the underlying storage is not a
        plain text file you open directly, entities are fully accessible and modifiable through the CLI and
        MCP actions. Every modification goes through the observation pipeline, preserving{" "}
        <Link to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
          auditable change logs
        </Link>{" "}
        and{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>
        .
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Read current state
neotoma entities get <entity_id>

# Update via a new observation (preserves history)
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","city":"Barcelona"}]'`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Platform memory (ChatGPT, Claude) may offer in-app UIs to view or edit memories, but the underlying
        store is not exposed as an editable file. See{" "}
        <Link to="/memory-models" className="text-foreground underline hover:text-foreground">
          memory models
        </Link>{" "}
        for the full comparison.
      </p>
    </DetailPage>
  );
}
