import { SiteSnippet } from "../SiteSnippet";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { InspectorPreview } from "./InspectorPreview";
import { McpConversation } from "./McpConversation";
import { neotomaDocUrl } from "@/site/neotoma_repo";
import { staticAssetPath } from "@/site/spa_path";
import { useLocale } from "@/i18n/LocaleContext";

type Interface = "App" | "CLI" | "MCP" | "REST API";
const interfaces: Interface[] = ["MCP", "App", "CLI", "REST API"];
const cliDocHref = neotomaDocUrl("docs/developer/cli_reference.md");

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

/** One illustrative invoice, with variable IDs and explicit transport-specific auth. No requests run. */
const examples = (es: boolean): Partial<Record<Interface, string>> => ({
  App: "",
  CLI: [
    es ? "# Perfil local. Sustituye cada clave de ejemplo; reutilízala solo para reintentar la misma operación." : "# Local profile. Replace each example key once; reuse it only for a retry of that same operation.",
    es ? "# Toma el entity_id devuelto como INVOICE_ID." : "# Read the returned entity_id as INVOICE_ID.",
    cli(
      "neotoma dev store",
      "--observation-source import",
      "--idempotency-key unique-invoice-store-key",
      `--entities '${invoicePayload}'`
    ),
    es ? "# El correo facilitado cambia el vencimiento. Usa el ID de entidad devuelto arriba." : "# The supplied email changes the date. Use the entity ID returned above.",
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
  "REST API": [
    es ? "# Configura NEOTOMA_URL y tu token de propietario. Sustituye INVOICE_ID después de store." : "# Set NEOTOMA_URL and your owner token. Replace INVOICE_ID after store.",
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
});

export function InterfaceExplorer() {
  const { locale } = useLocale();
  const es = locale === "es";
  const currentExamples = examples(es);
  const [selected, setSelected] = useState<Interface>("MCP");
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
        {es ? "Observa cómo un agente registra por MCP una factura y el nuevo vencimiento; después inspecciona ejemplos ilustrativos desde otra interfaz." : "See an agent record an invoice and its updated due date through MCP, then inspect illustrative examples from another interface."}
      </p>
      <div className="plan-tabs" role="tablist" aria-label={es ? "Interfaz para operar con la factura" : "Invoice operation interface"}>
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
          ) : name === "MCP" ? (
            <McpConversation active={selected === "MCP"} />
          ) : (
            <>
              {currentExamples[name] ? (
                <SiteSnippet
                  text={currentExamples[name]}
                  title={es ? `Ejemplo de ${name}` : `${name} example`}
                  chrome={false}
                  highlight
                  copyFeedbackId={`invoice-${name}`}
                  label={es ? `Llamadas ilustrativas de factura por ${name}` : `${name} illustrative invoice calls`}
                />
              ) : (
                <p className="plan-small">
                  {es ? "Ejemplo no disponible; consulta la " : "Example unavailable; use the "}{" "}
                  <a href={cliDocHref.startsWith("/") ? staticAssetPath(cliDocHref) : cliDocHref}>
                    {es ? "referencia de la interfaz" : "interface reference"}
                  </a>
                  .
                </p>
              )}
            </>
          )}
        </div>
      ))}
      <p className="plan-small">
        {es ? "Cada store y cada corrección por MCP o REST necesita su propia clave de idempotencia. En una instalación local predeterminada, MCP stdio y CLI o REST escriben como usuarios locales distintos y mantienen registros separados salvo que compartan instancia y usuario. Los comandos de corrección conservan la observación anterior, pero no guardan un documento fuente." : "Over MCP and REST, each store and each correction needs its own idempotency key. In a default local install, stdio MCP and CLI or REST write as different local users and keep separate records unless they share an instance and user. Correction commands preserve the earlier observation but store no source document."}
      </p>
    </div>
  );
}
