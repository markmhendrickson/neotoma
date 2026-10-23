import { SiteSnippet } from "../SiteSnippet";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { InspectorPreview } from "./InspectorPreview";
import { neotomaGithubBlobUrl } from "@/site/neotoma_repo";

type Interface = "App" | "CLI" | "MCP" | "REST API";
const interfaces: Interface[] = ["App", "CLI", "MCP", "REST API"];

const invoice = {
  entity_type: "invoice",
  schema_version: "1.0",
  invoice_number: "INV-2041",
  vendor_name: "Acme",
  invoice_date: "2026-10-01",
  amount_due: 3200,
  currency: "USD",
  date_due: "2026-10-22",
};
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const invoicePayload = pretty([invoice]);
const amended = {
  entity_id: "$INVOICE_ID",
  entity_type: "invoice",
  field: "date_due",
  value: "2026-10-29",
  idempotency_key: "unique-amendment-key",
};
// Newlines inside shell quotes are part of the same JSON argument; backslashes continue flags.
const continuation = " " + String.fromCharCode(92) + "\n  ";
const cli = (...parts: string[]) => parts.join(continuation);
const curl = (operation: string, payload: unknown, expandId = false) => {
  const json = pretty(payload);
  const body = expandId ? `"${json.replace(/"/g, String.fromCharCode(92) + '"')}"` : `'${json}'`;
  return cli(
    `curl -sS -X POST "$NEOTOMA_URL/${operation}"`,
    '-H "Authorization: Bearer $NEOTOMA_TOKEN"',
    "-H 'Content-Type: application/json'",
    `--data-binary ${body}`
  );
};
const mcp = (operation: string, payload: unknown) => `${operation}(${pretty(payload)})`;

/** One illustrative invoice, with variable IDs and explicit transport-specific auth. No requests run. */
const examples: Record<Interface, string> = {
  App: "",
  CLI: [
    "# Local profile. Replace each example key once; reuse it only for a retry of that same operation.",
    "# Read the returned entity_id as INVOICE_ID.",
    cli(
      "neotoma dev store",
      "--observation-source import",
      "--idempotency-key unique-invoice-store-key",
      `--entities '${invoicePayload}'`
    ),
    "# The supplied email changes the date. Use the entity ID returned above.",
    cli(
      'neotoma dev corrections create "$INVOICE_ID"',
      "--entity-type invoice",
      "--field-name date_due",
      "--corrected-value 2026-10-29",
      "--idempotency-key unique-amendment-key"
    ),
    'neotoma dev entities get "$INVOICE_ID"',
    'neotoma dev observations list --entity-id "$INVOICE_ID"',
    cli(
      "neotoma dev request --operation getFieldProvenance",
      `--body "${pretty({ entity_id: "$INVOICE_ID", field: "date_due" }).replace(/"/g, String.fromCharCode(92) + '"')}"`
    ),
  ].join("\n\n"),
  MCP: [
    "// Calls your configured MCP server. Replace $INVOICE_ID with the store result.",
    mcp("store", {
      entities: [invoice],
      observation_source: "import",
      idempotency_key: "unique-invoice-store-key",
    }),
    mcp("correct", amended),
    mcp("retrieve_entity_snapshot", { entity_id: "$INVOICE_ID", format: "json" }),
    mcp("list_observations", { entity_id: "$INVOICE_ID" }),
    mcp("retrieve_field_provenance", { entity_id: "$INVOICE_ID", field: "date_due" }),
  ].join("\n\n"),
  "REST API": [
    "# Set NEOTOMA_URL and your owner token. Replace INVOICE_ID after store.",
    curl("store", {
      entities: [invoice],
      observation_source: "import",
      idempotency_key: "unique-invoice-store-key",
    }),
    curl("correct", amended, true),
    curl("get_entity_snapshot", { entity_id: "$INVOICE_ID" }, true),
    curl("list_observations", { entity_id: "$INVOICE_ID" }, true),
    curl("get_field_provenance", { entity_id: "$INVOICE_ID", field: "date_due" }, true),
  ].join("\n\n"),
};

export function InterfaceExplorer() {
  const [selected, setSelected] = useState<Interface>("App");
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const selectInspect = () => {
      if (window.location.hash === "#inspect") setSelected("App");
    };
    const repeatedInspect = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href="#inspect"]'))
        setSelected("App");
    };
    selectInspect();
    window.addEventListener("hashchange", selectInspect);
    window.addEventListener("popstate", selectInspect);
    document.addEventListener("click", repeatedInspect);
    return () => {
      window.removeEventListener("hashchange", selectInspect);
      window.removeEventListener("popstate", selectInspect);
      document.removeEventListener("click", repeatedInspect);
    };
  }, []);
  const selectByKey = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const key = event.key;
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? interfaces.length - 1
          : key === "ArrowRight"
            ? (current + 1) % interfaces.length
            : key === "ArrowLeft"
              ? (current + interfaces.length - 1) % interfaces.length
              : -1;
    if (next >= 0) {
      event.preventDefault();
      setSelected(interfaces[next]);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="plan-interface">
      <p className="plan-small">
        Follow the example invoice through the app or a documented interface.
      </p>
      <div className="plan-tabs" role="tablist" aria-label="Invoice operation interface">
        {interfaces.map((name, index) => (
          <button
            key={name}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`plan-tab-${index}`}
            aria-controls={`plan-panel-${index}`}
            aria-selected={selected === name}
            tabIndex={selected === name ? 0 : -1}
            onClick={() => setSelected(name)}
            onKeyDown={(event) => selectByKey(event, index)}
          >
            {name}
          </button>
        ))}
      </div>
      {interfaces.map((name, index) => (
        <div
          key={name}
          role="tabpanel"
          id={`plan-panel-${index}`}
          aria-labelledby={`plan-tab-${index}`}
          hidden={selected !== name}
          tabIndex={0}
        >
          {name === "App" ? (
            <>
              <InspectorPreview />
            </>
          ) : (
            <>
              <p className="plan-small">
                {name === "CLI"
                  ? "Local CLI commands do not add the MCP client's writer attribution."
                  : name === "MCP"
                    ? "The connected MCP client reports its identity; verification depends on signed requests."
                    : "REST requires configured authentication; unsigned writer names are self-reported."}
              </p>
              {examples[name] ? (
                <SiteSnippet
                  text={examples[name]}
                  title={`${name} example`}
                  copyFeedbackId={`invoice-${name}`}
                  label={`${name} illustrative invoice calls`}
                />
              ) : (
                <p className="plan-small">
                  Example unavailable; use the{" "}
                  <a href={neotomaGithubBlobUrl("docs/developer/cli_reference.md")}>
                    interface reference
                  </a>
                  .
                </p>
              )}
              <p className="plan-small">
                The snippets are illustrative calls, never run by this page.{" "}
                {"Read the store response for the actual entity ID."} Replace each example
                idempotency key with a unique key per operation, then reuse that key and payload
                only to retry that operation. A correction adds an observation; it does not edit the
                earlier one. The snippets store fields and inspect their history, but do not upload
                the fictional PDF or email. Observation history is distinct from date-derived
                timeline events.
              </p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
