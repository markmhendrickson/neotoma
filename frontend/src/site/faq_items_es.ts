import type { FaqItem } from "@/site/faq_types";

/** Spanish FAQ; `sectionId` values must stay aligned with `FAQ_ITEMS_EN` for deep links and JSON-LD order. */
export const FAQ_ITEMS_ES: FaqItem[] = [
  {
    sectionId: "what-is-a-deterministic-state-layer-for-ai-agents",
    question: "¿Qué es una capa de estado determinista para agentes de IA?",
    answer:
      "Una capa de estado determinista garantiza que las mismas observaciones produzcan siempre el mismo estado de entidad. Neotoma usa registros de observaciones solo-append, IDs de entidad basados en hash y restricciones de esquema para ofrecer memoria versionada, reproducible y auditable que nunca muta en silencio.",
    detail:
      "A diferencia de la memoria por recuperación (Mem0, Zep) o la memoria de plataforma (Claude, ChatGPT), una capa de estado determinista ofrece garantías formales: historial versionado, líneas de tiempo reproducibles, registros de cambio auditables y reconstrucción de estado reproducible solo a partir de entradas en bruto.",
    link: { href: "/architecture", label: "Arquitectura" },
  },
  {
    sectionId: "how-does-neotoma-compare-to-mem0-and-zep",
    question: "¿Cómo se compara Neotoma con Mem0 y Zep?",
    answer:
      "Mem0 y Zep usan memoria aumentada por recuperación: incrustaciones vectoriales, búsqueda semántica y coincidencia probabilística. Neotoma usa estado determinista: registros solo-append, entidades ligadas al esquema y reductores que siempre producen la misma instantánea a partir de las mismas observaciones.",
    detail:
      "La memoria por recuperación sirve para inyectar contexto en prompts. La memoria determinista es necesaria cuando necesitas reconstruir el estado exacto de una entidad en un momento pasado, resolver conflictos multi-escritor de forma coherente o probar procedencia para auditorías.",
    link: { href: "/memory-models", label: "Comparación de modelos de memoria" },
  },
  {
    sectionId: "what-s-the-difference-between-rag-memory-and-deterministic-memory",
    question: "¿Qué diferencia hay entre memoria RAG y memoria determinista?",
    answer:
      "La memoria RAG almacena fragmentos de texto y los recupera por similitud semántica. La memoria determinista almacena observaciones estructuradas y compone el estado de la entidad mediante reductores. RAG responde «¿qué es relevante?»; la memoria determinista responde «¿qué era cierto?».",
    detail:
      "RAG está optimizado para aumentar prompts. La memoria determinista está optimizada para la integridad del estado: consultas temporales, coherencia multi-escritor, validación de esquema y reconstrucción reproducible.",
    link: { href: "/memory-models", label: "Modelos de memoria" },
  },
  {
    sectionId: "why-can-t-i-just-use-markdown-files-for-agent-memory",
    question: "¿Por qué no puedo usar solo archivos Markdown como memoria del agente?",
    answer:
      "Los Markdown son muy portables y editables por humanos, pero mezclan observaciones con instantáneas. Cuando dos agentes escriben valores en conflicto, ambas ediciones quedan en silencio. No hay validación de esquema, detección de conflictos ni forma de reconstruir el estado de la entidad en un momento pasado. Git versiona a nivel de archivo, no la procedencia a nivel de campo ni la lógica de fusión determinista.",
    link: { href: "/neotoma-vs-files", label: "Neotoma frente a memoria basada en archivos" },
  },
  {
    sectionId: "how-does-neotoma-compare-to-tools-that-offer-git-like-version-control-for-agent-memory",
    question:
      "¿Cómo se compara Neotoma con herramientas que ofrecen control de versiones tipo Git para la memoria del agente?",
    answer:
      "Esos productos suelen versionar un árbol de contexto compartido, un paquete de reglas o un bundle de prompts para que los equipos sincronicen lo que leen los agentes de código. Neotoma es una capa de estado estructurada: observaciones solo-append, entidades ligadas al esquema, reductores y procedencia a nivel de campo, con reproducción y diff del estado de entidad entre herramientas conectadas por MCP — no operaciones Git sobre un único paquete de contexto del proveedor.",
    detail:
      "Los flujos estilo Git abordan colaboración y deriva de archivos orientados al agente. Neotoma responde otra pregunta central: ¿qué era cierto en el tiempo T, desde qué fuente y cómo cambió el estado? Pueden complementarse (contexto sincronizado más Neotoma como fuente de verdad) o sustituirse cuando necesitas memoria estructurada entre herramientas más allá de un solo contexto de código.",
    link: { href: "/memory-guarantees", label: "Garantías de memoria" },
  },
  {
    sectionId: "why-can-t-i-just-use-sqlite-or-postgres-for-agent-memory",
    question: "¿Por qué no puedo usar solo SQLite o Postgres como memoria del agente?",
    answer:
      "Una base relacional ofrece consistencia fuerte y tipos de columna, pero el CRUD estándar (UPDATE in situ) sobrescribe el estado previo. Sin registro de observaciones, reductores y trazado de procedencia encima, obtienes semántica del último escritor sin pista de auditoría, sin detección de conflictos y sin reconstruir el estado histórico de la entidad. Neotoma usa una base como backend pero añade la arquitectura que entrega las garantías de memoria.",
    link: { href: "/neotoma-vs-database", label: "Neotoma frente a memoria en base de datos" },
  },
  {
    sectionId: "i-m-already-building-my-own-memory-system-why-would-i-use-neotoma",
    question: "Ya estoy construyendo mi propio sistema de memoria. ¿Por qué usar Neotoma?",
    answer:
      "Es el punto de partida habitual. La mayoría empieza con SQLite, JSON, Markdown o un servidor MCP propio y descubre que aún necesita versionado, detección de conflictos, evolución de esquema, historial reproducible y coherencia entre herramientas. Neotoma incorpora esas garantías como capa de estado para que no tengas que reconstruirlas en cada flujo de agente.",
    detail:
      "No se trata de que tu configuración actual sea incorrecta. Es que, cuando los agentes escriben entre sesiones y herramientas, las garantías que faltan se convierten en trabajo de infraestructura. Neotoma aporta el historial solo-append, el modelo de reductor, la procedencia y la reconstrucción determinista de estado hacia la que suelen converger las pilas caseras.",
    link: { href: "/memory-guarantees", label: "Garantías de memoria" },
  },
  {
    sectionId: "what-does-neotoma-add-on-top-of-a-database",
    question: "¿Qué añade Neotoma encima de una base de datos?",
    answer:
      "Neotoma añade un registro de observaciones solo-append, reductores deterministas, un registro de esquemas con validación en escritura, trazado de procedencia a nivel de campo, identidad de entidad con direccionamiento por contenido y manejo idempotente de observaciones. La base almacena los datos; estos patrones arquitectónicos entregan las garantías.",
    link: { href: "/architecture", label: "Arquitectura" },
  },
  {
    sectionId: "should-i-use-neotoma-alongside-claude-code-s-built-in-memory",
    question: "¿Debo usar Neotoma junto con la memoria integrada de Claude Code?",
    answer:
      "Sí: son complementarias. La memoria automática de Claude Code guarda preferencias conversacionales y notas de proyecto dentro de esa plataforma. Neotoma almacena estado estructurado duradero — contactos, tareas, decisiones, datos financieros — con versionado, resolución de entidades y acceso entre herramientas vía MCP. La memoria de plataforma está acotada a una herramienta; Neotoma persiste en todas tus herramientas de IA y sobrevive a reinicios de sesión.",
    detail:
      "Piensa en la memoria de plataforma como contexto a corto plazo («prefiero TypeScript») y en Neotoma como estado estructurado a largo plazo («Clayton nos debe 5.000 $ desde el 15 de marzo, último contacto en el hilo del acuerdo Q1»). Ambas pueden ejecutarse a la vez sin conflicto.",
    link: { href: "/neotoma-with-claude-code", label: "Neotoma con Claude Code" },
  },
  {
    sectionId: "if-neotoma-relies-on-llms-to-decide-what-to-store-how-is-it-deterministic",
    question: "Si Neotoma depende de LLMs para decidir qué almacenar, ¿cómo es determinista?",
    answer:
      "El determinismo de Neotoma es una propiedad de la capa de datos, no del agente. El LLM que elige herramienta y carga útil es estocástico: dos ejecuciones pueden producir observaciones distintas. Por debajo de ese límite todo es determinista: las mismas observaciones producen la misma instantánea, las mismas reglas de fusión resuelven igual y las mismas entradas generan los mismos IDs.",
    detail:
      "La arquitectura apunta a convergencia acotada más que a determinismo de reproducción estricta. La canonicalización colapsa salidas de LLM sintácticamente distintas pero equivalentes al mismo hash de observación. La inmutabilidad hace que la varianza estocástica se acumule como historial en lugar de corromper la verdad. Los reductores arbitran conflictos de forma determinista sin importar el orden de escritura. La fusión de entidades repara duplicados creados por ejecuciones divergentes. El sistema converge hacia un grafo de entidades coherente con el tiempo.",
    link: { href: "/architecture", label: "Arquitectura" },
  },
  {
    sectionId: "how-does-ingestion-work-does-neotoma-extract-data-automatically",
    question: "¿Cómo funciona la ingesta? ¿Neotoma extrae datos automáticamente?",
    answer:
      "Neotoma es un almacén, no un extractor. Tu agente decide qué observar, rellena los parámetros y Neotoma lo versiona. No hay escaneo en segundo plano, extracción por regex ni recopilación pasiva. El agente impulsa cada escritura.",
    detail:
      "Es una decisión deliberada: el agente tiene el contexto para saber qué importa. Neotoma proporciona la capa de almacenamiento estructurada y versionada. El agente llama a store con entidades y observaciones; Neotoma resuelve entidades, valida esquemas, calcula instantáneas y traza procedencia.",
    link: { href: "/architecture", label: "Arquitectura" },
  },
  {
    sectionId: "what-happens-to-information-that-doesn-t-fit-a-schema",
    question: "¿Qué pasa con la información que no encaja en un esquema?",
    answer:
      "Nada se descarta en silencio. No necesitas definir un esquema antes de almacenar. Tu agente puede guardar cualquier entidad con un tipo descriptivo y los campos que los datos impliquen; Neotoma infiere y evoluciona esquemas automáticamente. Los campos que el esquema activo aún no reconoce aterrizan en una capa raw_fragments para preservar el valor original junto a la instantánea validada.",
    detail:
      "Los esquemas son versionados y aditivos por defecto. La primera vez que tu agente guarde un `workout`, un `lease_payment` o cualquier otro tipo, Neotoma registra un esquema a partir de los datos y aumenta una versión menor. Añadir campos después dispara otra versión menor (p. ej. 1.0.0 → 1.1.0); cambios disruptivos como quitar o re-tipar un campo requieren un salto mayor (1.x → 2.0). Las observaciones antiguas conservan su versión original y siguen siendo legibles. A medida que los patrones maduran, los raw_fragments se promueven al esquema validado de forma automática. Mira los apartados de esquemas y versionado para los detalles.",
    link: { href: "/schemas/versioning", label: "Versionado y evolución de esquemas" },
  },
  {
    sectionId: "can-i-try-neotoma-without-replacing-my-current-memory-system",
    question: "¿Puedo probar Neotoma sin reemplazar mi sistema de memoria actual?",
    answer:
      "Sí. Neotoma se instala junto a lo que ya uses (MEMORY.md, claw.md, un servidor MCP propio, memoria de plataforma). Nada de tu stack actual se mueve, modifica ni reemplaza. Puedes ingerir logs históricos de sesiones, conversaciones o notas en una base Neotoma nueva, ejecutar un agente con Neotoma habilitado en paralelo y comparar sus respuestas con un agente sin él — luego decides si te quedas o te vas.",
    detail:
      'La guía "Probar con seguridad" recorre la ruta recomendada de instalación en sombra: instala, ingiere historial, compara A/B y decide. Tu sistema de memoria existente queda intacto en todo momento. Si decides que Neotoma no es para ti, desinstalarlo deja tu configuración anterior tal cual estaba.',
    link: { href: "/non-destructive-testing", label: "Probar con seguridad" },
  },
  {
    sectionId: "what-should-my-agent-remember-how-do-i-get-started",
    question: "¿Qué debería recordar mi agente? ¿Cómo empiezo?",
    answer:
      "Empieza con lo que el agente ya produce: conversaciones, contactos citados en el chat, tareas y compromisos («necesito», «recuérdame») y decisiones. Se almacenan automáticamente sin configuración extra cuando las reglas del agente están activas. En la primera semana añade datos financieros, calendario y contexto de proyecto a medida que crece tu OS personal.",
    detail:
      "Prioridad 1 (día uno): conversaciones, contactos, tareas, decisiones — baja fricción, alto valor compuesto. Prioridad 2 (primera semana): finanzas, calendario, correo, salud. Prioridad 3 (madurez): canal de contenido, contexto de proyecto, estado de sesión del agente. La heurística: si se beneficia de recuerdo, auditoría, reproducción o enlaces a otras entidades, almacénalo.",
    link: { href: "/docs", label: "Documentación" },
  },
  {
    sectionId: "is-neotoma-a-note-taking-app-or-thought-partner-tool",
    question: "¿Neotoma es una app de notas o una herramienta de acompañamiento de ideas?",
    answer:
      "No. Neotoma es una capa de estado determinista: infraestructura para agentes que acumulan estado estructurado entre sesiones y herramientas. No es una app de notas, diario ni compañero conversacional de ideas. Si tu flujo es lluvia de ideas puntual o captura libre, encaja mejor una herramienta pensada para eso (Obsidian, Notion, Apple Notes).",
    detail:
      "Neotoma almacena entidades estructuradas con validación de esquema, historial versionado y coherencia entre herramientas. Esa arquitectura es sobrecoste para notas casuales pero esencial cuando los agentes necesitan estado reproducible y auditable que se compone con el tiempo.",
    link: { href: "/architecture", label: "Arquitectura" },
  },
  {
    sectionId: "how-do-i-install-neotoma",
    question: "¿Cómo instalo Neotoma?",
    answer:
      "Ejecuta `npm install -g neotoma`, luego `neotoma setup --tool cursor --yes` para inicializar Neotoma y configurar la ruta MCP local por defecto. Sustituye `cursor` por tu herramienta si hace falta. Arranca el servidor API solo si necesitas Inspector, OAuth o la API HTTP local. El proceso completo lleva menos de 5 minutos.",
    link: { href: "/install", label: "Guía de instalación" },
  },
  {
    sectionId: "does-neotoma-send-my-data-to-the-cloud",
    question: "¿Neotoma envía mis datos a la nube?",
    answer:
      "No. Neotoma se ejecuta en local por defecto. Tus datos permanecen en tu máquina en una base SQLite local. No hay sincronización en la nube, telemetría ni entrenamiento con tus datos. Puedes exponer opcionalmente la API mediante un túnel para clientes MCP remotos.",
    link: { href: "/foundations", label: "Arquitectura privacy-first" },
  },
  {
    sectionId: "what-ai-tools-does-neotoma-work-with",
    question: "¿Con qué herramientas de IA funciona Neotoma?",
    answer:
      "Neotoma funciona con cualquier herramienta compatible con MCP: Cursor, Claude (escritorio y claude.ai), Claude Code, ChatGPT, Codex, OpenCode, OpenClaw e IronClaw. También ofrece API REST y CLI para acceso programático directo.",
    link: { href: "/docs", label: "Guías de integración" },
  },
  {
    sectionId: "is-neotoma-free-and-open-source",
    question: "¿Neotoma es gratuito y de código abierto?",
    answer:
      "Sí. Neotoma tiene licencia MIT y es totalmente de código abierto. El paquete npm, la CLI, el servidor API y el servidor MCP son gratuitos. El código fuente está en GitHub.",
  },
  {
    sectionId: "what-are-neotoma-s-memory-guarantees",
    question: "¿Cuáles son las garantías de memoria de Neotoma?",
    answer:
      "Neotoma aplica garantías de memoria que cubren evolución determinista del estado, historial versionado, línea de tiempo reproducible, registro de cambio auditable, restricciones de esquema, prevención de mutación silenciosa, detección de hechos en conflicto, prevención de cierre falso, reconstrucción reproducible del estado, inspección humana, incorporación sin configuración, búsqueda por similitud semántica y edición humana directa.",
    link: { href: "/memory-guarantees", label: "Garantías de memoria" },
  },
  {
    sectionId: "does-the-memory-degrade-or-drift-over-time",
    question: "¿La memoria se degrada o deriva con el tiempo?",
    answer:
      "No. Neotoma usa un registro de observaciones solo-append con reductores deterministas. Nada se sobrescribe ni se descarta en silencio. Los hechos guardados hace seis meses son tan recuperables y verificables como los de hoy — con historial de versiones y procedencia intactos. La memoria se compone; no decae.",
    detail:
      "La memoria de plataforma (ChatGPT, Claude) puede olvidar o sobrescribir hechos con el tiempo. Los sistemas de recuperación pierden relevancia al envejecer los embeddings. Los almacenes basados en archivos acumulan conflictos silenciosos. La arquitectura de Neotoma evita esos tres modos de fallo: las observaciones son inmutables, las instantáneas se recalculan de forma determinista y la procedencia traza cada valor a su fuente con independencia de la antigüedad.",
    link: { href: "/memory-guarantees", label: "Garantías de memoria" },
  },
  {
    sectionId: "what-is-an-entity-in-neotoma",
    question: "¿Qué es una entidad en Neotoma?",
    answer:
      "Una entidad es la representación canónica de una persona, empresa, tarea, evento u otro objeto. Cada entidad tiene un ID determinista derivado de su tipo y campos identificadores, de modo que la misma cosa del mundo real siempre resuelve a la misma entidad.",
    link: { href: "/terminology", label: "Terminología" },
  },
  {
    sectionId: "what-is-an-observation-in-neotoma",
    question: "¿Qué es una observación en Neotoma?",
    answer:
      "Una observación es un hecho inmutable con marca temporal sobre una entidad. Las observaciones nunca se modifican ni se borran. Los reductores fusionan todas las observaciones de una entidad en una única instantánea que representa la verdad actual.",
    link: { href: "/terminology", label: "Terminología" },
  },
];
