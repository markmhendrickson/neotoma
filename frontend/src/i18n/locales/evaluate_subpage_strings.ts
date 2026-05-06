/**
 * Full copy for `/evaluate` (EvaluatePage). English is canonical; Spanish overrides via subpage pack merge.
 * Technical literals (onboarding / activation sequences) stay English for agent interoperability.
 */

export interface EvaluatePageStrings {
  title: string;
  agentEvaluationPrompt: string;
  onboardingSequenceLiteral: string;
  activationSequenceLiteral: string;
  introP1: string;
  introP2BeforeLink: string;
  introInstallLink: string;
  introP2After: string;
  promptToUseLabel: string;
  whatNeotomaHeading: string;
  whatNeotomaP1: string;
  whatNeotomaP2: string;
  agentInstructionsCardTitle: string;
  agentInstructionsCardDesc: string;
  whoForHeading: string;
  whoForP: string;
  strongFitHeading: string;
  strongFitBullets: readonly string[];
  notFitHeading: string;
  notFitBullets: readonly string[];
  taxHeading: string;
  taxIntro: string;
  taxLi1Strong: string;
  taxLi1BeforeLink: string;
  taxLi1LinkMemoryModels: string;
  taxLi2Strong: string;
  taxLi2BeforeLink: string;
  taxLi2LinkArchitecture: string;
  taxLi3Strong: string;
  taxLi3BeforeLink: string;
  taxLi3LinkGuarantees: string;
  storeFirstHeading: string;
  storeFirstIntro: string;
  storeFirstItems: readonly string[];
  comparesHeading: string;
  comparesIntro: string;
  comparesItems: readonly string[];
  nextStepsHeading: string;
  nextStepsP1BeforeOnboarding: string;
  nextStepsOnboardingLink: string;
  nextStepsP1Between: string;
  nextStepsActivationLink: string;
  nextStepsP1After: string;
  nextStepsOlEvaluation: string;
  nextStepsInstallationBeforeNpm: string;
  /** Between the two <code> command snippets in the installation list item. */
  nextStepsInstallationBetweenCommands: string;
  nextStepsInstallationAfterInit: string;
  nextStepsOlActivation: string;
  nextStepsOlTooling: string;
  nextStepsP2BeforeInstallGuide: string;
  nextStepsInstallGuideLink: string;
  nextStepsP2Between: string;
  nextStepsArchLink: string;
  nextStepsP2And: string;
  nextStepsGuaranteesLink: string;
  nextStepsP2End: string;
  nextStepsEmailP: string;
  scorecardHeading: string;
  scorecardP1: string;
  scorecardPre: string;
  scorecardP2: string;
  scorecardOl1: string;
  scorecardOl2: string;
  scorecardFooter: string;
}

export const EVALUATE_SUBPAGE_EN: EvaluatePageStrings = {
  title: "Evaluate Neotoma",
  agentEvaluationPrompt: `Read https://neotoma.io/evaluate. Use any tool, workspace, and chat context already available in this session to assess my real workflow. Avoid ad-hoc shell introspection just to profile me; if Neotoma is already installed, use \`neotoma doctor --json\` for status instead. Then tell me whether Neotoma is a real fit for my workflow, what data would be highest value to persist first, and what I should do next.`,
  onboardingSequenceLiteral: "evaluation -> installation -> activation -> tooling config",
  activationSequenceLiteral:
    "detect context -> discover -> propose -> preview -> ingest -> reconstruct -> query -> correct",
  introP1:
    "This page is designed so your AI agent can read it and help you evaluate whether Neotoma fits your workflow, then carry you through the same agent-driven sequence regardless of which tool you start in. Ask your agent to visit this page first.",
  introP2BeforeLink:
    "If you already plan to install and want to skip this evaluation flow, go straight to the ",
  introInstallLink: "install page",
  introP2After: " for agent-assisted setup, manual commands, Docker, and integration docs.",
  promptToUseLabel: "Prompt to use",
  whatNeotomaHeading: "What Neotoma does for you",
  whatNeotomaP1:
    "Neotoma lets your agents pick up where they left off: across sessions, across tools, without you re-explaining anything. Store a fact once and every agent works from the same truth. Correct something once and the correction sticks everywhere.",
  whatNeotomaP2:
    "Under the hood, Neotoma is a deterministic state layer: every change is versioned, every entity is schema-bound, and every state can be replayed from the observation log. It runs locally as an npm package with MCP, CLI, and API interfaces. Not retrieval memory (RAG or vector search), but structured, auditable state you control.",
  agentInstructionsCardTitle: "Agent: evaluation instructions \u2192",
  agentInstructionsCardDesc:
    "Step-by-step evaluation workflow for AI agents, including context sweep, install trial, fit assessment, and resource map.",
  whoForHeading: "Who Neotoma is built for",
  whoForP:
    "People building a personal operating system with AI agents across their life - wiring together tools like Claude, Cursor, ChatGPT, OpenClaw, and custom scripts to manage contacts, tasks, finances, code, content, and other domains. The same person operates their agents, builds new pipelines, and debugs state drift.",
  strongFitHeading: "Strong fit signals",
  strongFitBullets: [
    "Uses 3+ AI tools regularly",
    "Runs agents that persist across sessions (not single-turn Q&A)",
    "Experiences context loss when switching between tools",
    "Has built automation, scripts, or custom configs around AI tools",
    "Spends time re-prompting, copy-pasting, or manually syncing context",
    "Has built their own memory system (markdown, JSON, SQLite, custom scripts)",
    "Experiences agents behaving differently across sessions with no trace of why",
    "Needs to debug, trace, or audit agent decisions",
    "Manages evolving data over time (contacts, tasks, finances, projects, health)",
    "Comfortable installing tools via npm and working with CLIs",
  ],
  notFitHeading: "Likely not a fit right now",
  notFitBullets: [
    "No agent or AI-tool workflows",
    "Human drives every turn (AI as thought partner, not autonomous pipeline)",
    "Building a state layer as a product (state management is your core value prop)",
    "Needs zero-install, no-config onboarding (Neotoma requires npm and CLI today)",
    "Satisfied with platform memory (Claude, ChatGPT built-in memory)",
    "Looking for a note-taking or personal knowledge management app",
    'Needs "AI remembering things" without concern for versioning, replay, or audit',
    "No debugging, tracing, or compliance needs",
    "Single-session usage pattern only (agents don't persist across sessions)",
    "Occasional AI use (weekly or less - insufficient frequency for memory pain to compound)",
  ],
  taxHeading: "Where the tax shows up",
  taxIntro:
    "The same person pays the tax in three ways: not separate personas, but facets of the same workflow. Understanding which one dominates helps identify where Neotoma delivers value first. Each maps to a different proof surface if you want to go deeper.",
  taxLi1Strong: "Context janitor",
  taxLi1BeforeLink:
    ": you re-explain context every session, re-prompt corrections, manually sync state between tools. What you get back: attention, continuity, trust in your tools. See ",
  taxLi1LinkMemoryModels: "memory models",
  taxLi2Strong: "Inference variance",
  taxLi2BeforeLink:
    ": your agent guesses entities every session. Corrections don't persist. Memory regressions ship because the architecture can't prevent them. What you get back: product velocity, shipping confidence, roadmap ambition. See ",
  taxLi2LinkArchitecture: "architecture",
  taxLi3Strong: "Log archaeology",
  taxLi3BeforeLink:
    ": two runs, same inputs, different state. No replay, no diff, no explanation. You write checkpoint logic, custom diffing, and state serialization code. What you get back: debugging speed, platform design time. See ",
  taxLi3LinkGuarantees: "memory guarantees",
  storeFirstHeading: "What to store first",
  storeFirstIntro:
    "If Neotoma is a fit, these are the highest-value starting points, ordered by how quickly they deliver value:",
  storeFirstItems: [
    "Conversations, contacts, tasks, decisions - store from day one with zero config. Creates an audit trail and compounds immediately.",
    "Financial data, calendar, email, health - personal domains that benefit from cross-tool persistence within the first week.",
    "Content pipeline, project context, agent config - as the personal OS matures over weeks 2-4.",
    "Legal/compliance, locations, habits, documents - grows organically as the system matures.",
  ],
  comparesHeading: "How Neotoma compares",
  comparesIntro: "Users considering Neotoma typically compare it to:",
  comparesItems: [
    "Platform memory (Claude memory, ChatGPT memory) - tool-specific and non-auditable. Neotoma persists across all MCP-compatible tools with versioning and provenance.",
    "RAG / vector memory (Mem0, Zep) - re-derives structure every session. Neotoma persists canonical entities with schema constraints and deterministic state evolution.",
    "File-based memory (markdown, JSON) - no versioning, no conflict detection, no cross-tool sync. Neotoma provides all three.",
    "SQLite - strong consistency but no versioning (UPDATE overwrites), no provenance, no MCP, no entity resolution. Neotoma uses SQLite internally and adds the state layer on top.",
    "PKM tools (Obsidian, Notion) - designed for humans managing notes. Neotoma is infrastructure for agents managing structured state.",
  ],
  nextStepsHeading: "Next steps",
  nextStepsP1BeforeOnboarding: "The onboarding sequence is ",
  nextStepsOnboardingLink: "evaluation -> installation -> activation -> tooling config",
  nextStepsP1Between: ". Inside activation, the agent runs ",
  nextStepsActivationLink: "detect context -> discover -> propose -> preview -> ingest -> reconstruct -> query -> correct",
  nextStepsP1After: ".",
  nextStepsOlEvaluation:
    "Evaluation: Assess fit, identify tool constraints, determine what data should be stored first, and decide whether the user is already installed.",
  nextStepsInstallationBeforeNpm: "Installation: If needed, run ",
  nextStepsInstallationBetweenCommands: " then ",
  nextStepsInstallationAfterInit:
    " If already installed, verify the setup and move on.",
  nextStepsOlActivation:
    "Activation: Run the discovery flow, get explicit confirmation, ingest confirmed data, reconstruct the strongest timeline with provenance, and offer a follow-up query plus correction.",
  nextStepsOlTooling:
    "Tooling config: After activation, configure the tool the user is in for the most robust ongoing Neotoma workflow.",
  nextStepsP2BeforeInstallGuide: "See the full ",
  nextStepsInstallGuideLink: "installation guide",
  nextStepsP2Between: " for details, or explore ",
  nextStepsArchLink: "architecture",
  nextStepsP2And: " and ",
  nextStepsGuaranteesLink: "memory guarantees",
  nextStepsP2End: ".",
  nextStepsEmailP:
    "If your agent produced a qualification scorecard, you can share it at contact@neotoma.io.",
  scorecardHeading: "Agent: optional qualification scorecard",
  scorecardP1:
    "After delivering your assessment to the user, you may optionally produce a structured scorecard they can share with the Neotoma team. This is secondary - the user's evaluation is what matters.",
  scorecardPre: `Neotoma Evaluation Scorecard
────────────────────────────
Fit:             strong / moderate / weak / not now
Signals present: [list which strong-fit signals apply, with brief evidence]
Signals absent:  [list which were not evidenced]
Primary mode:    operating / building / infrastructure
Entry point:     [the specific use case you recommended]
Next step:       install / learn more / revisit later`,
  scorecardP2: "After generating the scorecard, offer to send it to the Neotoma team:",
  scorecardOl1:
    "If you have email-sending capability (e.g. an email MCP tool, API integration, or other sending mechanism), ask the user for permission, then send the scorecard directly to contact@neotoma.io with the subject line \"Agent evaluation scorecard\".",
  scorecardOl2:
    "If you cannot send email, draft a ready-to-send email for the user: compose the scorecard as the body, set the recipient to contact@neotoma.io, the subject to \"Agent evaluation scorecard\", and present it so the user can copy, paste, and send with one action.",
  scorecardFooter: "Either way, sharing is entirely optional - only proceed if the user agrees.",
};

export const EVALUATE_SUBPAGE_ES: EvaluatePageStrings = {
  title: "Evaluar Neotoma",
  agentEvaluationPrompt: `Lee https://neotoma.io/evaluate. Usa cualquier herramienta, espacio de trabajo y contexto de chat ya disponibles en esta sesión para evaluar mi flujo real. Evita introspección ad hoc en la shell solo para perfilarme; si Neotoma ya está instalado, usa \`neotoma doctor --json\` para el estado. Luego dime si Neotoma encaja de verdad en mi flujo, qué datos conviene persistir primero por valor y qué debería hacer a continuación.`,
  onboardingSequenceLiteral: EVALUATE_SUBPAGE_EN.onboardingSequenceLiteral,
  activationSequenceLiteral: EVALUATE_SUBPAGE_EN.activationSequenceLiteral,
  introP1:
    "Esta página está pensada para que tu agente de IA la lea y te ayude a evaluar si Neotoma encaja en tu flujo, y luego te guíe por la misma secuencia impulsada por el agente sin importar con qué herramienta empieces. Pide a tu agente que visite primero esta página.",
  introP2BeforeLink:
    "Si ya piensas instalar y quieres saltarte esta evaluación, ve directamente a la ",
  introInstallLink: "página de instalación",
  introP2After:
    " para configuración asistida por agente, comandos manuales, Docker y documentación de integración.",
  promptToUseLabel: "Prompt a usar",
  whatNeotomaHeading: "Qué hace Neotoma por ti",
  whatNeotomaP1:
    "Neotoma permite que tus agentes retomen donde lo dejaron: entre sesiones y herramientas, sin que vuelvas a explicar todo. Guarda un hecho una vez y todos los agentes trabajan con la misma verdad. Corrige una vez y la corrección perdura.",
  whatNeotomaP2:
    "Por debajo, Neotoma es una capa de estado determinista: cada cambio está versionado, cada entidad va ligada a un esquema y el estado puede reproducirse desde el registro de observaciones. Funciona en local como paquete npm con MCP, CLI y API. No es memoria de recuperación (RAG ni búsqueda vectorial), sino estado estructurado y auditable bajo tu control.",
  agentInstructionsCardTitle: "Agente: instrucciones de evaluación \u2192",
  agentInstructionsCardDesc:
    "Flujo de evaluación paso a paso para agentes de IA: barrido de contexto, prueba de instalación, valoración de encaje y mapa de recursos.",
  whoForHeading: "Para quién está hecho Neotoma",
  whoForP:
    "Personas que construyen un sistema operativo personal con agentes de IA en su vida: conectando herramientas como Claude, Cursor, ChatGPT, OpenClaw y scripts propios para gestionar contactos, tareas, finanzas, código, contenido y otros dominios. La misma persona opera sus agentes, construye pipelines y depura el desvío de estado.",
  strongFitHeading: "Señales de buen encaje",
  strongFitBullets: [
    "Usa 3+ herramientas de IA con regularidad",
    "Ejecuta agentes que persisten entre sesiones (no solo Q&A de un turno)",
    "Pierde contexto al cambiar de herramienta",
    "Ha automatizado, scripteado o configurado a medida alrededor de la IA",
    "Pierde tiempo re-prompteando, copiando y pegando o sincronizando estado a mano",
    "Ha montado su propia memoria (markdown, JSON, SQLite, scripts)",
    "Ve comportamientos distintos entre sesiones sin trazabilidad",
    "Necesita depurar, trazar o auditar decisiones de agentes",
    "Gestiona datos que evolucionan (contactos, tareas, finanzas, proyectos, salud)",
    "Se instala herramientas vía npm y trabaja con CLI sin problema",
  ],
  notFitHeading: "Probablemente no encaja ahora",
  notFitBullets: [
    "Sin flujos de agentes ni herramientas de IA",
    "El humano conduce cada turno (IA como sparring, no pipeline autónomo)",
    "Construye una capa de estado como producto (el valor es la gestión de estado)",
    "Quiere onboarding cero-instalación (Neotoma hoy requiere npm y CLI)",
    "Está satisfecho con la memoria de plataforma (Claude, ChatGPT)",
    "Busca una app de notas o PKM",
    "Quiere que la IA recuerde sin versionado, reproducción ni auditoría",
    "Sin necesidades de depuración, trazas o cumplimiento",
    "Solo uso en una sesión (los agentes no persisten)",
    "Uso ocasional de IA (semanal o menos: poca fricción acumulada)",
  ],
  taxHeading: "Dónde se paga el coste",
  taxIntro:
    "La misma persona paga el coste de tres maneras: facetas del mismo flujo, no personajes distintos. Ver cuál domina ayuda a ver dónde Neotoma aporta valor primero. Cada una enlaza a una superficie de prueba si quieres profundizar.",
  taxLi1Strong: "Conserje de contexto",
  taxLi1BeforeLink:
    ": vuelves a explicar el contexto cada sesión, re-prompteas correcciones y sincronizas estado entre herramientas a mano. Recuperas atención, continuidad y confianza en tus herramientas. Ver ",
  taxLi1LinkMemoryModels: "modelos de memoria",
  taxLi2Strong: "Varianza de inferencia",
  taxLi2BeforeLink:
    ": el agente adivina entidades cada sesión. Las correcciones no persisten. Los regresos de memoria llegan a producción porque la arquitectura no los impide. Recuperas velocidad de producto y confianza para publicar. Ver ",
  taxLi2LinkArchitecture: "arquitectura",
  taxLi3Strong: "Arqueología de logs",
  taxLi3BeforeLink:
    ": dos ejecuciones, mismas entradas, distinto estado. Sin reproducción, diff ni explicación. Escribes checkpoints, diffs y serialización a mano. Recuperas velocidad de depuración y tiempo de diseño. Ver ",
  taxLi3LinkGuarantees: "garantías de memoria",
  storeFirstHeading: "Qué guardar primero",
  storeFirstIntro:
    "Si Neotoma encaja, estos son los puntos de partida de mayor valor, ordenados por rapidez de retorno:",
  storeFirstItems: [
    "Conversaciones, contactos, tareas, decisiones: desde el día uno sin configuración extra. Auditoría inmediata y efecto compuesto.",
    "Finanzas, calendario, correo, salud: dominios personales que ganan con persistencia entre herramientas en la primera semana.",
    "Pipeline de contenido, contexto de proyecto, configuración del agente: a medida que el OS personal madure en semanas 2-4.",
    "Legal/cumplimiento, ubicaciones, hábitos, documentos: crece con el sistema.",
  ],
  comparesHeading: "Cómo se compara Neotoma",
  comparesIntro: "Quienes evalúan Neotoma suelen compararlo con:",
  comparesItems: [
    "Memoria de plataforma (Claude, ChatGPT): específica de cada herramienta y poco auditable. Neotoma persiste en todas las herramientas compatibles con MCP con versionado y procedencia.",
    "Memoria RAG / vectorial (Mem0, Zep): re-deriva estructura cada sesión. Neotoma mantiene entidades canónicas con esquema y evolución de estado determinista.",
    "Memoria basada en archivos (markdown, JSON): sin versionado, sin detección de conflictos ni sincronización entre herramientas. Neotoma aporta las tres.",
    "SQLite: consistencia fuerte pero sin versionado de negocio (UPDATE machaca), sin procedencia ni MCP ni resolución de entidades. Neotoma usa SQLite por debajo y añade la capa de estado.",
    "Herramientas PKM (Obsidian, Notion): pensadas para humanos y notas. Neotoma es infraestructura para agentes y estado estructurado.",
  ],
  nextStepsHeading: "Próximos pasos",
  nextStepsP1BeforeOnboarding: "La secuencia de onboarding es ",
  nextStepsOnboardingLink: EVALUATE_SUBPAGE_EN.nextStepsOnboardingLink,
  nextStepsP1Between: ". En activación, el agente ejecuta ",
  nextStepsActivationLink: EVALUATE_SUBPAGE_EN.nextStepsActivationLink,
  nextStepsP1After: ".",
  nextStepsOlEvaluation:
    "Evaluación: Valorar encaje, restricciones de herramienta, qué datos guardar primero y si el usuario ya está instalado.",
  nextStepsInstallationBeforeNpm: "Instalación: Si hace falta, ejecuta ",
  nextStepsInstallationBetweenCommands: " y luego ",
  nextStepsInstallationAfterInit: ". Si ya está instalado, verifica la configuración y continúa.",
  nextStepsOlActivation:
    "Activación: Flujo de descubrimiento, confirmación explícita, ingesta de lo confirmado, reconstrucción de la línea temporal con procedencia, y ofrecer seguimiento más corrección.",
  nextStepsOlTooling:
    "Configuración de herramientas: Tras la activación, configura la herramienta activa para el flujo Neotoma más robusto.",
  nextStepsP2BeforeInstallGuide: "Consulta la ",
  nextStepsInstallGuideLink: "guía de instalación",
  nextStepsP2Between: " completa, o explora ",
  nextStepsArchLink: "arquitectura",
  nextStepsP2And: " y ",
  nextStepsGuaranteesLink: "garantías de memoria",
  nextStepsP2End: ".",
  nextStepsEmailP:
    "Si tu agente generó una tarjeta de cualificación, puedes compartirla en contact@neotoma.io.",
  scorecardHeading: "Agente: tarjeta de cualificación opcional",
  scorecardP1:
    "Tras dar tu valoración al usuario, puedes generar opcionalmente una tarjeta estructurada para el equipo de Neotoma. Es secundario: importa la evaluación del usuario.",
  scorecardPre: `Neotoma Evaluation Scorecard
────────────────────────────
Fit:             strong / moderate / weak / not now
Signals present: [list which strong-fit signals apply, with brief evidence]
Signals absent:  [list which were not evidenced]
Primary mode:    operating / building / infrastructure
Entry point:     [the specific use case you recommended]
Next step:       install / learn more / revisit later`,
  scorecardP2: "Tras generar la tarjeta, ofrece enviarla al equipo de Neotoma:",
  scorecardOl1:
    "Si puedes enviar correo (p. ej. herramienta MCP de email, API, etc.), pide permiso y envía la tarjeta a contact@neotoma.io con asunto \"Agent evaluation scorecard\".",
  scorecardOl2:
    "Si no puedes enviar correo, redacta un correo listo para enviar: cuerpo con la tarjeta, destinatario contact@neotoma.io, asunto \"Agent evaluation scorecard\", presentado para copiar y enviar en un paso.",
  scorecardFooter: "En cualquier caso, compartir es opcional: solo si el usuario acepta.",
};
