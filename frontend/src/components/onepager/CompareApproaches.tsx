import { Link } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";
import { neotomaGithubBlobUrl } from "@/site/neotoma_repo";
import "./onepager.css";

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

export function CompareApproaches() {
  return (
    <main className="plan plan-compare-page" id="main">
      <SeoHead routePath="/compare" />
      <div className="plan-compare-head">
        <Link to="/">Neotoma</Link>
        <Link to="/install">Install guide</Link>
      </div>
      <p className="plan-label">Compare approaches</p>
      <h1>Recall, retrieval and a system of record solve different jobs.</h1>
      <p className="plan-lede">
        Keep useful recall and retrieval. Add an explicit system of record when work depends on what
        is current and why.
      </p>
      <div className="plan-compare-grid">
        {comparisons.map((item) => (
          <article key={item.title}>
            <h2>{item.title}</h2>
            <h3>What it does well</h3>
            <p>{item.strength}</p>
            <h3>{item.title === "Neotoma" ? "What to account for" : "The question to ask"}</h3>
            <p>{item.question}</p>
            {"href" in item && <a href={item.href}>{item.link}</a>}
          </article>
        ))}
      </div>
      <section className="plan-compare-close">
        <h2>Choose the contract your work needs.</h2>
        <p>
          Evaluate the configured behavior you need against the workflows and tools you already use.
        </p>
        <p className="plan-small">
          This comparison continues the October 6th, 2026 editorial review; it is not a benchmark of
          competing products.
        </p>
        <Link to="/#evaluate">Evaluate the fit</Link>
      </section>
    </main>
  );
}
