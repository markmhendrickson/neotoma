import { useRef, useState, type KeyboardEvent } from "react";

type Interface = "CLI" | "MCP" | "REST API";
const interfaces: Interface[] = ["CLI", "MCP", "REST API"];

const invoicePayload = JSON.stringify({
  entity_type: "invoice",
  schema_version: "1.0",
  invoice_number: "INV-2041",
  vendor_name: "Acme",
  invoice_date: "2026-10-01",
  amount_due: 3200,
  currency: "USD",
  date_due: "2026-10-22",
});

/** One illustrative invoice, with variable IDs and explicit transport-specific auth. No requests run. */
const examples: Record<Interface, string> = {
  CLI: `# Local profile. Store the invoice; read the returned entity_id as INVOICE_ID.
neotoma dev store --observation-source import --entities '[${invoicePayload}]'
# An email changes the date. Use the invoice entity ID returned above.
neotoma dev corrections create "$INVOICE_ID" --entity-type invoice --field-name date_due --corrected-value 2026-10-29
neotoma dev entities get "$INVOICE_ID"
neotoma dev observations list --entity-id "$INVOICE_ID"
neotoma dev request --operation getFieldProvenance --body "{\\"entity_id\\":\\"$INVOICE_ID\\",\\"field\\":\\"date_due\\"}"`,
  MCP: `// Calls your configured Neotoma MCP server. Replace $INVOICE_ID with the store result.
store({entities:[${invoicePayload}],observation_source:"import"})
correct({entity_id:"$INVOICE_ID",entity_type:"invoice",field:"date_due",value:"2026-10-29",idempotency_key:"unique-amendment-key"})
retrieve_entity_snapshot({entity_id:"$INVOICE_ID",format:"json"})
list_observations({entity_id:"$INVOICE_ID"})
retrieve_field_provenance({entity_id:"$INVOICE_ID",field:"date_due"})`,
  "REST API": `# Your running local API needs a configured owner token. Replace $INVOICE_ID after store.
curl -sS -X POST "$NEOTOMA_URL/store" -H "Authorization: Bearer $NEOTOMA_TOKEN" -H 'Content-Type: application/json' -d '{"entities":[${invoicePayload}],"observation_source":"import"}'
curl -sS -X POST "$NEOTOMA_URL/correct" -H "Authorization: Bearer $NEOTOMA_TOKEN" -H 'Content-Type: application/json' -d "{\\"entity_id\\":\\"$INVOICE_ID\\",\\"entity_type\\":\\"invoice\\",\\"field\\":\\"date_due\\",\\"value\\":\\"2026-10-29\\",\\"idempotency_key\\":\\"unique-amendment-key\\"}"
curl -sS -X POST "$NEOTOMA_URL/get_entity_snapshot" -H "Authorization: Bearer $NEOTOMA_TOKEN" -H 'Content-Type: application/json' -d "{\\"entity_id\\":\\"$INVOICE_ID\\"}"
curl -sS -X POST "$NEOTOMA_URL/list_observations" -H "Authorization: Bearer $NEOTOMA_TOKEN" -H 'Content-Type: application/json' -d "{\\"entity_id\\":\\"$INVOICE_ID\\"}"
curl -sS -X POST "$NEOTOMA_URL/get_field_provenance" -H "Authorization: Bearer $NEOTOMA_TOKEN" -H 'Content-Type: application/json' -d "{\\"entity_id\\":\\"$INVOICE_ID\\",\\"field\\":\\"date_due\\"}"`,
};

export function InterfaceExplorer() {
  const [selected, setSelected] = useState<Interface>("CLI");
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectByKey = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const key = event.key;
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? 2
          : key === "ArrowRight"
            ? (current + 1) % 3
            : key === "ArrowLeft"
              ? (current + 2) % 3
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
        Illustrative calls, never run by this page. Read the store response for the actual entity
        ID. The snippets record fields and their observation history; they do not upload the
        fictional PDF or email shown above. Each correction needs its own idempotency key and does
        not edit the earlier observation.
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
          <p className="plan-small">
            {name === "CLI"
              ? "Local CLI commands do not add the MCP client's writer attribution."
              : name === "MCP"
                ? "The connected MCP client reports its identity; verification depends on signed requests."
                : "REST requires configured authentication; unsigned writer names are self-reported."}
          </p>
          <pre className="plan-pre" tabIndex={0} aria-label={`${name} illustrative invoice calls`}>
            <code>{examples[name]}</code>
          </pre>
        </div>
      ))}
      <p className="plan-small">
        All three paths store, amend, read the snapshot and inspect observations and field
        provenance. Observation history is distinct from date-derived timeline events.
      </p>
    </div>
  );
}
