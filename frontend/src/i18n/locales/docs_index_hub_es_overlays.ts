import type { DocHubCard, DocHubCategory } from "@/i18n/locales/docs_index_hub_en";

/** Spanish overlays for `/docs` hub; merge onto `DOC_INDEX_HUB_EN` for `es`. */
export const DOC_INDEX_HUB_ES_CATEGORY_TITLE: Record<string, string> = {
  getting_started: "Primeros pasos",
  integrations: "Integraciones",
  reference: "Referencia",
  primitive_record_types: "Tipos de registro primitivos",
  schemas: "Esquemas",
  where_tax: "D\u00f3nde se nota el coste",
  compare: "Comparar",
  external: "Externo",
};

export const DOC_INDEX_HUB_ES_ITEM: Record<string, Partial<Pick<DocHubCard, "label" | "desc">>> = {
  "/evaluate": {
    label: "Evaluar",
    desc: "Haz que tu agente lea esta p\u00e1gina para decidir si Neotoma encaja en tu flujo",
  },
  "/install": {
    label: "Instalar",
    desc: "Instala e inicializa Neotoma en local",
  },
  "/what-to-store": {
    label: "Qu\u00e9 almacenar primero",
    desc: "Elige los primeros hechos duraderos, compromisos y registros con fuente que persistir",
  },
  "/backup": {
    label: "Copia de seguridad y restauraci\u00f3n",
    desc: "Protege la base SQLite, los archivos fuente y el historial de reconstrucci\u00f3n",
  },
  "/tunnel": {
    label: "Exponer t\u00fanel",
    desc: "T\u00faneles HTTPS cuando los clientes MCP remotos no pueden usar stdio local",
  },
  "/walkthrough": {
    label: "Recorrido guiado",
    desc: "Ejemplo de extremo a extremo: operar, construir y depurar",
  },
  "/neotoma-with-chatgpt": {
    desc: "Memoria determinista para conversaciones de ChatGPT",
  },
  "/neotoma-with-claude": {
    desc: "Estado estructurado junto a la memoria de la plataforma Claude",
  },
  "/neotoma-with-claude-code": {
    desc: "Memoria persistente para el agente CLI local de Claude Code",
  },
  "/neotoma-with-codex": {
    desc: "Memoria entre tareas y respaldo por CLI",
  },
  "/neotoma-with-cursor": {
    desc: "Memoria persistente junto al contexto de Cursor",
  },
  "/neotoma-with-ironclaw": {
    desc: "Memoria MCP estructurada para agentes IronClaw",
  },
  "/neotoma-with-openclaw": {
    desc: "Memoria propiedad del usuario para agentes OpenClaw",
  },
  "/neotoma-with-opencode": {
    desc: "Hooks de ciclo de vida y memoria MCP para OpenCode",
  },
  "/api": {
    label: "API REST",
    desc: "Endpoints y par\u00e1metros OpenAPI",
  },
  "/mcp": {
    label: "Servidor MCP",
    desc: "Acciones del Model Context Protocol",
  },
  "/cli": {
    label: "CLI",
    desc: "Comandos, flags y REPL",
  },
  "/memory-guarantees": {
    label: "Garant\u00edas de memoria",
    desc: "Todas las propiedades de memoria en una sola p\u00e1gina",
  },
  "/memory-models": {
    label: "Modelos de memoria",
    desc: "Memoria de plataforma, recuperaci\u00f3n, basada en archivos y determinista comparada",
  },
  "/foundations": {
    label: "Fundamentos",
    desc: "Arquitectura privacy-first y dise\u00f1o multiplataforma",
  },
  "/agent-instructions": {
    label: "Instrucciones para agentes",
    desc: "Reglas de comportamiento obligatorias para agentes que usan Neotoma",
  },
  "/architecture": {
    label: "Arquitectura",
    desc: "Flujo de estado, garant\u00edas y principios",
  },
  "/terminology": {
    label: "Terminolog\u00eda",
    desc: "Glosario de conceptos clave",
  },
  "/troubleshooting": {
    label: "Soluci\u00f3n de problemas",
    desc: "Fallos habituales y correcciones pr\u00e1cticas",
  },
  "/changelog": {
    label: "Historial de cambios",
    desc: "Historial de versiones y actualizaciones de documentaci\u00f3n",
  },
  "/site-markdown": {
    label: "Todas las p\u00e1ginas (Markdown)",
    desc: "Cada ruta indexable como Markdown (res\u00famenes SEO)",
  },
  "/primitives": {
    label: "Resumen",
    desc: "Los siete bloques de sistema detr\u00e1s de cada entidad, snapshot y auditor\u00eda",
  },
  "/primitives/entities": {
    label: "Entidades",
    desc: "Fila can\u00f3nica por persona, empresa o cosa; ID determinista, alias y seguimiento de fusiones",
  },
  "/primitives/entity-snapshots": {
    label: "Snapshots de entidad",
    desc: "Salida del reductor con procedencia por campo y columna de embedding opcional",
  },
  "/primitives/sources": {
    label: "Fuentes",
    desc: "Almacenamiento bruto con direccionamiento de contenido y deduplicaci\u00f3n SHA-256 por usuario",
  },
  "/primitives/interpretations": {
    label: "Interpretaciones",
    desc: "Intentos de extracci\u00f3n versionados y auditados con procedencia interpretation_config",
  },
  "/primitives/observations": {
    label: "Observaciones",
    desc: "Hechos inmutables que el reductor compone en snapshots de entidad",
  },
  "/primitives/relationships": {
    label: "Relaciones",
    desc: "Aristas tipadas de primer nivel con el mismo patr\u00f3n observaci\u00f3n-snapshot",
  },
  "/primitives/timeline-events": {
    label: "Eventos de l\u00ednea de tiempo",
    desc: "Registros temporales anclados a fuente derivados de fechas extra\u00eddas",
  },
  "/schemas": {
    label: "Resumen",
    desc: "Definiciones versionadas por config que dan forma de dominio a los primitivos",
  },
  "/schemas/registry": {
    label: "Registro de esquemas",
    desc: "Tabla con cada schema_definition + reducer_config versionados, global o por usuario",
  },
  "/schemas/merge-policies": {
    label: "Pol\u00edticas de fusi\u00f3n",
    desc: "Reglas declarativas por campo: last_write, highest_priority, most_specific, merge_array",
  },
  "/schemas/storage-layers": {
    label: "Capas de almacenamiento",
    desc: "raw_text, properties y raw_fragments: d\u00f3nde aterrizan los datos extra\u00eddos",
  },
  "/schemas/versioning": {
    label: "Versionado y evoluci\u00f3n",
    desc: "Semver, bumps menores aditivos, mayores con ruptura y volcado p\u00fablico de snapshots",
  },
  "/schema-management": {
    label: "Gesti\u00f3n de esquemas (CLI)",
    desc: "Flujos CLI para listar, validar, evolucionar y registrar esquemas en tiempo de ejecuci\u00f3n",
  },
  "/operating": {
    label: "Conserje de contexto",
    desc: "Vuelves a explicar el contexto cada sesi\u00f3n. Estado que persiste entre herramientas.",
  },
  "/building-pipelines": {
    label: "Varianza de inferencia",
    desc: "Las correcciones no se fijan. Estado determinista para pipelines de agentes.",
  },
  "/debugging-infrastructure": {
    label: "Arqueolog\u00eda de logs",
    desc: "Mismas entradas, distinto estado. L\u00edneas de tiempo y diffs reproducibles.",
  },
  "/build-vs-buy": {
    label: "Construir vs comprar",
    desc: "Cu\u00e1ndo adoptar una capa de integridad de estado frente a solo observabilidad",
  },
  "/neotoma-vs-platform-memory": {
    label: "Neotoma vs memoria de plataforma",
    desc: "Comodidad en un producto frente a estado portable y auditable entre herramientas",
  },
  "/neotoma-vs-mem0": {
    label: "Neotoma vs Mem0",
    desc: "Memoria de recuperaci\u00f3n para el prompt frente a estado de entidad determinista",
  },
  "/neotoma-vs-zep": {
    label: "Neotoma vs Zep",
    desc: "Recuperaci\u00f3n en grafo de conocimiento frente a estado versionado ligado al esquema",
  },
  "/neotoma-vs-rag": {
    label: "Neotoma vs RAG",
    desc: "Recuperaci\u00f3n de fragmentos frente a reconstrucci\u00f3n exacta de estado",
  },
  "/neotoma-vs-files": {
    label: "Neotoma vs memoria basada en archivos",
    desc: "Portabilidad Markdown/JSON frente a garant\u00edas estructurales y procedencia",
  },
  "/neotoma-vs-database": {
    label: "Neotoma vs memoria en base de datos",
    desc: "Filas CRUD frente a observaciones solo-append y reductores deterministas",
  },
  "https://github.com/markmhendrickson/neotoma": {
    label: "Repositorio GitHub",
    desc: "C\u00f3digo fuente, README e incidencias",
  },
  "https://www.npmjs.com/package/neotoma": {
    label: "Paquete npm",
    desc: "Instalaci\u00f3n v\u00eda npm",
  },
};

export function applyDocHubEsOverlays(categories: DocHubCategory[]): DocHubCategory[] {
  return categories.map((cat) => ({
    ...cat,
    title: DOC_INDEX_HUB_ES_CATEGORY_TITLE[cat.id] ?? cat.title,
    items: cat.items.map((item) => {
      const o = DOC_INDEX_HUB_ES_ITEM[item.href];
      return o ? { ...item, ...o } : item;
    }),
  }));
}
