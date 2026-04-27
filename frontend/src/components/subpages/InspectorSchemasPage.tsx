import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorSchemasPage() {
  return (
    <DetailPage title="Inspector, Schemas">
      <p className="text-[15px] leading-7 mb-4">
        Neotoma is schema-agnostic at write time but schema-aware at read
        time. The Schemas section of Inspector is where operators see what
        types have actually been registered, what fields each one carries,
        which fields define identity, and how that schema has evolved.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Schema list
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The list at <code>/schemas</code> shows every registered{" "}
        <code>entity_type</code> with its current schema version, field
        count, identity rule, and how many entities of that type currently
        exist. The same numbers back the histogram on the dashboard, but
        here you can sort by churn, last write, or
        observation cardinality.
      </p>

      <InspectorPreview
        path="/schemas"
        caption="Schemas list with type, version, field count, identity rule, and live entity cardinality."
      >
        <div className="flex">
          <InspectorSidebarMock active="schemas" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Schemas"
              subtitle="47 registered entity types"
              right={
                <span className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                  Search…
                </span>
              }
            />
            <div className="px-4 py-3">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Type</th>
                    <th className="py-1.5 pr-3 font-medium">Version</th>
                    <th className="py-1.5 pr-3 font-medium">Fields</th>
                    <th className="py-1.5 pr-3 font-medium">Identity</th>
                    <th className="py-1.5 pr-3 font-medium text-right">
                      Entities
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      t: "agent_message",
                      v: "v1.4",
                      f: 9,
                      id: "turn_key",
                      n: 4910,
                    },
                    {
                      t: "transaction",
                      v: "v0.9",
                      f: 12,
                      id: "schema_rule",
                      n: 3104,
                    },
                    {
                      t: "contact",
                      v: "v0.6",
                      f: 8,
                      id: "schema_rule",
                      n: 2231,
                    },
                    {
                      t: "task",
                      v: "v0.4",
                      f: 7,
                      id: "canonical_name",
                      n: 1556,
                    },
                    {
                      t: "event",
                      v: "v0.3",
                      f: 11,
                      id: "schema_rule",
                      n: 902,
                    },
                    {
                      t: "file_asset",
                      v: "v0.2",
                      f: 6,
                      id: "schema_rule",
                      n: 612,
                    },
                  ].map((row) => (
                    <tr
                      key={row.t}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-1.5 pr-3 font-mono text-foreground">
                        {row.t}
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {row.v}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                        {row.f}
                      </td>
                      <td className="py-1.5 pr-3">
                        <MockPill tone="info">{row.id}</MockPill>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                        {row.n.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Schema detail, fields & identity
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Click a type to drill into its schema. The detail view shows each
        field's name, inferred JSON type, whether it's part of the identity
        rule, when it was first observed, and the example values that
        produced its inferred type. The identity rule itself,
        <code>schema_rule</code>, <code>canonical_name</code>, or{" "}
        <code>turn_key</code>, is highlighted because it determines how
        deduplication works at write time.
      </p>

      <InspectorPreview
        path="/schemas/transaction"
        caption="Schema detail: every field, its inferred type, whether it's part of the identity rule, and per-field cardinality."
      >
        <div className="flex">
          <InspectorSidebarMock active="schemas" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="transaction"
              subtitle="v0.9 · 12 fields · identity_rule = schema_rule(amount, merchant, billing_period)"
              right={
                <>
                  <MockPill tone="info">v0.9</MockPill>
                  <span className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground">
                    Edit fields
                  </span>
                </>
              }
            />
            <div className="px-4 py-3">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Field</th>
                    <th className="py-1.5 pr-3 font-medium">Type</th>
                    <th className="py-1.5 pr-3 font-medium">Identity?</th>
                    <th className="py-1.5 pr-3 font-medium">First seen</th>
                    <th className="py-1.5 pr-3 font-medium text-right">
                      Coverage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { f: "amount", t: "number", id: true, s: "v0.1", c: "100%" },
                    {
                      f: "merchant",
                      t: "string",
                      id: true,
                      s: "v0.1",
                      c: "100%",
                    },
                    {
                      f: "billing_period",
                      t: "string",
                      id: true,
                      s: "v0.2",
                      c: "98%",
                    },
                    {
                      f: "category",
                      t: "string",
                      id: false,
                      s: "v0.3",
                      c: "92%",
                    },
                    {
                      f: "currency",
                      t: "string",
                      id: false,
                      s: "v0.4",
                      c: "100%",
                    },
                    {
                      f: "source_quote",
                      t: "string",
                      id: false,
                      s: "v0.7",
                      c: "61%",
                    },
                    {
                      f: "api_response_data",
                      t: "object",
                      id: false,
                      s: "v0.8",
                      c: "44%",
                    },
                  ].map((row) => (
                    <tr
                      key={row.f}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-1.5 pr-3 font-mono text-foreground">
                        {row.f}
                      </td>
                      <td className="py-1.5 pr-3">
                        <MockPill tone="muted">{row.t}</MockPill>
                      </td>
                      <td className="py-1.5 pr-3">
                        {row.id ? (
                          <MockPill tone="success">identity</MockPill>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {row.s}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                        {row.c}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Schema evolution
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Schemas evolve via <code>update_schema_incremental</code>. Adding
        fields bumps the minor version; removing fields bumps the major
        version (and removes them from snapshots while preserving the
        underlying observations). Inspector shows the version history per
        type with a diff between adjacent versions, so operators can see
        when a field was introduced, deprecated, or restored.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Identity rules
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Three identity bases are exposed:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">schema_rule</strong>, a tuple
          of fields uniquely identifies the entity (e.g.{" "}
          <code>(amount, merchant, billing_period)</code> for{" "}
          <code>transaction</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">canonical_name</strong>, a
          single human-readable name uniquely identifies the row (common for{" "}
          <code>contact</code>, <code>company</code>, <code>place</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">turn_key</strong>, used for
          chat bookkeeping: <code>conversation_message</code> rows resolve
          per-turn so multiple observations from the same turn collapse to
          one entity.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        Heuristic-name resolution is also surfaced as a fallback identity
        basis for entities that didn't match a strict rule; the entity list
        filter for <code>identity_basis</code> uses the same enum.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Suggested fields
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        When a write introduces a previously-unseen field, the schema
        registry records it at low coverage. Inspector flags low-coverage
        fields so operators can decide to: promote them (formalise into
        the schema), prune them (remove via{" "}
        <code>fields_to_remove</code>), or leave them as ad-hoc metadata.
        See{" "}
        <Link
          to="/api"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          REST API
        </Link>{" "}
        for the schema mutation endpoints.
      </p>
    </DetailPage>
  );
}
