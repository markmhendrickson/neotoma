import { useLocale } from "@/i18n/LocaleContext";
import { RelationshipGraph } from "./RelationshipGraph";

/** Static example using documented invoice fields and the app's detail vocabulary. */
export function InspectorPreview() {
  const es = useLocale().locale === "es";
  return (
    <div className="plan-inspector" aria-label={es ? "Registro de factura de ejemplo en la aplicación Neotoma" : "Example invoice record in the Neotoma app"}>
      <header className="plan-inspector-head">
        <span className="plan-inspector-brand">Neotoma</span>
      </header>
      <div className="plan-inspector-body">
        <div className="plan-inspector-title">
          <div>
            <h3>INV-2041</h3>
            <p className="plan-inspector-meta">
              <span>Acme</span>
              <span className="plan-inspector-type">invoice</span>
            </p>
          </div>
          <span className="plan-inspector-count">{es ? "2 observaciones" : "2 observations"}</span>
        </div>
        <div className="plan-inspector-grid">
          <section className="plan-inspector-card" aria-label={es ? "Instantánea actual" : "Current snapshot"}>
            <h4>{es ? "Instantánea actual" : "Current snapshot"}</h4>
            <dl>
              <div>
                <dt>invoice_number</dt>
                <dd>INV-2041 <small>{es ? "del PDF de la factura" : "from invoice PDF"}</small></dd>
              </div>
              <div>
                <dt>vendor_name</dt>
                <dd>
                  Acme <small>{es ? "del PDF de la factura" : "from invoice PDF"}</small>
                </dd>
              </div>
              <div>
                <dt>invoice_date</dt>
                <dd>
                  {es ? "1 de octubre de 2026" : "October 1st, 2026"} <small>{es ? "del PDF de la factura" : "from invoice PDF"}</small>
                </dd>
              </div>
              <div>
                <dt>date_due</dt>
                <dd>
                  {es ? "29 de octubre de 2026" : "October 29th, 2026"} <small>{es ? "del correo posterior" : "from later email"}</small>
                </dd>
              </div>
              <div>
                <dt>amount_due</dt>
                <dd>
                  {es ? "3.200" : "3,200"} <small>{es ? "del PDF de la factura" : "from invoice PDF"}</small>
                </dd>
              </div>
              <div>
                <dt>currency</dt>
                <dd>
                  USD <small>{es ? "del PDF de la factura" : "from invoice PDF"}</small>
                </dd>
              </div>
            </dl>
          </section>
          <section className="plan-inspector-card" aria-label={es ? "Historial de observaciones" : "Observation history"}>
            <h4>{es ? "Historial de observaciones" : "Observation history"}</h4>
            <ol className="plan-inspector-history">
              <li>
                <strong>{es ? "Correo posterior" : "Later email"}</strong>
                <span>date_due: {es ? "29 de octubre de 2026" : "October 29th, 2026"}</span>
                <small>{es ? "Correo facilitado · observación conservada" : "Supplied email · retained observation"}</small>
              </li>
              <li>
                <strong>{es ? "PDF de la factura" : "Invoice PDF"}</strong>
                <span>date_due: {es ? "22 de octubre de 2026" : "October 22nd, 2026"} · amount_due: {es ? "3.200" : "3,200"} USD</span>
                <small>{es ? "PDF facilitado · observación conservada" : "Supplied PDF · retained observation"}</small>
              </li>
            </ol>
          </section>
          <section className="plan-inspector-card plan-inspector-sources" aria-label={es ? "Fuentes" : "Sources"}>
            <h4>{es ? "Fuentes" : "Sources"}</h4>
            <div className="plan-source-preview">
              <span className="plan-source-symbol" aria-hidden="true">
                PDF
              </span>
              <div>
                <strong>INV-2041.pdf</strong>
                <p>{es ? "Factura de Acme · emitida el 1 de octubre de 2026" : "Invoice from Acme · issued October 1st, 2026"}</p>
                <p>{es ? "Importe 3.200 USD · vence el 22 de octubre de 2026" : "Amount 3,200 USD · due October 22nd, 2026"}</p>
              </div>
            </div>
            <div className="plan-source-preview">
              <span className="plan-source-symbol" aria-hidden="true">
                @
              </span>
              <div>
                <strong>{es ? "Cambio de vencimiento" : "Due date update"}</strong>
                <p>{es ? "Correo facilitado sobre INV-2041" : "Supplied email about INV-2041"}</p>
                <p>{es ? "Nuevo vencimiento: 29 de octubre de 2026" : "Revised due date: October 29th, 2026"}</p>
              </div>
            </div>
          </section>
          <section className="plan-inspector-card" aria-label={es ? "Relaciones" : "Relationships"}>
            <h4>{es ? "Relaciones" : "Relationships"}</h4>
            <RelationshipGraph es={es} />
            <p className="plan-small">
              {es ? "Un agente vinculó explícitamente estos registros de ejemplo. El PDF y el correo facilitados siguen siendo fuentes de observaciones; el registro de correo tipado y la tarea de seguimiento son registros separados y no se crean automáticamente a partir de esas fuentes." : "An agent explicitly linked these example records. The supplied PDF and email above remain sources for observations; the typed email record and follow-up task are separate records, not automatically created from those sources."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
