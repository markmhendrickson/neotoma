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
  assessHeading: string;
  assessIntro: string;
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
  storeFirstHeading: string;
  storeFirstIntro: string;
  storeFirstItems: readonly string[];
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
  agentEvaluationPrompt: `Read https://neotoma.io/evaluate and tell me whether Neotoma fits my workflow.`,
  onboardingSequenceLiteral: "evaluation -> installation -> activation -> tooling config",
  activationSequenceLiteral:
    "detect context -> discover -> propose -> preview -> ingest -> query -> correct",
  introP1:
    "A record, not recall. Neotoma is the system of record for AI agents. Without one, an agent works from whatever it happens to recall: part of the last session, a note its tool saved, or nothing. With one, it reads what was stored, from which source, and what is current now, so the agents you connect can defer to one answer. It is open source (MIT), local-first, and runs as an npm package with an MCP server, REST API and CLI.",
  introP2BeforeLink:
    "This page contains the facts an agent needs to judge whether Neotoma fits a given workflow. Read it end to end, then use the assessment prompt below. To skip the evaluation and install directly, go to the ",
  introInstallLink: "install page",
  introP2After: " for agent-assisted setup, manual commands, Docker, and integration docs.",
  assessHeading: "Assess fit with your agent",
  assessIntro:
    "Once you have the facts above, hand the assessment to your AI agent. Paste this prompt into Claude, Cursor, ChatGPT, or any MCP-capable tool. The agent reads this page, inspects your real workspace and session context, and gives you an honest fit assessment - what to store first, where to start, and any tool constraints.",
  promptToUseLabel: "Evaluation prompt",
  whatNeotomaHeading: "What Neotoma does for you",
  whatNeotomaP1:
    "Neotoma stores each fact as an observation linked to its source. When a fact changes, a new observation is added and the earlier one stays, and each current field names the observation that set it. Agents connected to the same MCP entry read the same record.",
  whatNeotomaP2:
    "Under the hood, raw input is stored once, each extracted fact becomes an observation, and merge rules per field compute the current value from the observations. It runs locally as an npm package with MCP, CLI, and API interfaces. It is not a chat log or a vector store, and it can sit beside tools that retain or retrieve context.",
  agentInstructionsCardTitle: "Agent: evaluation instructions \u2192",
  agentInstructionsCardDesc:
    "Step-by-step evaluation workflow for AI agents, including context sweep, install trial, fit assessment, and resource map.",
  whoForHeading: "Who Neotoma is built for",
  whoForP:
    "People who run AI agents across their life - tools like Claude, Cursor, ChatGPT, and OpenClaw, working on contacts, tasks, finances, code, content, and other domains - and who are tired of holding the state together by hand. They are technically fluent: they would install an npm package and configure an MCP server, but they would not write one from scratch. Today that state lives in markdown files, a growing agent instructions file, and maybe a database they already know is a dead end.",
  strongFitHeading: "Strong fit signals",
  strongFitBullets: [
    "Uses 3+ AI tools regularly",
    "Runs agents that persist across sessions (not single-turn Q&A)",
    "Experiences context loss when switching between tools",
    "Has built automation, scripts, or custom configs around AI tools",
    "Spends time re-prompting, copy-pasting, or manually syncing context",
    "Has built their own system for keeping agent data (markdown, JSON, SQLite, custom scripts)",
    "Experiences agents behaving differently across sessions with no trace of why",
    "Needs to debug, trace, or audit agent decisions",
    "Manages evolving data over time (contacts, tasks, finances, projects, health)",
    "Sees building and maintaining their own store for agent data as a distraction from real work, rather than an appealing project",
  ],
  notFitHeading: "Likely not a fit right now",
  notFitBullets: [
    "No agent or AI-tool workflows",
    "Human drives every turn (AI as thought partner, not autonomous pipeline)",
    "Building a record or data store for agents as a product (agent data management is your core value prop)",
    "Needs a fully hosted product with nothing running on your own machine (Neotoma is local-first by design; installation today is npm and CLI, and a guided installer is intended but not yet available)",
    "Satisfied with platform memory (Claude, ChatGPT built-in memory)",
    "Looking for a note-taking or personal knowledge management app",
    'Needs "AI remembering things" without concern for sources, history, or audit',
    "No debugging, tracing, or compliance needs",
    "Single-session usage pattern only (agents don't persist across sessions)",
    "Occasional AI use (weekly or less - insufficient frequency for the pain to compound)",
  ],
  storeFirstHeading: "What to store first",
  storeFirstIntro:
    "If Neotoma is a fit, these are the highest-value starting points, ordered by how quickly they deliver value:",
  storeFirstItems: [
    "Conversations, contacts, tasks, decisions - store from day one with zero config. Each is stored as an observation linked to its source.",
    "Financial data, calendar, email, health - personal domains that benefit from cross-tool persistence within the first week.",
    "Content pipeline, project context, agent config - as more of your work moves through agents over weeks 2-4.",
    "Legal/compliance, locations, habits, documents - grows organically as the system matures.",
  ],
  nextStepsHeading: "Next steps",
  nextStepsP1BeforeOnboarding: "The onboarding sequence is ",
  nextStepsOnboardingLink: "evaluation -> installation -> activation -> tooling config",
  nextStepsP1Between: ". Inside activation, the agent runs ",
  nextStepsActivationLink: "detect context -> discover -> propose -> preview -> ingest -> query -> correct",
  nextStepsP1After: ".",
  nextStepsOlEvaluation:
    "Evaluation: Assess fit, identify tool constraints, and determine what data should be stored first.",
  nextStepsInstallationBeforeNpm: "Installation: If needed, run ",
  nextStepsInstallationBetweenCommands: " then ",
  nextStepsInstallationAfterInit:
    " If already installed, verify the setup and move on.",
  nextStepsOlActivation:
    "Activation: Run the discovery flow, get explicit confirmation, ingest confirmed data, and offer a follow-up query plus correction.",
  nextStepsOlTooling:
    "Tooling config: After activation, configure the tool the user is in for the most robust ongoing Neotoma workflow.",
  nextStepsP2BeforeInstallGuide: "See the full ",
  nextStepsInstallGuideLink: "installation guide",
  nextStepsP2Between: " for details, or explore ",
  nextStepsArchLink: "architecture",
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
Entry point:     [the specific use case you recommended]
Next step:       install / learn more / revisit later

Score the user on where their agent-data pain lands, never on whether they could
build their own store for it themselves. Willingness to install an npm package and
configure an MCP server is the bar; writing that infrastructure from scratch
is not. Someone whose state currently lives in markdown files and a growing
agent instructions file is a strong fit, not an incomplete one.`,
  scorecardP2: "After generating the scorecard, offer to send it to the Neotoma team:",
  scorecardOl1:
    "If you have email-sending capability (e.g. an email MCP tool, API integration, or other sending mechanism), ask the user for permission, then send the scorecard directly to contact@neotoma.io with the subject line \"Agent evaluation scorecard\".",
  scorecardOl2:
    "If you cannot send email, draft a ready-to-send email for the user: compose the scorecard as the body, set the recipient to contact@neotoma.io, the subject to \"Agent evaluation scorecard\", and present it so the user can copy, paste, and send with one action.",
  scorecardFooter: "Either way, sharing is entirely optional - only proceed if the user agrees.",
};

export const EVALUATE_SUBPAGE_ES: EvaluatePageStrings = {
  title: "Evaluar Neotoma",
  agentEvaluationPrompt: `Lee https://neotoma.io/evaluate y dime si Neotoma encaja en mi flujo de trabajo.`,
  onboardingSequenceLiteral: EVALUATE_SUBPAGE_EN.onboardingSequenceLiteral,
  activationSequenceLiteral: EVALUATE_SUBPAGE_EN.activationSequenceLiteral,
  introP1:
    "Un registro, no recuerdo. Neotoma es el sistema de registro para agentes de IA. Sin uno, un agente trabaja con lo que le toque recordar: parte de la última sesión, una nota que guardó su herramienta, o nada. Con uno, lee lo que se almacenó, de qué fuente y qué es actual ahora, de modo que los agentes que conectas puedan atenerse a una sola respuesta. Es de código abierto (MIT), local primero y funciona como paquete npm con servidor MCP, API REST y CLI.",
  introP2BeforeLink:
    "Esta página contiene los hechos que un agente necesita para juzgar si Neotoma encaja en un flujo concreto. Léela completa y luego usa el prompt de evaluación de abajo. Para saltarte la evaluación e instalar directamente, ve a la ",
  introInstallLink: "página de instalación",
  introP2After:
    " para configuración asistida por agente, comandos manuales, Docker y documentación de integración.",
  assessHeading: "Evalúa el encaje con tu agente",
  assessIntro:
    "Cuando tengas los hechos de arriba, entrega la evaluación a tu agente de IA. Pega este prompt en Claude, Cursor, ChatGPT o cualquier herramienta compatible con MCP. El agente lee esta página, inspecciona tu espacio de trabajo y contexto de sesión reales, y te da una valoración honesta de encaje: qué guardar primero, por dónde empezar y cualquier restricción de herramienta.",
  promptToUseLabel: "Prompt de evaluación",
  whatNeotomaHeading: "Qué hace Neotoma por ti",
  whatNeotomaP1:
    "Neotoma almacena cada hecho como una observación enlazada a su fuente. Cuando un hecho cambia, se añade una observación nueva y la anterior permanece, y cada campo actual indica la observación que lo fijó. Los agentes conectados a la misma entrada MCP leen el mismo registro.",
  whatNeotomaP2:
    "Por debajo, la entrada en bruto se almacena una vez, cada hecho extraído se convierte en una observación y las reglas de fusión por campo calculan el valor actual a partir de las observaciones. Funciona en local como paquete npm con MCP, CLI y API. No es un registro de chat ni un almacén vectorial, y puede convivir con herramientas que retienen o recuperan contexto.",
  agentInstructionsCardTitle: "Agente: instrucciones de evaluación \u2192",
  agentInstructionsCardDesc:
    "Flujo de evaluación paso a paso para agentes de IA: barrido de contexto, prueba de instalación, valoración de encaje y mapa de recursos.",
  whoForHeading: "Para quién está hecho Neotoma",
  whoForP:
    "Personas que usan agentes de IA en su vida - herramientas como Claude, Cursor, ChatGPT y OpenClaw, sobre contactos, tareas, finanzas, código, contenido y otros dominios - y que están cansadas de sostener el estado a mano. Tienen soltura técnica: instalarían un paquete npm y configurarían un servidor MCP, pero no lo escribirían desde cero. Hoy ese estado vive en archivos markdown, un archivo de instrucciones del agente que no para de crecer y quizá una base de datos que ya saben que no lleva a ninguna parte.",
  strongFitHeading: "Señales de buen encaje",
  strongFitBullets: [
    "Usa 3+ herramientas de IA con regularidad",
    "Ejecuta agentes que persisten entre sesiones (no solo Q&A de un turno)",
    "Pierde contexto al cambiar de herramienta",
    "Ha automatizado, scripteado o configurado a medida alrededor de la IA",
    "Pierde tiempo re-prompteando, copiando y pegando o sincronizando estado a mano",
    "Ha montado su propio sistema para guardar datos de agentes (markdown, JSON, SQLite, scripts)",
    "Ve comportamientos distintos entre sesiones sin trazabilidad",
    "Necesita depurar, trazar o auditar decisiones de agentes",
    "Gestiona datos que evolucionan (contactos, tareas, finanzas, proyectos, salud)",
    "Considera que construir y mantener su propio almacén de datos de agentes es una distracción del trabajo real, no un proyecto atractivo",
  ],
  notFitHeading: "Probablemente no encaja ahora",
  notFitBullets: [
    "Sin flujos de agentes ni herramientas de IA",
    "El humano conduce cada turno (IA como sparring, no pipeline autónomo)",
    "Construye un registro o almacén de datos para agentes como producto (el valor es la gestión de datos de agentes)",
    "Necesita un producto totalmente alojado, sin nada ejecutándose en su propia máquina (Neotoma es local-first por diseño; hoy la instalación es por npm y CLI, y un instalador guiado está previsto pero aún no disponible)",
    "Está satisfecho con la memoria de plataforma (Claude, ChatGPT)",
    "Busca una app de notas o PKM",
    "Quiere que la IA recuerde sin importarle las fuentes, el historial ni la auditoría",
    "Sin necesidades de depuración, trazas o cumplimiento",
    "Solo uso en una sesión (los agentes no persisten)",
    "Uso ocasional de IA (semanal o menos: poca fricción acumulada)",
  ],
  storeFirstHeading: "Qué guardar primero",
  storeFirstIntro:
    "Si Neotoma encaja, estos son los puntos de partida de mayor valor, ordenados por rapidez de retorno:",
  storeFirstItems: [
    "Conversaciones, contactos, tareas, decisiones: desde el día uno sin configuración extra. Cada uno se guarda como una observación enlazada a su fuente.",
    "Finanzas, calendario, correo, salud: dominios personales que ganan con persistencia entre herramientas en la primera semana.",
    "Pipeline de contenido, contexto de proyecto, configuración del agente: a medida que más trabajo tuyo pase por agentes en semanas 2-4.",
    "Legal/cumplimiento, ubicaciones, hábitos, documentos: crece con el sistema.",
  ],
  nextStepsHeading: "Próximos pasos",
  nextStepsP1BeforeOnboarding: "La secuencia de onboarding es ",
  nextStepsOnboardingLink: EVALUATE_SUBPAGE_EN.nextStepsOnboardingLink,
  nextStepsP1Between: ". En activación, el agente ejecuta ",
  nextStepsActivationLink: EVALUATE_SUBPAGE_EN.nextStepsActivationLink,
  nextStepsP1After: ".",
  nextStepsOlEvaluation:
    "Evaluación: Valorar encaje, restricciones de herramienta y qué datos guardar primero.",
  nextStepsInstallationBeforeNpm: "Instalación: Si hace falta, ejecuta ",
  nextStepsInstallationBetweenCommands: " y luego ",
  nextStepsInstallationAfterInit: ". Si ya está instalado, verifica la configuración y continúa.",
  nextStepsOlActivation:
    "Activación: Flujo de descubrimiento, confirmación explícita, ingesta de lo confirmado y ofrecer seguimiento más corrección.",
  nextStepsOlTooling:
    "Configuración de herramientas: Tras la activación, configura la herramienta activa para el flujo Neotoma más robusto.",
  nextStepsP2BeforeInstallGuide: "Consulta la ",
  nextStepsInstallGuideLink: "guía de instalación",
  nextStepsP2Between: " completa, o explora ",
  nextStepsArchLink: "arquitectura",
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
Entry point:     [the specific use case you recommended]
Next step:       install / learn more / revisit later

Score the user on where their agent-data pain lands, never on whether they could
build their own store for it themselves. Willingness to install an npm package and
configure an MCP server is the bar; writing that infrastructure from scratch
is not. Someone whose state currently lives in markdown files and a growing
agent instructions file is a strong fit, not an incomplete one.`,
  scorecardP2: "Tras generar la tarjeta, ofrece enviarla al equipo de Neotoma:",
  scorecardOl1:
    "Si puedes enviar correo (p. ej. herramienta MCP de email, API, etc.), pide permiso y envía la tarjeta a contact@neotoma.io con asunto \"Agent evaluation scorecard\".",
  scorecardOl2:
    "Si no puedes enviar correo, redacta un correo listo para enviar: cuerpo con la tarjeta, destinatario contact@neotoma.io, asunto \"Agent evaluation scorecard\", presentado para copiar y enviar en un paso.",
  scorecardFooter: "En cualquier caso, compartir es opcional: solo si el usuario acepta.",
};
