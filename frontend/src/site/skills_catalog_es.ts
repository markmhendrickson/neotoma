import type { SkillCatalogEntry } from "./skills_catalog";

type Copy = { name: string; tagline: string; description: string; steps: readonly (readonly [string, string])[] };

/** Spanish editorial copy paired by stable skill slug and workflow phase order. */
const COPY: Record<string, Copy> = {
  "ensure-neotoma": {
    name: "Preparar Neotoma", tagline: "Instala Neotoma, configura MCP y comprueba la conexión",
    description: "Este procedimiento inicial prepara Neotoma para tu agente. Comprueba la CLI, guía la instalación con npm si falta, ejecuta `neotoma setup` para configurar MCP, instrucciones CLI, hooks, permisos y skills, y verifica la conexión MCP. Los demás procedimientos de memoria lo requieren previamente.",
    steps: [["Comprobar la CLI", "Ejecuta `npx neotoma status` para detectar el estado de la instalación."], ["Instalar si es necesario", "Guía `npm install -g neotoma` cuando falta la CLI."], ["Ejecutar la configuración", "Ejecuta `neotoma setup --yes` para configurar MCP, hooks y permisos."], ["Verificar la conexión", "Llama a `get_session_identity` para confirmar que la conexión MCP funciona."]],
  },
  "remember-email": {
    name: "Recordar correo", tagline: "Incorpora mensajes de correo al registro de Neotoma",
    description: "Configura un servidor MCP de correo, descubre y previsualiza mensajes, y extrae entidades estructuradas —contactos, tareas, eventos y transacciones— de su contenido. Cada entidad conserva procedencia hasta un mensaje concreto.",
    steps: [["Comprobar requisitos", "Confirma que Neotoma y el MCP de correo estén configurados."], ["Descubrir mensajes", "Busca por remitente, intervalo de fechas o consulta."], ["Previsualizar y confirmar", "Muestra qué se importará y extraerá."], ["Leer y extraer", "Lee el contenido completo y extrae entidades."], ["Guardar con procedencia", "Conserva entidades con `data_source` por mensaje."]],
  },
  "remember-conversations": {
    name: "Recordar conversaciones", tagline: "Incorpora historial de chat al registro de Neotoma",
    description: "Importa conversaciones de exportaciones JSON de ChatGPT, archivos de historial de Claude, archivos de Slack o URL de conversaciones compartidas. Reconstruye una cronología de decisiones, compromisos y contexto con procedencia completa.",
    steps: [["Comprobar Neotoma", "Confirma la conexión MCP."], ["Identificar la fuente", "Detecta el formato, como JSON de ChatGPT o exportación de Slack."], ["Analizar y previsualizar", "Enumera conversaciones con fechas y número de mensajes."], ["Extraer entidades", "Identifica decisiones, tareas, contactos y eventos."], ["Reconstruir la cronología", "Crea una cronología de hechos clave vinculada a sus fuentes."]],
  },
  "remember-meetings": {
    name: "Recordar reuniones", tagline: "Extrae decisiones y tareas de las transcripciones de reuniones",
    description: "Incorpora transcripciones de Zoom, Otter, Google Meet o notas manuales. Extrae decisiones, tareas, asistentes y compromisos como entidades estructuradas, con procedencia hasta los pasajes concretos de la transcripción.",
    steps: [["Comprobar Neotoma", "Confirma la conexión MCP."], ["Identificar transcripciones", "Localiza archivos y detecta su formato."], ["Analizar y previsualizar", "Muestra fecha, participantes y temas principales."], ["Extraer entidades", "Obtén decisiones, tareas y asistentes del contenido."], ["Guardar con procedencia", "Conserva la transcripción original como fuente."]],
  },
  "remember-finances": {
    name: "Recordar finanzas", tagline: "Incorpora extractos, recibos y facturas",
    description: "Importa documentos financieros —extractos CSV o PDF, imágenes de recibos y facturas PDF— y extrae transacciones estructuradas con importes, fechas, comercios y categorías. Conserva el documento original como fuente de auditoría.",
    steps: [["Comprobar Neotoma", "Confirma la conexión MCP."], ["Identificar documentos", "Localiza archivos financieros y detecta el formato."], ["Analizar y previsualizar", "Muestra número de transacciones, intervalo de fechas y totales."], ["Extraer transacciones", "Estructura los datos con un `entity_type` coherente."], ["Guardar con procedencia", "Conserva el documento original como fuente."]],
  },
  "remember-contacts": {
    name: "Recordar contactos", tagline: "Consolida contactos de tus fuentes de datos",
    description: "Crea una lista unificada y sin duplicados a partir de cabeceras de correo, asistentes de calendario, participantes de chats, archivos vCard y exportaciones de LinkedIn. Combina duplicados por correo y nombre para formar un grafo de contactos.",
    steps: [["Comprobar Neotoma", "Confirma la conexión MCP."], ["Identificar fuentes", "Determina qué fuentes de contactos están disponibles."], ["Recoger y deduplicar", "Reúne contactos y combina coincidencias por correo y nombre."], ["Previsualizar y confirmar", "Distingue contactos nuevos de existentes."], ["Guardar contactos", "Conserva deduplicación y procedencia."]],
  },
  "remember-calendar": {
    name: "Recordar calendario", tagline: "Incorpora eventos y compromisos de agenda",
    description: "Importa eventos desde un MCP de calendario activo o exportaciones de archivos ICS. Extrae compromisos, asistentes y patrones recurrentes como entidades estructuradas.",
    steps: [["Comprobar Neotoma", "Confirma la conexión MCP."], ["Identificar la fuente", "Comprueba si hay MCP de calendario o archivo ICS."], ["Recuperar y previsualizar", "Enumera eventos del intervalo indicado."], ["Extraer entidades", "Crea eventos, contactos, tareas y lugares."], ["Guardar con procedencia", "Vincula eventos con asistentes y fuentes."]],
  },
  "remember-codebase": {
    name: "Recordar código", tagline: "Contexto técnico persistente para tus repositorios",
    description: "Crea un inventario persistente del contexto de desarrollo: repositorios, decisiones de arquitectura, dependencias importantes y conocimiento del equipo. Así el agente comprende el código entre sesiones sin repetirle todo el contexto.",
    steps: [["Comprobar Neotoma", "Confirma la conexión MCP."], ["Inventariar el repositorio", "Lee metadatos y estructura del proyecto."], ["Extraer entidades", "Crea entidades de repositorio, decisión y convención."], ["Guardar con procedencia", "Vincula las entidades con los archivos fuente."], ["Conectar MCP", "Verifica la configuración MCP del proyecto."]],
  },
  "recover-sqlite-database": {
    name: "Recuperar una base SQLite", tagline: "Comprueba la integridad y recupera una base de Neotoma dañada",
    description: "Procedimiento de diagnóstico para una base SQLite local de Neotoma dañada. Comprueba la integridad, ejecuta `.recover` y guía la sustitución del archivo de base de datos recuperado.",
    steps: [["Comprobar integridad", "Ejecuta `PRAGMA integrity_check` en la base de datos."], ["Recuperar datos", "Ejecuta `.recover` para extraerlos de las páginas dañadas."], ["Sustituir la base", "Guía la sustitución del archivo dañado por el recuperado."]],
  },
};

const SOURCE_LABELS: Record<string, string> = {
  "Email exports": "Exportaciones de correo", "ChatGPT JSON export": "Exportación JSON de ChatGPT", "Claude history": "Historial de Claude", "Slack archive": "Archivo de Slack", "Shared URLs": "URL compartidas", "VTT files": "Archivos VTT", "SRT files": "Archivos SRT", "TXT transcripts": "Transcripciones TXT", "Markdown notes": "Notas Markdown", "CSV bank statements": "Extractos bancarios CSV", "PDF statements": "Extractos PDF", "Receipt images": "Imágenes de recibos", "Invoice PDFs": "Facturas PDF", "vCard files": "Archivos vCard", "LinkedIn CSV": "CSV de LinkedIn", "Chat exports": "Exportaciones de chat", "Apple Calendar (ICS)": "Apple Calendar (ICS)", "Outlook (ICS)": "Outlook (ICS)", "Git metadata": "Metadatos Git", "Architecture docs": "Documentos de arquitectura", "ADR files": "Archivos ADR", "Neotoma SQLite database": "Base SQLite de Neotoma",
};
const TOOL_DESCRIPTIONS: Record<string, string> = {
  "Required for installing the Neotoma CLI": "Necesario para instalar la CLI de Neotoma",
  "OAuth-authenticated access to Gmail": "Acceso a Gmail autenticado mediante OAuth",
  "Generic IMAP email access": "Acceso genérico al correo mediante IMAP",
  "For scraping shared conversation URLs": "Para leer URL de conversaciones compartidas",
  "Optional enrichment with event metadata": "Complemento opcional con metadatos de eventos",
  "Optional live bank data access": "Acceso opcional a datos bancarios actuales",
  "Extract contacts from email headers": "Extrae contactos de cabeceras de correo",
  "Extract attendees from events": "Extrae asistentes de eventos",
  "Live calendar event access": "Acceso a eventos de un calendario activo",
  "SQLite CLI for integrity checks and recovery": "CLI de SQLite para comprobación de integridad y recuperación",
};

export function spanishSkill(skill: SkillCatalogEntry): SkillCatalogEntry {
  const copy = COPY[skill.slug];
  if (!copy || copy.steps.length !== skill.workflowSteps.length)
    throw new Error(`Spanish skill copy missing or structurally stale: ${skill.slug}`);
  return {
    ...skill,
    name: copy.name,
    tagline: copy.tagline,
    description: copy.description,
    dataSources: skill.dataSources.map((source) => SOURCE_LABELS[source] ?? source),
    externalTools: skill.externalTools.map((tool) => ({ ...tool, description: TOOL_DESCRIPTIONS[tool.description] ?? tool.description })),
    workflowSteps: skill.workflowSteps.map((step, i) => ({ ...step, title: copy.steps[i][0], description: copy.steps[i][1] })),
  };
}
