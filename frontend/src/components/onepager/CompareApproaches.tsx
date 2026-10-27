import { Link } from "react-router-dom";
import { SiteFooter, SiteHeader, SiteSkipLink } from "./SiteChrome";
import { SeoHead } from "@/components/SeoHead";
import { neotomaGithubBlobUrl } from "@/site/neotoma_repo";
import "./onepager.css";
import { useLocation } from "react-router-dom";
import { useLocale } from "@/i18n/LocaleContext";

/** Bounded continuation of the selected October comparison's editorial core. */
const comparisons = [
  {
    title: "Session and project memory",
    strength:
      "Useful instructions, preferences and project context can carry between interactions.",
    question:
      "Can you identify a current field, its evidence and prior corrections independently of one tool?",
    href: "https://code.claude.com/docs/en/memory",
    link: "Claude Code memory",
  },
  {
    title: "Files and document retrieval",
    strength:
      "Original material remains available, with relevant passages, file history and citations where configured.",
    question:
      "How do changing or conflicting claims become explicit current state rather than another passage to reconcile?",
  },
  {
    title: "Memory services",
    strength: "Persistent agent memory can include self-hosted options and configurable retrieval.",
    question:
      "Does the configured service supply the field evidence, correction and time contract your work needs?",
    href: "https://docs.mem0.ai/open-source/overview",
    link: "Mem0 open-source overview",
  },
  {
    title: "Workflow or custom state",
    strength:
      "Thread checkpoints and cross-thread application data can persist under a state model you define.",
    question:
      "Who defines and maintains entity identity, source attribution, corrections and resolved state?",
    href: "https://docs.langchain.com/oss/python/langgraph/persistence",
    link: "LangGraph persistence",
  },
  {
    title: "Neotoma",
    strength:
      "Typed, connected records provide an inspectable current and prior basis outside one model vendor.",
    question:
      "A running service, deliberate writes and configured readers are necessary. Evidence supports review, not automatic correctness.",
    href: neotomaGithubBlobUrl("docs/foundation/core_identity.md"),
    link: "System-of-record scope",
  },
] as const;

const comparisonsEs = [
  { title: "Memoria de sesión y proyecto", strength: "Las instrucciones útiles, las preferencias y el contexto del proyecto pueden mantenerse entre interacciones.", question: "¿Puedes identificar un campo actual, sus pruebas y las correcciones anteriores sin depender de una sola herramienta?", href: comparisons[0].href, link: "Memoria de Claude Code" },
  { title: "Recuperación de archivos y documentos", strength: "El material original sigue disponible, con pasajes pertinentes, historial de archivos y citas cuando está configurado.", question: "¿Cómo pasan las afirmaciones cambiantes o contradictorias a ser un estado actual explícito en vez de otro pasaje que reconciliar?" },
  { title: "Servicios de memoria", strength: "La memoria persistente para agentes puede ofrecer instalación propia y recuperación configurable.", question: "¿El servicio configurado ofrece el contrato de pruebas por campo, correcciones y tiempo que exige tu trabajo?", href: comparisons[2].href, link: "Introducción a Mem0 de código abierto" },
  { title: "Estado de flujo o a medida", strength: "Los puntos de control y los datos de aplicación entre hilos pueden persistir bajo un modelo de estado que defines.", question: "¿Quién define y mantiene la identidad de entidades, la atribución de fuentes, las correcciones y el estado resuelto?", href: comparisons[3].href, link: "Persistencia de LangGraph" },
  { title: "Neotoma", strength: "Los registros tipados y conectados ofrecen una base actual y anterior inspeccionable fuera de un solo proveedor de modelos.", question: "Necesitas un servicio en marcha, escrituras deliberadas y lectores configurados. Las pruebas permiten revisar, pero no garantizan corrección automática.", href: comparisons[4].href, link: "Alcance del sistema de registro (en inglés)" },
] as const;

export function CompareApproaches() {
  const location = useLocation();
  const es = useLocale().locale === "es";
  return (
    <div className="plan">
      <SeoHead routePath={location.pathname} />
      <SiteSkipLink />
      <div className="plan-sheet plan-hero">
        <SiteHeader />
      </div>
      <main className="plan-compare-page" id="main" tabIndex={-1}>
        <p className="plan-label">{es ? "Comparar enfoques" : "Compare approaches"}</p>
        <h1>{es ? "El recuerdo, la recuperación y un sistema de registro cumplen funciones distintas." : "Recall, retrieval and a system of record solve different jobs."}</h1>
        <p className="plan-lede">
          {es ? "Conserva el recuerdo y la recuperación cuando resulten útiles. Añade un sistema de registro explícito cuando el trabajo dependa de qué es actual y por qué." : "Keep useful recall and retrieval. Add an explicit system of record when work depends on what is current and why."}
        </p>
        <div className="plan-compare-grid">
          {(es ? comparisonsEs : comparisons).map((item) => (
            <article key={item.title}>
              <h2>{item.title}</h2>
              <h3>{es ? "Lo que hace bien" : "What it does well"}</h3>
              <p>{item.strength}</p>
              <h3>{item.title === "Neotoma" ? (es ? "Qué hay que tener en cuenta" : "What to account for") : (es ? "La pregunta que conviene hacer" : "The question to ask")}</h3>
              <p>{item.question}</p>
              {"href" in item && <a href={item.href}>{item.link}</a>}
            </article>
          ))}
        </div>
        <section className="plan-compare-close">
          <h2>{es ? "Elige el contrato que tu trabajo necesita." : "Choose the contract your work needs."}</h2>
          <p>
            {es ? "Compara el comportamiento configurado que necesitas con los flujos y herramientas que ya utilizas." : "Evaluate the configured behavior you need against the workflows and tools you already use."}
          </p>
          <p className="plan-small">
            {es ? "Esta comparación continúa la revisión editorial del 6 de octubre de 2026; no es una prueba comparativa de productos competidores." : "This comparison continues the October 6th, 2026 editorial review; it is not a benchmark of competing products."}
          </p>
          <Link to={es ? "/es/#evaluate" : "/#evaluate"}>{es ? "Evalúa el encaje" : "Evaluate the fit"}</Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
