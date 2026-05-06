import type { HomeBodyPack } from "@/i18n/locales/home_body_types";
import {
  CLI_DEMO_AGENTIC_SCENARIOS_ES,
  CLI_DEMO_API_SCENARIOS_ES,
  CLI_DEMO_CHAT_SCENARIOS_ES,
  CLI_DEMO_CLI_SCENARIOS_ES,
} from "@/i18n/locales/cli_demo_scenarios_es";

/** Spanish homepage body — canonical non-English reference for Romance-clone locales until native review. */
export const HOME_BODY_ES: HomeBodyPack = {
  outcomes: {
    kicker: "Antes y después",
    heading: "La misma pregunta, resultado distinto",
    subtitle:
      "Sin memoria compartida, los agentes actúan con datos que no pueden verificar. Con Neotoma, cada respuesta lee un historial versionado y estructurado.",
    withoutNeotoma: "sin Neotoma",
    withNeotoma: "con Neotoma",
    bridgeLabel: "con Neotoma",
  },
  guaranteePreviewCards: [
    {
      slug: "deterministic-state-evolution",
      property: "Estado determinista",
      failure:
        "Ejecutas la misma canalización dos veces y obtienes resultados distintos — sin forma de saber por qué.",
      status: "guaranteed",
    },
    {
      slug: "versioned-history",
      property: "Historial versionado",
      failure: "Un reintento sobrescribe en silencio una preferencia. El original desaparece.",
      status: "guaranteed",
    },
    {
      slug: "auditable-change-log",
      property: "Registro de cambios auditable",
      failure:
        "Tu agente toma una mala decisión. No puedes rastrear en qué datos se basó.",
      status: "guaranteed",
    },
    {
      slug: "silent-mutation-risk",
      property: "Prevención de mutación silenciosa",
      failure: "Los datos cambian sin que lo sepas. Te enteras cuando algo se rompe.",
      status: "prevented",
    },
    {
      slug: "schema-constraints",
      property: "Restricciones de esquema",
      failure:
        "Un agente escribe un registro mal formado. Nada lo rechaza — los errores se acumulan en silencio.",
      status: "guaranteed",
    },
    {
      slug: "reproducible-state-reconstruction",
      property: "Reconstrucción reproducible",
      failure: "Tu base de datos se corrompe. No hay camino de vuelta a un estado conocido bueno.",
      status: "guaranteed",
    },
  ],
  guaranteeStatusLabels: { guaranteed: "Garantizado", prevented: "Evitado" },
  faqPreview: [
    {
      q: "¿La memoria de plataforma (Claude, ChatGPT) no basta? ¿Por qué otra herramienta?",
      a: "La memoria de plataforma guarda lo que un proveedor decide recordar, en un formato que no puedes inspeccionar ni exportar. No versiona, no detecta conflictos y desaparece si cambias de herramienta. Neotoma te da memoria estructurada y multi-herramienta bajo tu control.",
    },
    {
      q: "¿No puedo construir esto con SQLite o un archivo JSON?",
      a: "Puedes empezar ahí — muchos equipos lo hacen. Pero acabarás necesitando versionado, detección de conflictos, evolución de esquema y sincronización multi-herramienta. Son meses de infraestructura. Neotoma trae esas garantías desde el día uno.",
    },
    {
      q: "¿Está listo para producción?",
      a: "Neotoma está en vista previa para desarrolladores — usado a diario en flujos reales. Las garantías núcleo (memoria determinista, historial versionado, registro solo anexado) son estables. Instala en 5 minutos y deja que tu agente evalúe el encaje.",
    },
    {
      q: "¿Neotoma sustituye la memoria de Claude o la de ChatGPT?",
      a: "No — convive con ellas. La memoria de plataforma guarda lo que un proveedor decide dentro de su herramienta. Neotoma guarda hechos que controlas en todas tus herramientas. Sigue usando la memoria de plataforma para contexto rápido; usa Neotoma cuando necesites versionado, auditabilidad y coherencia multi-herramienta.",
    },
    {
      q: "¿Neotoma envía mis datos a la nube?",
      a: "No. Neotoma se ejecuta en local por defecto. Tus datos permanecen en tu máquina en una base SQLite local. Sin sincronización en la nube, sin telemetría y sin entrenar con tus datos salvo que expongas tú la API (por ejemplo para clientes MCP remotos).",
    },
    {
      q: "¿Qué diferencia hay entre memoria RAG y memoria determinista?",
      a: "RAG guarda fragmentos de texto y los recupera por similitud. Neotoma guarda hechos estructurados y construye un historial versionado para cada uno; las mismas entradas siempre producen el mismo resultado. RAG optimiza relevancia; la memoria determinista optimiza integridad, versionado y auditabilidad.",
    },
    {
      q: "¿La memoria se degrada o deriva con el tiempo?",
      a: "No. Neotoma usa un registro de observaciones solo anexado con reductores deterministas. Nada se sobrescribe ni se pierde en silencio. Los hechos guardados hace seis meses son tan recuperables y verificables como los de hoy — con historial de versiones y procedencia intactos. La memoria se acumula; no decae.",
    },
  ],
  scenarios: [
    {
      left: "Usa el nuevo correo que te di para Sarah.",
      fail: "Enviado a sarah@oldcompany.com.",
      succeed: "Enviado a sarah@newstartup.io, actualizado el 28 mar. Correo anterior conservado en v2.",
      version: "contact·v3",
    },
    {
      left: "¿Qué dije que haría seguimiento con Nick?",
      fail: "No hay elementos de seguimiento.",
      succeed: "Te comprometiste a enviar el documento de arquitectura el viernes.",
      version: "task·v2",
    },
    {
      left: "¿Cuánto gasté en cloud el mes pasado?",
      fail: "No hay gastos de hosting.",
      succeed: "847 $ en AWS y Vercel, +12% respecto a febrero.",
      version: "transaction·v5",
    },
    {
      left: "¿Por qué mi agente publicó ese tuit ayer?",
      fail: "No hay registro de acción en Twitter.",
      succeed: "Borrador desde tu canalización de contenido, aprobado en sesión #412.",
      version: "decision·v3",
    },
    {
      left: "Continúa donde lo dejamos ayer.",
      fail: "Reanudando hilo de hace dos semanas.",
      succeed: "Reanudando el hilo de ayer sobre el plan de migración.",
      version: "conversation·v7",
    },
    {
      left: "¿Qué acordamos originalmente con Acme Corp en octubre?",
      fail: "No hay registros de octubre.",
      succeed:
        "Términos originales del 12 oct: compromiso 18 meses, 4200 $/mes, cláusula de salida 90 días. Enmendado el 8 ene a 4800 $/mes.",
      version: "contract·v3",
    },
    {
      left: "¿Qué sesión de agente actualizó mi lista de contactos?",
      fail: "No hay historial de sesiones.",
      succeed: "Sesión #389 en Cursor añadió 3 contactos desde triage de correo.",
      version: "agent_session·v2",
    },
    {
      left: "¿Se pagó la factura de Acme Corp?",
      fail: "Impago al 2 feb.",
      succeed: "Pagada el 14 feb mediante transferencia Wise.",
      version: "transaction·v3",
    },
    {
      left: "Muestra mis tareas abiertas en todos los proyectos.",
      fail: "Mostrando 18 elementos abiertos.",
      succeed: "Mostrando 7 abiertas, 3 vencen esta semana.",
      version: "task·v5",
    },
    {
      left: "Envía esa actualización a Alex de la llamada de la semana pasada.",
      fail: "No hay contacto llamado Alex.",
      succeed: "Enviando a Alex Rivera, conocido en demo del 24 mar.",
      version: "contact·v4",
    },
    {
      left: "¿Cuándo es mi próxima cita esta semana?",
      fail: "No hay eventos próximos.",
      succeed: "Jueves 10h, dentista. Viernes 16h, llamada con Simon.",
      version: "event·v2",
    },
  ],
  outcomeCards: [
    {
      category: "Contactos y personas",
      failTitle: "Sobrescrito en silencio, equivocado con confianza",
      failDescription:
        "Corregiste el correo de un contacto la semana pasada. Otra sesión de agente lo sobrescribió con la dirección antigua. Tu agente envía a la persona equivocada y nadie lo nota hasta que es tarde.",
      successTitle: "Cada versión conservada, correcciones verificadas",
      successDescription:
        "El correo antiguo y el nuevo quedan en el historial versionado. Tu agente trabaja con los hechos actuales verificados y puedes ver exactamente cuándo y por qué cambió cada valor.",
      scenarioIndex: 0,
    },
    {
      category: "Tareas y compromisos",
      failTitle: "Seguimiento olvidado, compromiso perdido",
      failDescription:
        "Dijiste «enviaré ese documento el viernes» en una llamada. Ningún agente lo registró. El lunes, el compromiso desapareció — sin recordatorio ni rastro.",
      successTitle: "Cada compromiso persistido, en cada sesión",
      successDescription:
        "Las tareas y compromisos se capturan desde la conversación con fechas límite y contexto. Tu agente los muestra antes de que se escapen — entre sesiones y herramientas.",
      scenarioIndex: 1,
    },
    {
      category: "Datos financieros",
      failTitle: "Transacción ausente, saldo incorrecto",
      failDescription:
        "Preguntaste por el gasto del mes pasado. Tu agente no recuerda las transacciones que registraste hace dos semanas en otra herramienta. Empiezas de cero.",
      successTitle: "Transacciones versionadas, totales coherentes",
      successDescription:
        "Cada transacción se guarda con historial completo y trazabilidad de fuente. Pregunta desde cualquier herramienta y los números coinciden — sin volver a introducir datos ni respuestas contradictorias.",
      scenarioIndex: 2,
    },
    {
      category: "Decisiones y procedencia",
      failTitle: "Sin rastro del porqué actuó el agente",
      failDescription:
        "Tu agente publicó un tuit, envió un correo o hizo una recomendación. Cuando preguntas por qué, no hay registro del razonamiento ni de los datos usados.",
      successTitle: "Pista de auditoría completa para cada acción",
      successDescription:
        "Cada decisión se guarda con sus entradas, razonamiento y sesión que la produjo. Cuando preguntas «¿por qué hiciste eso?», el agente puede mostrártelo con exactitud.",
      scenarioIndex: 3,
    },
  ],
  recordTypes: {
    kicker: "Qué almacenar",
    heading: "¿No sabes por dónde empezar?",
    headingAccent: "Elige tres.",
    subtitle:
      "Tus contactos, tareas y eventos desaparecen entre sesiones y herramientas. Guárdalos una vez, versionados y consultables en cada agente que ejecutes, y deja de re-explicar tu mundo.",
    startHereBadge: "Empieza aquí",
    viewFullGuideCta: "Ver guía completa",
    seeAllGuaranteesCta: "Ver las {count} garantías comparadas",
    cards: [
      {
        label: "Contactos",
        description: "Personas, empresas, roles y las relaciones entre ellos.",
      },
      {
        label: "Tareas",
        description: "Obligaciones, plazos, hábitos y objetivos entre sesiones.",
      },
      {
        label: "Eventos",
        description: "Reuniones, hitos y resultados asociados.",
      },
      {
        label: "Transacciones",
        description: "Pagos, recibos, facturas y asientos contables versionados, no sobrescritos.",
      },
      {
        label: "Contratos",
        description: "Acuerdos, cláusulas y enmiendas con los términos exactos conservados en el tiempo.",
      },
      {
        label: "Decisiones",
        description: "Elecciones, razonamiento y la pista de auditoría que prueba por qué actuó un agente.",
      },
    ],
  },
  who: {
    kicker: "Para quién es",
    titleLine1: "Usas agentes de IA en serio...",
    titleLine2: "...y pagas el coste de no tener memoria",
    subtitle:
      "Volver a indicar contexto malgasta tiempo y tokens. El riesgo mayor es cuando tu agente actúa con seguridad sobre hechos erróneos y no te enteras hasta que el daño está hecho.",
    calloutHeading: "¿Ya construyes tu propio sistema de memoria?",
    calloutBodyBeforeLink: "Muchos desarrolladores empiezan con SQLite, JSON, Markdown o un servidor MCP propio. Neotoma aporta ",
    calloutLink: "las garantías que de otro modo construirías y mantendrías tú",
    calloutBodyAfterLink: ": versionado, detección de conflictos, evolución de esquema y sincronización multi-herramienta.",
    calloutNotForLead: "No para ",
    calloutNotForLink: "flujos puntuales de lluvia de ideas o apps de notas",
    calloutNotForTrail: ".",
    icpCards: [
      {
        slug: "operating",
        modeLabel: "Sincronización multi-herramienta",
        name: "Eres el conserje de contexto entre herramientas",
        tagline:
          "Cada sesión empieza de cero. Vuelves a explicar contexto, repites correcciones y restableces lo que el agente ya sabía.",
        homepageTransition:
          "Deja de ser la capa humana de sincronización entre herramientas. Opera con continuidad — gobiernas en lugar de re-explicar.",
      },
      {
        slug: "building-pipelines",
        modeLabel: "Estado de canalización",
        name: "Cuidas la varianza de inferencia a mano",
        tagline:
          "Tu agente adivina entidades en cada ejecución. Las correcciones no persisten. Los regresiones llegan a producción porque la arquitectura no puede impedirlas.",
        homepageTransition:
          "Deja de cuidar la varianza de inferencia. Construye sobre terreno firme — estado que se mantiene corregido de una ejecución a otra.",
      },
      {
        slug: "debugging-infrastructure",
        modeLabel: "Reproducción y depuración",
        name: "Eres el arqueólogo de los registros",
        tagline: "Dos ejecuciones. Mismas entradas. Estado distinto. Sin reproducción, sin diff, sin explicación.",
        homepageTransition:
          "Deja de reconstruir la verdad desde logs. Depura con estado reproducible que puedes inspeccionar, comparar y confiar.",
      },
    ],
  },
  demo: {
    kicker: "Demo del producto",
    title: "Inspecciona, versiona, compara y reproduce lo que recuerdan tus agentes",
    subtitle:
      "Las mismas operaciones funcionan desde la CLI, la API REST, la app Inspector o cualquier agente conectado por MCP. Cambia de vista para probar cada interfaz.",
  },
  guarantees: {
    kicker: "Garantías",
    title: "Memoria que sigue siendo correcta de la sesión 1 al mes 12",
    subtitle:
      "La memoria de chat se desvanece. El RAG deriva. Markdown y JSON acumulan conflictos silenciosos. Neotoma impone versionado, procedencia y detección de manipulación que aguantan meses y años: no solo entre sesiones recientes.",
  },
  proof: {
    kicker: "Cómo se usa",
    blockquote:
      "En producción diaria más de 5 meses entre Claude Code, Cursor, ChatGPT y CLI. El mismo grafo de estado desde el día uno: cada versión conservada, cada corrección trazable. Los contactos evolucionan, los contratos se enmiendan, las tareas se cierran y se reabren. Pregunto a mis agentes qué cambió en un acuerdo desde octubre o qué dije originalmente a un inversor hace tres meses. La memoria se acumula; nada deriva en silencio.",
    founderPhotoAlt: "Mark Hendrickson",
    founderName: "Mark Hendrickson",
    founderRole: "Creador de Neotoma",
    readFullPost: "Leer el artículo completo",
    statsContacts: "contactos",
    statsTasks: "tareas",
    statsConversations: "conversaciones",
    statsAgentMessages: "mensajes de agente",
    statsEntityTypes: "tipos de entidad",
  },
  evaluate: {
    kicker: "Evalúalo",
    title: "Deja que tu agente decida si Neotoma encaja",
    subtitle:
      "Tu agente puede leer la documentación, revisar los criterios de evaluación y decirte si Neotoma encaja en tu flujo real antes de instalar nada.",
    promptHint:
      "Copia este prompt en cualquier agente de IA. Lee la página de evaluación, inspecciona tu contexto y juzga si Neotoma encaja.",
    evaluateIllustrationAlt: "Vista previa de la página de evaluación de Neotoma",
    homeEvaluatePrompt: `Lee https://neotoma.io/evaluate. Usa cualquier herramienta, espacio de trabajo y contexto de chat ya disponibles en esta sesión para evaluar mi flujo real. Evita introspección ad hoc en la shell solo para perfilarme; si Neotoma ya está instalado, usa \`neotoma doctor --json\` para el estado. Luego dime si Neotoma encaja en mi flujo, qué datos conviene persistir primero por valor y qué debería hacer a continuación.`,
    evaluatePromptPill: "Prompt de evaluación",
    evaluatePromptCardSubtitle:
      "Lee la página y evalúa el encaje frente a tu flujo real.",
    evaluatePromptCopy: "Copiar",
    evaluatePromptCopied: "Copiado",
    evaluatePromptCopyMobile: "Copiar prompt",
    evaluatePromptIntroBeforeTarget: "Copia este prompt en ",
    evaluatePromptIntroBetweenTargetAndLink: " para que lea ",
    evaluatePromptIntroLink: "la página de evaluación",
    evaluatePromptIntroAfterLink:
      ", revisa tu herramienta, espacio de trabajo y configuración, y juzga si Neotoma encaja en tu flujo real y qué conviene persistir primero.",
    evaluatePromptDefaultAgentTarget: "cualquier agente de IA",
  },
  commonQuestions: {
    moreQuestionsLink: "¿Más preguntas? Ver el FAQ",
  },
  hero: {
    trustLine: "Estado fiable para agentes de IA",
    releasesShipped: "versiones publicadas",
    heroStateCaption:
      "Los hechos se almacenan de forma privada bajo tu control. Cualquier agente recupera exactamente lo que necesita, con versionado y procedencia completos.",
    onGithubSuffix: " en GitHub",
    githubLabel: "GitHub",
  },
  stateFlow: {
    hero: {
      regionAriaLabel:
        "Flujo de ejemplo: cuentas a un agente una factura, guarda estado estructurado, pregunta despu\u00e9s a otro agente y obtiene una respuesta fundamentada",
      youTellProduct: "Le dices a OpenClaw",
      invoiceQuote:
        "\u201cHe emitido a Acme una factura de 3.200 $ con vencimiento el 15 de dic.\u201d",
      storedLabel: "Guardado en facturas",
      storedSub:
        "tipo: invoice \u00b7 importe: 3.200 $ \u00b7 vencimiento: 2026-12-15 \u00b7 estado: impagado \u00b7 REFERS_TO empresa: Acme",
      youAskProduct: "M\u00e1s tarde le preguntas a Claude",
      balanceQuote: "\u201c\u00bfCu\u00e1l es mi saldo pendiente total?\u201d",
      answerBold: "16.302 $",
      answerRest: " de 4 facturas impagadas, 2 vencidas",
      answerFootnote: "Recuperado de facturas almacenadas y relaciones",
    },
    technical: {
      regionAriaLabel:
        "Canalizaci\u00f3n de estado de Neotoma: desde la fuente y observaciones hasta instant\u00e1neas y el grafo de memoria",
      pipelineKicker: "canalizaci\u00f3n de estado de neotoma",
      layers: [
        { label: "Fuente", sub: "entidades estructuradas \u00b7 MCP \u00b7 CLI \u00b7 API" },
        { label: "Observaciones", sub: "hechos granulares + procedencia" },
        { label: "Instant\u00e1neas de entidad", sub: "verdad actual \u00b7 versionada" },
        { label: "Grafo de memoria", sub: "entidades \u00b7 relaciones \u00b7 l\u00ednea temporal" },
      ],
      operations: ["registrar", "reducir", "relacionar"] as const,
      replayHint: "\u21bb reproducir \u00b7 inspecciona cualquier estado pasado",
    },
  },
  cliDemo: {
    modeTabs: {
      chat: "Chat",
      cli: "CLI",
      mcp: "MCP",
      api: "API",
      inspector: "Inspector",
    },
    chatPlaceholder: "Pregunta lo que quieras\u2026",
    playPause: { pauseLabel: "Pausar demo", playLabel: "Reproducir demo" },
    installCta: "Instalar en 5 minutos",
    chatScenarios: CLI_DEMO_CHAT_SCENARIOS_ES,
    cliScenarios: CLI_DEMO_CLI_SCENARIOS_ES,
    agenticScenarios: CLI_DEMO_AGENTIC_SCENARIOS_ES,
    apiScenarios: CLI_DEMO_API_SCENARIOS_ES,
  },
  agentToolChips: {
    ariaLabel: "Agentes de IA y herramientas",
    worksWith: "Funciona con",
  },
  quotes: [
    { text: "Integridad de estado, no calidad de recuperación.", attribution: "Creador de apps agénticas" },
    {
      text: "Problema muy relevante; la mayoría se lo construye en casa.",
      attribution: "Laurie Voss, cofundador de npm",
    },
    {
      text: "Genuinamente útil para agentes de producción; exceso para chatbots aficionados.",
      attribution: "Evaluador de agentes de producción",
    },
    {
      text: "CI/CD para el estado de los agentes.",
      attribution: "Tycho Onnasch, cofundador, Zest Protocol",
    },
  ],
  sectionNavAria: {
    previous: "Ir a la sección anterior",
    next: "Ir a la sección siguiente",
    quoteDot: "Ir a la cita",
  },
};
