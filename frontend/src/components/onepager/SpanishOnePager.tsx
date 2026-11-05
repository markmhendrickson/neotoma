import { Link } from "react-router-dom";
import type { RefObject } from "react";
import { Clock } from "lucide-react";
import { AnimatedLockup } from "./AnimatedLockup";
import { PaperScene } from "./PaperScene";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { ToolInstall } from "./ToolInstall";
import { ComparisonRail, comparisonIcons } from "./ComparisonRail";
import { RECALL_VS_RECORD_ES } from "./spanish_comparison_copy";
import { InterfaceExplorer } from "./InterfaceExplorer";
import { VisionGallery } from "./VisionGallery";
import { ProductBenefitPills } from "./ProductBenefitPills";
import { EvaluationCard } from "./EvaluationCard";

const steps = [
  ["Fuente", "Conserva el material original", "Facilita el PDF o el correo de la factura como fuente para poder inspeccionar su contenido.", "/es/provenance/"],
  ["Observación", "Extrae y registra hechos", "Un agente extrae los campos de la factura del PDF y la nueva fecha de vencimiento del correo posterior. Registra cada hecho como una observación vinculada a su fuente.", "/es/observations/"],
  ["Entidad", "Identifica la entidad de forma determinista", "Ambas observaciones comparten número de factura, proveedor y fecha de emisión, por lo que corresponden a la misma entidad. Sus fechas de vencimiento pueden ser distintas.", "/es/record-model/"],
  ["Valores actuales", "Calcula los valores actuales", "Neotoma aplica automáticamente la regla del campo. Aquí cambia el vencimiento y el PDF sigue aportando el importe.", "/es/schemas/"],
  ["Instantánea", "Lee el valor actual", "La instantánea muestra los valores seleccionados por las reglas y las observaciones que los respaldan.", "/es/current-snapshot/"],
] as const;

const legend = [
  "Dos fuentes discrepan sobre una factura: el PDF indica vencimiento el 22 de octubre y un correo posterior el 29 de octubre.",
  "Cada fuente se convierte en una observación. Aquí, una regla de última escritura por campo calcula el valor actual.",
  "El vencimiento pasa al 29 de octubre. El campo modificado apunta a la observación posterior.",
  "El importe sigue viniendo de la primera observación. Ambas permanecen registradas.",
  "Los agentes escriben cada fuente como observación y leen la instantánea actual. Las escrituras por MCP también registran el nombre de cliente que declara el cliente.",
] as const;

export function SpanishOnePager({ pageRef }: { pageRef: RefObject<HTMLElement> }) {
  return <div>
    <a className="plan-skip" href="#plan-content">Ir al contenido</a>
    <main className="plan plan-home plan-home-es" id="top" ref={pageRef}>
      <section className="plan-sheet plan-hero plan-ground-paper" aria-labelledby="s1">
        <SiteHeader home brand={<AnimatedLockup />} pageLocale="es" />
        <div className="plan-hero-copy" id="plan-content" tabIndex={-1}>
          <div><p className="plan-label">Un registro, no un recuerdo</p><h1 id="s1">El <span className="plan-hero-phrase">sistema de registro</span> para agentes de IA.</h1>
            <ProductBenefitPills />
          </div>
          <div className="plan-hero-aside"><p className="plan-lede">Da a tus agentes hechos operativos que puedan leer, actualizar y mantener mientras trabajan.</p>
            <div className="plan-actions"><Link to="/es/install" className="plan-btn plan-btn-primary">Instalar</Link><span className="plan-install-time"><Clock size={14} aria-hidden="true" /> Lleva unos minutos</span></div>
          </div>
        </div>
        <figure className="plan-scene plan-hero-scene"><PaperScene scene="hero" /><figcaption>Las personas pueden inspeccionar los registros conservados mientras los agentes autorizados leen y escriben en la misma instancia configurada de Neotoma. Tú eliges qué herramientas y fuentes conectar.</figcaption></figure>
      </section>
      <EvaluationCard id="evaluate-intro" headingId="evaluate-intro-title" compact />
      <section className="plan-sheet plan-ground-paper" aria-labelledby="s2" id="fit">
        <header className="plan-sheet-head"><p className="plan-label">01 · Comparar</p><h2 id="s2">El recuerdo y un sistema de registro responden a preguntas distintas</h2></header>
        <p className="plan-body">La memoria y la recuperación ayudan a conservar y encontrar contexto. Un sistema de registro calcula valores actuales a partir de observaciones aceptadas y conserva el camino hasta las pruebas de cada campo.</p>
        <p className="plan-body plan-fit-note">Neotoma está dirigido a desarrolladores y operadores cuyos agentes trabajan con hechos que cambian entre herramientas. Tú eliges qué entra en la instancia local y qué herramientas la utilizan.</p>
        <div className="plan-contrast"><article><figure><PaperScene scene="before" /><figcaption><p className="plan-label">Sin sistema de registro</p><h3>El agente solo recuerda lo que conservó su contexto.</h3><p>Los hechos pertinentes quedan dispersos en contextos separados, sin un valor actual seleccionado de forma explícita.</p></figcaption></figure></article>
          <article><figure><PaperScene scene="after" /><figcaption><p className="plan-label">Con sistema de registro</p><h3>Los agentes recuperan hechos actuales, cambios anteriores y sus fuentes.</h3><p>Un registro presenta los valores seleccionados y mantiene conectadas las observaciones que los respaldan.</p></figcaption></figure></article></div>
        <ComparisonRail />
        <div className="plan-table-wrap"><table className="plan-table"><caption className="plan-sr">Recuerdo frente a sistema de registro</caption><thead><tr><th scope="col">Pregunta</th><th scope="col">Recuerdo</th><th scope="col">Sistema de registro</th></tr></thead><tbody>{RECALL_VS_RECORD_ES.map(({question:q, recall:r, record:s}, index) => { const RecallIcon = comparisonIcons[index][0]; const RecordIcon = comparisonIcons[index][1]; return <tr key={q}><th scope="row" data-label="Pregunta">{q}</th><td data-label="Recuerdo"><span className="plan-table-value"><RecallIcon aria-hidden="true" size={22} strokeWidth={1.6} />{r}</span></td><td data-label="Sistema de registro"><span className="plan-table-value"><RecordIcon aria-hidden="true" size={22} strokeWidth={1.6} />{s}</span></td></tr>; })}</tbody></table></div>
        <Link to="/es/compare" className="plan-compare-link">Compara con más detalle el recuerdo, la recuperación y los registros <span aria-hidden="true">→</span></Link>
      </section>
      <section className="plan-sheet plan-ground-band" aria-labelledby="s3" id="how-it-works">
        <header className="plan-sheet-head"><p className="plan-label">02 · Seguir un registro</p><h2 id="s3">Cómo un hecho pasa a ser actual</h2></header>
        <div className="plan-invoice-story" id="example"><p className="plan-label">Ejemplo</p><p>La factura INV-2041 llega en PDF con vencimiento el 22 de octubre. Un correo facilitado después cambia el vencimiento al 29 de octubre de 2026. Un agente conectado ve el valor seleccionado del 29 de octubre y puede inspeccionar qué observación lo proporcionó. El importe sigue viniendo del PDF.</p></div>
        <ol className="plan-section-cut">{steps.map(([name,label,body,href], i) => <li key={name}><div className="plan-step-copy"><span className="plan-label">Paso {String(i+1).padStart(2,"0")} · {name}</span><h3>{label}</h3><p>{body}</p><a href={href}>Lee la guía</a></div><figure className="plan-step-art"><PaperScene scene={(["source","observation","entity","reducer","snapshot"] as const)[i]} /></figure></li>)}</ol>
        <aside className="plan-example" aria-label="Ejemplo de factura ficticia"><p className="plan-label">Una factura, cinco partes</p><div className="plan-example-content"><figure><PaperScene scene="invoiceExample" /></figure><ol className="plan-legend">{legend.map((item,i)=><li key={item}><span className="plan-key" aria-hidden="true">{i+1}</span><span>{item}</span></li>)}</ol></div></aside>
      </section>
      <section id="interfaces" className="plan-sheet plan-ground-paper plan-interface-sheet" aria-labelledby="interface-title"><span id="inspect" className="plan-anchor" aria-hidden="true" /><header className="plan-sheet-head"><p className="plan-label">03 · Interfaces</p><h2 id="interface-title">Cuatro maneras de trabajar con un registro</h2></header>
        <InterfaceExplorer /></section>
      <section className="plan-sheet plan-ground-paper" aria-labelledby="s5" id="connect"><header className="plan-sheet-head"><p className="plan-label">04 · Conectar</p><h2 id="s5">Empieza en tu herramienta de IA preferida</h2></header>
        <div className="plan-split"><figure className="plan-scene plan-local-scene"><PaperScene scene="localService" /></figure><div><p className="plan-body">Neotoma puede ejecutarse localmente o detrás de un punto de acceso autenticado. Los agentes conectados usan MCP, la API REST o la CLI para leer y escribir registros en una instancia configurada.</p><p className="plan-body">Configura cada herramienta con la misma instancia y el mismo perfil de datos para trabajar con los mismos registros; distintas entradas pueden utilizar bases de datos separadas. La aplicación incluida permite inspeccionarlos.</p></div></div>
        <ToolInstall />
      </section>
      <section className="plan-sheet plan-ground-band" aria-labelledby="s6" id="vision"><header className="plan-sheet-head"><p className="plan-label">05 · Avanzado</p><h2 id="s6">Amplía tu uso a medida que llegan funciones avanzadas</h2></header>
        <VisionGallery />
      </section>
      <EvaluationCard id="evaluate" headingId="s7" mark="06 · Evaluar" title="Evalúa el encaje" body="Pide a tu agente que compare Neotoma con tus flujos y herramientas. Puede identificar dónde ayudaría un sistema de registro y dónde basta lo que ya utilizas." />
      <SiteFooter pageLocale="es" />
    </main>
  </div>;
}
