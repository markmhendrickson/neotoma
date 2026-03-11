import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function SchemaManagementPage() {
  return (
    <DetailPage title="Schema management">
      <p className="text-[15px] leading-7 mb-4">
        Schema constraints are a core invariant: malformed writes should fail at store time, not silently
        degrade state quality. This page covers practical schema workflows for unfamiliar users.
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">List and inspect schema types</h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# List known entity types
neotoma schemas list

# Inspect one schema
neotoma schemas get contact`}</pre>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">Store data with schema validation</h2>
      <p className="text-[15px] leading-7 mb-4">
        Store operations validate payloads against the target schema. If required fields are missing or have
        the wrong type, the write fails and no silent mutation occurs.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Valid write
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","email":"ana@acme.com"}]'

# Invalid write (example: wrong type for age)
neotoma store --json='[{"entity_type":"person","name":"Ana Rivera","age":"thirty"}]'`}</pre>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">Evolve schemas incrementally</h2>
      <p className="text-[15px] leading-7 mb-4">
        Add new fields without breaking existing workflows. For larger changes, analyze candidates first, then
        register updates intentionally.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Analyze candidate fields from observed data
neotoma schemas analyze-candidates --entity-type contact

# Recommend schema updates
neotoma schemas recommendations --entity-type contact

# Register or update schema
neotoma schemas register --file ./contact_schema.json`}</pre>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">Operational guidance</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        {[
          "Prefer additive schema changes over destructive renames.",
          "Use versioned changelogs for schema edits with rationale.",
          "Test representative payloads before changing production schema.",
          "Treat schema updates as state-model changes, not UI tweaks.",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            {item}
          </li>
        ))}
      </ul>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/memory-guarantees#schema-constraints" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema constraints
        </Link>
        ,{" "}
        <Link to="/data-model" className="text-foreground underline underline-offset-2 hover:no-underline">
          data model walkthrough
        </Link>
        , and{" "}
        <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
          architecture
        </Link>
        .
      </p>
    </DetailPage>
  );
}
