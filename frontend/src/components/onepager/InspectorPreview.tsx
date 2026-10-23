/** Static example using documented invoice fields and the app's detail vocabulary. */
export function InspectorPreview() {
  return (
    <div className="plan-inspector" aria-label="Example invoice record in the Neotoma app">
      <header className="plan-inspector-head">
        <span className="plan-inspector-brand">Neotoma</span>
      </header>
      <div className="plan-inspector-body">
        <div className="plan-inspector-title">
          <div>
            <span className="plan-inspector-type">invoice</span>
            <h3>INV-2041</h3>
            <p>Acme · Invoice record</p>
          </div>
          <span className="plan-inspector-count">2 observations</span>
        </div>
        <div className="plan-inspector-grid">
          <section className="plan-inspector-card" aria-label="Current snapshot">
            <h4>Current snapshot</h4>
            <dl>
              <div>
                <dt>invoice_number</dt>
                <dd>INV-2041</dd>
              </div>
              <div>
                <dt>vendor_name</dt>
                <dd>
                  Acme <small>from invoice PDF</small>
                </dd>
              </div>
              <div>
                <dt>invoice_date</dt>
                <dd>
                  October 1st, 2026 <small>from invoice PDF</small>
                </dd>
              </div>
              <div>
                <dt>date_due</dt>
                <dd>
                  October 29th, 2026 <small>from later email</small>
                </dd>
              </div>
              <div>
                <dt>amount_due</dt>
                <dd>
                  3,200 USD <small>from invoice PDF</small>
                </dd>
              </div>
            </dl>
            <p className="plan-inspector-trace">date_due → later email observation</p>
          </section>
          <section className="plan-inspector-card" aria-label="Observation history">
            <h4>Observation history</h4>
            <ol className="plan-inspector-history">
              <li>
                <strong>Later email</strong>
                <span>date_due: October 29th, 2026</span>
                <small>Supplied email · retained observation</small>
              </li>
              <li>
                <strong>Invoice PDF</strong>
                <span>date_due: October 22nd, 2026 · amount_due: 3,200 USD</span>
                <small>Supplied PDF · retained observation</small>
              </li>
            </ol>
          </section>
          <section className="plan-inspector-card plan-inspector-sources" aria-label="Sources">
            <h4>Sources</h4>
            <div className="plan-source-preview">
              <span className="plan-source-symbol" aria-hidden="true">
                PDF
              </span>
              <div>
                <strong>INV-2041.pdf</strong>
                <p>Invoice from Acme · issued October 1st, 2026</p>
                <p>Amount 3,200 USD · due October 22nd, 2026</p>
              </div>
            </div>
            <div className="plan-source-preview">
              <span className="plan-source-symbol" aria-hidden="true">
                @
              </span>
              <div>
                <strong>Due date update</strong>
                <p>Supplied email about INV-2041</p>
                <p>Revised due date: October 29th, 2026</p>
              </div>
            </div>
          </section>
          <section className="plan-inspector-card" aria-label="Relationships">
            <h4>Relationships</h4>
            <p className="plan-related-entity">
              <span>INV-2041</span>
              <span>REFERS_TO</span>
              <strong>Acme · company</strong>
            </p>
            <p className="plan-small">
              The vendor_name field identifies the related company record.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
