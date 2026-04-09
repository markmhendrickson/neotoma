import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function DataModelPage() {
  return (
    <DetailPage title="Data model">
      <p className="text-[15px] leading-7 mb-4">
        Neotoma uses a four-layer truth model: Source → Interpretation → Observation → Entity Snapshot. Each layer
        is immutable; provenance is preserved end-to-end.
      </p>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">Four-layer truth model</h2>
      <ol className="list-decimal list-inside space-y-2 mb-6 text-[15px] leading-7">
        <li>
          <strong>Source</strong>: Raw data (files, JSON, URLs) with content-addressed storage. Same bytes → same
          hash; no duplicate storage.
        </li>
        <li>
          <strong>Interpretation</strong>: Versioned AI extraction attempt with config logging.
        </li>
        <li>
          <strong>Observation</strong>: Granular, source-specific facts extracted from a source. Stored with
          entity_id, schema_version, source_id, and JSONB fields.
        </li>
        <li>
          <strong>Entity Snapshot</strong>: Deterministic reducer output: current truth per entity, derived from
          observations.
        </li>
      </ol>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">Why this model</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        {[
          "Multiple sources can contribute observations about the same entity.",
          "Deterministic merging via reducers; no silent overwrites.",
          "Full provenance: every snapshot field traces to specific observations and sources.",
          "Out-of-order ingestion supported; state reconstructs correctly.",
        ].map((item) => (
          <li key={item} className="text-[15px] leading-7 flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0" aria-hidden>
              &rarr;
            </span>
            {item}
          </li>
        ))}
      </ul>

      <h2 className="text-[20px] font-medium tracking-[-0.02em] mt-10 mb-3">Core invariants</h2>
      <p className="text-[15px] leading-7 mb-4">
        Schema and data model follow strict rules: immutability, provenance, determinism, strong typing for core
        fields, and JSONB for flexible entity-specific properties. Breaking changes (remove columns, change types) are
        forbidden in the MVP; only additive changes are allowed.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/schema-management" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema management
        </Link>
        ,{" "}
        <Link to="/schema-constraints" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema constraints
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
