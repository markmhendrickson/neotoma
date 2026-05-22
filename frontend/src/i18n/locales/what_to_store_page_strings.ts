/**
 * `/what-to-store` marketing copy. Link targets stay paths; labels for harnesses stay English where product names.
 */

export interface WhatToStoreTierRow {
  category: string;
  examples: string;
}

export interface WhatToStoreExampleCard {
  title: string;
  beforeLabel: string;
  beforeText: string;
  afterLabel: string;
  afterText: string;
}

export interface WhatToStorePageStrings {
  title: string;
  introP1BeforeStrong: string;
  introStrong: string;
  introP1AfterStrong: string;
  introP2: string;
  sectionAgentsTitle: string;
  agentsP1BeforeCursor: string;
  agentsP1AfterCursor: string;
  agentsP1AfterClaude: string;
  agentsP1AfterChatgpt: string;
  agentsP1AfterMcp: string;
  linkHarnessCursor: string;
  linkHarnessClaude: string;
  linkHarnessChatgpt: string;
  linkHarnessMcpClient: string;
  agentsP2BeforeRecipes: string;
  linkStoreRecipes: string;
  agentsP2AfterRecipes: string;
  agentsP3BeforeCli: string;
  linkCli: string;
  agentsP3AfterCli: string;
  linkRestApi: string;
  agentsP3AfterApi: string;
  linkMcpTools: string;
  agentsP3AfterMcp: string;
  agentsP3End: string;
  sectionFlexibleTitle: string;
  flexibleP1BeforeRegistry: string;
  flexibleP1BetweenCodeAndRegistry: string;
  linkSchemaRegistry: string;
  flexibleP1AfterRegistry: string;
  flexibleP2BeforeTypes: string;
  flexibleP2AfterTypesBeforeNewType: string;
  flexibleP2AfterEntityType: string;
  linkAdditiveSchemaEvolution: string;
  flexibleP2AfterEvolution: string;
  flexibleP3BeforeRaw: string;
  flexibleP3AfterRawBeforeSee: string;
  linkSchemasOverview: string;
  flexibleP3BetweenOverviewAndMerge: string;
  linkMergePolicies: string;
  flexibleP3BetweenMergeAndStorage: string;
  linkStorageLayers: string;
  flexibleP3End: string;
  sectionTier1Title: string;
  tier1Intro: string;
  tier1Rows: WhatToStoreTierRow[];
  tableHeaderCategory: string;
  tableHeaderExamples: string;
  sectionTier2Title: string;
  tier2Intro: string;
  tier2Rows: WhatToStoreTierRow[];
  sectionTier3Title: string;
  tier3Intro: string;
  tier3Rows: WhatToStoreTierRow[];
  sectionExamplesTitle: string;
  exampleContacts: WhatToStoreExampleCard;
  exampleTask: WhatToStoreExampleCard;
  exampleDecision: WhatToStoreExampleCard;
  sectionHeuristicTitle: string;
  heuristicIntro: string;
  heuristicLi1Strong: string;
  heuristicLi1Body: string;
  heuristicLi2Strong: string;
  heuristicLi2Body: string;
  heuristicLi3Strong: string;
  heuristicLi3Body: string;
  heuristicLi4Strong: string;
  heuristicLi4Body: string;
  sectionNotStoreTitle: string;
  notStoreRows: WhatToStoreTierRow[];
  footerReady: string;
  linkInstallNeotoma: string;
  footerAfterInstall: string;
  linkWalkthrough: string;
  footerAfterWalkthrough: string;
  linkBackupRestore: string;
  footerEnd: string;
}

export const WHAT_TO_STORE_PAGE_EN: WhatToStorePageStrings = {
  title: "What to store",
  introP1BeforeStrong:
    "Neotoma stores any structured fact that benefits from deterministic state evolution, versioning, and provenance. The deciding question is not \u201cis this personal data?\u201d but ",
  introStrong: "does this fact benefit from being versioned, auditable, and reproducible?",
  introP1AfterStrong: "",
  introP2:
    "If an agent or user would later need to recall a fact, verify when it changed, trace why a decision was made, or reconstruct state at a point in time: it belongs in Neotoma.",
  sectionAgentsTitle: "Agents store for you",
  agentsP1BeforeCursor: "You do not need to decide what to store or call any APIs yourself. When Neotoma runs with an agent in ",
  agentsP1AfterCursor: ", ",
  agentsP1AfterClaude: ", ",
  agentsP1AfterChatgpt: ", or any ",
  agentsP1AfterMcp:
    ", the agent proactively extracts and stores entities from every conversation turn: people mentioned, tasks committed to, decisions made, and facts stated.",
  linkHarnessCursor: "Cursor",
  linkHarnessClaude: "Claude",
  linkHarnessChatgpt: "ChatGPT",
  linkHarnessMcpClient: "MCP-compatible client",
  agentsP2BeforeRecipes: "The agent follows ",
  linkStoreRecipes: "store recipes",
  agentsP2AfterRecipes:
    " that define how to persist conversations, extract entities from attachments, link related records, and preserve provenance without manual intervention. It applies the decision heuristic below on your behalf: if a fact has recall, audit, or relationship value, the agent stores it automatically.",
  agentsP3BeforeCli: "You can always store data manually via the ",
  linkCli: "CLI",
  agentsP3AfterCli: ", ",
  linkRestApi: "REST API",
  agentsP3AfterApi: ", or ",
  linkMcpTools: "MCP tools",
  agentsP3AfterMcp:
    ", correct what was stored, or tell your agent to stop storing specific categories. The default is proactive storage with human oversight, not the other way around.",
  agentsP3End: "",
  sectionFlexibleTitle: "Any entity type, any shape",
  flexibleP1BeforeRegistry:
    "Neotoma does not require you to define a schema before storing data. Store any entity with a descriptive ",
  flexibleP1BetweenCodeAndRegistry:
    " and whatever fields the data implies. The ",
  linkSchemaRegistry: "schema registry",
  flexibleP1AfterRegistry: " infers and evolves schemas automatically as new fields appear.",
  flexibleP2BeforeTypes: "Common types like ",
  flexibleP2AfterTypesBeforeNewType:
    " ship with sensible defaults, but you can create any type by storing an entity with a new ",
  flexibleP2AfterEntityType: ". Fields added later trigger ",
  linkAdditiveSchemaEvolution: "additive schema evolution",
  flexibleP2AfterEvolution: ", minor version bumps that never break existing data.",
  flexibleP3BeforeRaw: "Unknown fields are preserved in a ",
  flexibleP3AfterRawBeforeSee:
    " layer so nothing is silently dropped. As schemas mature, those fragments are promoted into the validated schema automatically. See ",
  linkSchemasOverview: "schemas overview",
  flexibleP3BetweenOverviewAndMerge: ", ",
  linkMergePolicies: "merge policies",
  flexibleP3BetweenMergeAndStorage: ", and ",
  linkStorageLayers: "storage layers",
  flexibleP3End: " for the full picture.",
  sectionTier1Title: "Tier 1 - High-value facts",
  tier1Intro: "Store these proactively from the first session.",
  tier1Rows: [
    {
      category: "People and relationships",
      examples: "Contacts, companies, organizations, role connections",
    },
    {
      category: "Commitments and tasks",
      examples: "Obligations, action items, deadlines, promises made",
    },
    {
      category: "Events and decisions",
      examples: "Meetings, milestones, choices with rationale",
    },
    {
      category: "Financial facts",
      examples: "Transactions, invoices, receipts, contracts, payments owed",
    },
  ],
  tableHeaderCategory: "Category",
  tableHeaderExamples: "Examples",
  sectionTier2Title: "Tier 2 - Contextual facts",
  tier2Intro: "Store when encountered in conversation, documents, or external tools.",
  tier2Rows: [
    {
      category: "Preferences and standards",
      examples: "User preferences, conventions, style guides, stated constraints",
    },
    {
      category: "Project context",
      examples: "Codebase entities, architectural decisions, release metadata, config",
    },
    {
      category: "Documents and artifacts",
      examples: "Uploaded files with extracted structure, reports, specifications",
    },
  ],
  sectionTier3Title: "Tier 3 - Derived context",
  tier3Intro: "Store when the derived record carries future recall, audit, or relationship value.",
  tier3Rows: [
    {
      category: "Conversations",
      examples: "Agent interactions with provenance (persisted per-turn)",
    },
    {
      category: "Session state",
      examples: "Active environment, running tools, current working context",
    },
    {
      category: "External data",
      examples: "Records pulled from email, calendar, web, APIs, other MCPs",
    },
  ],
  sectionExamplesTitle: "Before-and-after examples",
  exampleContacts: {
    title: "Contacts from a conversation",
    beforeLabel: "Before:",
    beforeText:
      "You mention \u201cClayton from Acme\u201d in a chat. Next session, the agent has no idea who Clayton is.",
    afterLabel: "After:",
    afterText:
      "Agent stores a contact entity with name, company, and a REFERS_TO link to the conversation. Next session, Clayton\u2019s full context is retrieved instantly.",
  },
  exampleTask: {
    title: "Task from a commitment",
    beforeLabel: "Before:",
    beforeText: "\u201cI need to follow up with Sarah by Friday.\u201d The commitment exists only in that session.",
    afterLabel: "After:",
    afterText:
      "Agent stores a task entity with title, due date, and REFERS_TO Sarah\u2019s contact. Task persists across sessions and tools.",
  },
  exampleDecision: {
    title: "Decision with rationale",
    beforeLabel: "Before:",
    beforeText: "You decide on PostgreSQL over MySQL. Three weeks later, no one remembers why.",
    afterLabel: "After:",
    afterText:
      "Agent stores a decision_note with rationale and context. The reasoning is versioned and traceable.",
  },
  sectionHeuristicTitle: "Decision heuristic",
  heuristicIntro: "When deciding whether to store something, apply this test. If any answer is yes, store it.",
  heuristicLi1Strong: "Recallability",
  heuristicLi1Body: ": Would an agent or user need this fact again in a future session?",
  heuristicLi2Strong: "Auditability",
  heuristicLi2Body: ": Would someone need to know when this was recorded or how it changed?",
  heuristicLi3Strong: "Reproducibility",
  heuristicLi3Body: ": Would reconstructing past state require this fact?",
  heuristicLi4Strong: "Relationship value",
  heuristicLi4Body: ": Does this connect to other entities (people, tasks, events)?",
  sectionNotStoreTitle: "What NOT to store",
  notStoreRows: [
    {
      category: "Ephemeral output",
      examples: "No future recall value; no benefit from versioning",
    },
    {
      category: "Duplicate records",
      examples: "Already in Neotoma; check before storing",
    },
    {
      category: "Inferred or predicted data",
      examples: "Neotoma stores facts, not guesses",
    },
    {
      category: "Unapproved data",
      examples: "Explicit user control required",
    },
    {
      category: "Credentials and secrets",
      examples: "Belong in secret managers, not state layers",
    },
  ],
  footerReady: "Ready to start? ",
  linkInstallNeotoma: "Install Neotoma",
  footerAfterInstall: ", then ",
  linkWalkthrough: "follow the walkthrough",
  footerAfterWalkthrough: " to see storage in action. See ",
  linkBackupRestore: "backup and restore",
  footerEnd: " to protect your data.",
};

/** Spanish overrides merged onto EN in `subpage_packs`. */
export const WHAT_TO_STORE_PAGE_ES: Partial<WhatToStorePageStrings> = {
  title: "Qu\u00e9 almacenar",
  introP1BeforeStrong:
    "Neotoma almacena cualquier hecho estructurado que se beneficie de la evoluci\u00f3n determinista del estado, el versionado y la procedencia. La pregunta decisiva no es \u00ab\u00bfson datos personales?\u00bb sino ",
  introStrong:
    "\u00bfeste hecho se beneficia de estar versionado, ser auditable y reproducible?",
  introP1AfterStrong: "",
  introP2:
    "Si un agente o usuario necesitar\u00e1 recordar un hecho, verificar cu\u00e1ndo cambi\u00f3, rastrear por qu\u00e9 se tom\u00f3 una decisi\u00f3n o reconstruir el estado en un momento dado: pertenece a Neotoma.",
  sectionAgentsTitle: "Los agentes almacenan por ti",
  agentsP1BeforeCursor:
    "No necesitas decidir qu\u00e9 almacenar ni llamar t\u00fa mismo a las APIs. Cuando Neotoma se ejecuta con un agente en ",
  agentsP1AfterCursor: ", ",
  agentsP1AfterClaude: ", ",
  agentsP1AfterChatgpt: ", o en cualquier ",
  agentsP1AfterMcp:
    ", el agente extrae y almacena entidades de cada turno de conversaci\u00f3n: personas mencionadas, tareas asumidas, decisiones tomadas y hechos declarados.",
  linkHarnessCursor: "Cursor",
  linkHarnessClaude: "Claude",
  linkHarnessChatgpt: "ChatGPT",
  linkHarnessMcpClient: "cliente compatible con MCP",
  agentsP2BeforeRecipes: "El agente sigue ",
  linkStoreRecipes: "recetas de almacenamiento",
  agentsP2AfterRecipes:
    " que definen c\u00f3mo persistir conversaciones, extraer entidades de adjuntos, enlazar registros relacionados y conservar la procedencia sin intervenci\u00f3n manual. Aplica la heur\u00edstica de decisi\u00f3n de m\u00e1s abajo en tu nombre: si un hecho tiene valor de recuerdo, auditor\u00eda o relaciones, el agente lo almacena autom\u00e1ticamente.",
  agentsP3BeforeCli: "Siempre puedes almacenar datos manualmente mediante la ",
  linkCli: "CLI",
  agentsP3AfterCli: ", la ",
  linkRestApi: "API REST",
  agentsP3AfterApi: " o las ",
  linkMcpTools: "herramientas MCP",
  agentsP3AfterMcp:
    ", corregir lo almacenado o pedir a tu agente que deje de almacenar categor\u00edas concretas. Lo predeterminado es el almacenamiento proactivo con supervisi\u00f3n humana, no al rev\u00e9s.",
  sectionFlexibleTitle: "Cualquier tipo de entidad, cualquier forma",
  flexibleP1BeforeRegistry:
    "Neotoma no exige definir un esquema antes de guardar datos. Almacena cualquier entidad con un ",
  flexibleP1BetweenCodeAndRegistry:
    " descriptivo y los campos que implique el dato. El ",
  linkSchemaRegistry: "registro de esquemas",
  flexibleP1AfterRegistry: " infiere y evoluciona esquemas autom\u00e1ticamente cuando aparecen campos nuevos.",
  flexibleP2BeforeTypes: "Los tipos habituales como ",
  flexibleP2AfterTypesBeforeNewType:
    " incluyen valores por defecto razonables, pero puedes crear cualquier tipo almacenando una entidad con un ",
  flexibleP2AfterEntityType: " nuevo. Los campos a\u00f1adidos despu\u00e9s activan ",
  linkAdditiveSchemaEvolution: "evoluci\u00f3n aditiva del esquema",
  flexibleP2AfterEvolution: ", con bumps de versi\u00f3n menor que nunca rompen los datos existentes.",
  flexibleP3BeforeRaw: "Los campos desconocidos se conservan en una capa ",
  flexibleP3AfterRawBeforeSee:
    " para que no se pierda nada en silencio. A medida que maduran los esquemas, esos fragmentos se promueven al esquema validado autom\u00e1ticamente. Consulta ",
  linkSchemasOverview: "resumen de esquemas",
  flexibleP3BetweenOverviewAndMerge: ", ",
  linkMergePolicies: "pol\u00edticas de fusi\u00f3n",
  flexibleP3BetweenMergeAndStorage: " y ",
  linkStorageLayers: "capas de almacenamiento",
  flexibleP3End: " para el panorama completo.",
  sectionTier1Title: "Nivel 1: hechos de alto valor",
  tier1Intro: "Almac\u00e9nalos de forma proactiva desde la primera sesi\u00f3n.",
  tier1Rows: [
    {
      category: "Personas y relaciones",
      examples: "Contactos, empresas, organizaciones, roles vinculados",
    },
    {
      category: "Compromisos y tareas",
      examples: "Obligaciones, acciones pendientes, plazos, promesas",
    },
    {
      category: "Eventos y decisiones",
      examples: "Reuniones, hitos, elecciones con su razonamiento",
    },
    {
      category: "Hechos financieros",
      examples: "Transacciones, facturas, recibos, contratos, importes pendientes",
    },
  ],
  tableHeaderCategory: "Categor\u00eda",
  tableHeaderExamples: "Ejemplos",
  sectionTier2Title: "Nivel 2: hechos contextuales",
  tier2Intro: "Almac\u00e9nalos cuando aparezcan en conversaci\u00f3n, documentos o herramientas externas.",
  tier2Rows: [
    {
      category: "Preferencias y normas",
      examples: "Preferencias del usuario, convenciones, gu\u00edas de estilo, restricciones declaradas",
    },
    {
      category: "Contexto del proyecto",
      examples: "Entidades del c\u00f3digo, decisiones de arquitectura, metadatos de releases, configuraci\u00f3n",
    },
    {
      category: "Documentos y artefactos",
      examples: "Archivos subidos con estructura extra\u00edda, informes, especificaciones",
    },
  ],
  sectionTier3Title: "Nivel 3: contexto derivado",
  tier3Intro: "Almac\u00e9nalo cuando el registro derivado tenga valor futuro de recuerdo, auditor\u00eda o relaciones.",
  tier3Rows: [
    {
      category: "Conversaciones",
      examples: "Interacciones del agente con procedencia (persistidas por turno)",
    },
    {
      category: "Estado de sesi\u00f3n",
      examples: "Entorno activo, herramientas en ejecuci\u00f3n, contexto de trabajo actual",
    },
    {
      category: "Datos externos",
      examples: "Registros obtenidos de correo, calendario, web, APIs u otros MCP",
    },
  ],
  sectionExamplesTitle: "Ejemplos antes y despu\u00e9s",
  exampleContacts: {
    title: "Contactos a partir de una conversaci\u00f3n",
    beforeLabel: "Antes:",
    beforeText:
      "Mencionas a \u00abClayton de Acme\u00bb en un chat. En la siguiente sesi\u00f3n, el agente no sabe qui\u00e9n es Clayton.",
    afterLabel: "Despu\u00e9s:",
    afterText:
      "El agente almacena una entidad contact con nombre, empresa y un enlace REFERS_TO a la conversaci\u00f3n. En la siguiente sesi\u00f3n, el contexto de Clayton se recupera al instante.",
  },
  exampleTask: {
    title: "Tarea a partir de un compromiso",
    beforeLabel: "Antes:",
    beforeText: "\u00abTengo que contactar a Sarah antes del viernes.\u00bb El compromiso solo existe en esa sesi\u00f3n.",
    afterLabel: "Despu\u00e9s:",
    afterText:
      "El agente almacena una entidad task con t\u00edtulo, fecha l\u00edmite y REFERS_TO al contacto de Sarah. La tarea persiste entre sesiones y herramientas.",
  },
  exampleDecision: {
    title: "Decisi\u00f3n con fundamento",
    beforeLabel: "Antes:",
    beforeText: "Eliges PostgreSQL frente a MySQL. Tres semanas despu\u00e9s, nadie recuerda por qu\u00e9.",
    afterLabel: "Despu\u00e9s:",
    afterText:
      "El agente almacena una decision_note con el fundamento y el contexto. El razonamiento queda versionado y trazable.",
  },
  sectionHeuristicTitle: "Heur\u00edstica de decisi\u00f3n",
  heuristicIntro:
    "Al decidir si almacenar algo, aplica esta prueba. Si cualquier respuesta es s\u00ed, almac\u00e9nalo.",
  heuristicLi1Strong: "Recuperabilidad",
  heuristicLi1Body: ": \u00bfUn agente o usuario necesitar\u00e1 este hecho de nuevo en una sesi\u00f3n futura?",
  heuristicLi2Strong: "Auditabilidad",
  heuristicLi2Body: ": \u00bfAlguien necesitar\u00e1 saber cu\u00e1ndo se registr\u00f3 o c\u00f3mo cambi\u00f3?",
  heuristicLi3Strong: "Reproducibilidad",
  heuristicLi3Body: ": \u00bfReconstruir el estado pasado requerir\u00eda este hecho?",
  heuristicLi4Strong: "Valor de relaciones",
  heuristicLi4Body: ": \u00bfConecta con otras entidades (personas, tareas, eventos)?",
  sectionNotStoreTitle: "Qu\u00e9 NO almacenar",
  notStoreRows: [
    {
      category: "Salida ef\u00edmera",
      examples: "Sin valor de recuerdo futuro; sin beneficio del versionado",
    },
    {
      category: "Registros duplicados",
      examples: "Ya est\u00e1n en Neotoma; comprueba antes de guardar",
    },
    {
      category: "Datos inferidos o predichos",
      examples: "Neotoma guarda hechos, no suposiciones",
    },
    {
      category: "Datos no aprobados",
      examples: "Se requiere control expl\u00edcito del usuario",
    },
    {
      category: "Credenciales y secretos",
      examples: "Van en gestores de secretos, no en la capa de estado",
    },
  ],
  footerReady: "\u00bfListo para empezar? ",
  linkInstallNeotoma: "Instala Neotoma",
  footerAfterInstall: " y luego ",
  linkWalkthrough: "sigue el recorrido guiado",
  footerAfterWalkthrough: " para ver el almacenamiento en acci\u00f3n. Consulta ",
  linkBackupRestore: "copia de seguridad y restauraci\u00f3n",
  footerEnd: " para proteger tus datos.",
};
