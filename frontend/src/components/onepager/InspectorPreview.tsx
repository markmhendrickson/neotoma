/** Static, synthetic rendering of the bundled Inspector's entity detail vocabulary and layout. */
export function InspectorPreview() {
  return (
    <div className="plan-inspector" aria-label="Illustrative read-only Inspector invoice detail">
      <header className="plan-inspector-head">
        <span className="plan-inspector-brand">Neotoma / Inspector</span>
        <span className="plan-inspector-mode">Read-only illustration</span>
      </header>
      <div className="plan-inspector-body">
        <p className="plan-inspector-crumb">Entities / invoice / INV-2041</p>
        <div className="plan-inspector-title">
          <div>
            <span className="plan-inspector-type">invoice</span>
            <h3>INV-2041</h3>
            <p>Acme · synthetic example</p>
          </div>
          <span className="plan-inspector-count">2 observations</span>
        </div>
        <div className="plan-inspector-grid">
          <section className="plan-inspector-card" aria-label="Current snapshot">
            <h4>Current snapshot</h4>
            <dl>
              <div>
                <dt>amount_due</dt>
                <dd>
                  3,200 USD <small>from invoice PDF</small>
                </dd>
              </div>
              <div>
                <dt>date_due</dt>
                <dd>
                  29 October 2026 <small>from later email observation</small>
                </dd>
              </div>
            </dl>
            <p className="plan-inspector-trace">Field provenance · date_due → later observation</p>
          </section>
          <section className="plan-inspector-card" aria-label="Observation history">
            <h4>Observation history</h4>
            <ol className="plan-inspector-history">
              <li>
                <strong>Later email</strong>
                <span>date_due: 29 October 2026</span>
                <small>Source: supplied email</small>
              </li>
              <li>
                <strong>Invoice PDF</strong>
                <span>date_due: 22 October 2026 · amount_due: 3,200 USD</span>
                <small>Source: supplied invoice</small>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
