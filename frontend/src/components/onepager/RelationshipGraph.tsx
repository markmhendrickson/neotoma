/** A static, typed record graph for the synthetic invoice story. */
export function RelationshipGraph({ es }: { es: boolean }) {
  return (
    <figure className="plan-relationship-graph">
      <div className="plan-relationship-scroll" tabIndex={0} aria-label={es ? "Desplaza el grafo de relaciones horizontalmente" : "Scroll the relationship graph horizontally"}>
      <svg viewBox="0 0 540 250" role="img" aria-label={es ? "Grafo de registros: la factura INV-2041 se refiere a Acme; el correo y la tarea de seguimiento se refieren a la factura" : "Record graph: invoice INV-2041 refers to Acme; the email and follow-up task refer to the invoice"}>
        <defs><marker id="plan-relationship-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="currentColor" /></marker></defs>
        <g className="plan-relationship-edges" fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#plan-relationship-arrow)">
          <path d="M290 123 H361" />
          <path d="M175 70 Q205 82 222 105" />
          <path d="M175 193 Q205 173 222 147" />
        </g>
        <g className="plan-relationship-node plan-relationship-invoice"><rect x="220" y="93" width="72" height="64" rx="8" /><text x="256" y="118" textAnchor="middle">INV-2041</text><text x="256" y="139" textAnchor="middle">invoice</text></g>
        <g className="plan-relationship-node"><rect x="370" y="99" width="132" height="52" rx="8" /><text x="436" y="122" textAnchor="middle">Acme</text><text x="436" y="140" textAnchor="middle">company</text></g>
        <g className="plan-relationship-node"><rect x="24" y="24" width="152" height="54" rx="8" /><text x="100" y="47" textAnchor="middle">{es ? "Cambio de fecha" : "Due date update"}</text><text x="100" y="66" textAnchor="middle">email</text></g>
        <g className="plan-relationship-node"><rect x="24" y="176" width="152" height="54" rx="8" /><text x="100" y="199" textAnchor="middle">{es ? "Seguimiento" : "Follow up"}</text><text x="100" y="218" textAnchor="middle">task</text></g>
      </svg>
      </div>
      <figcaption>{es ? "Tres relaciones REFERS_TO entre registros tipados." : "Three REFERS_TO relationships between typed records."} <span className="plan-relationship-scroll-hint">{es ? "Desliza para ver todo el grafo." : "Swipe to see the full graph."}</span></figcaption>
    </figure>
  );
}
