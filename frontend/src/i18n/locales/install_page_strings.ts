/**
 * Install page copy: EN base + ES overlays. Other locales shallow-merge title/chip strings in subpage_packs.
 */

export type InstallTextSegment = string | { code: string };

export interface InstallImpactRow {
  what: string;
  path: string;
  scope: string;
  reset: string;
}

export interface InstallIntegrationCard {
  href: string;
  label: string;
  desc: string;
}

export interface InstallExpandedStep {
  title: string;
  segments: InstallTextSegment[];
}

export interface InstallPageStrings {
  title: string;
  fewMinutesIntegration: string;
  fullyReversible: string;
  agentAssistedInstall: string;
  directIntegrationDocs: string;
  manualInstallAndDocker: string;
  startWithEvaluation: string;
  manualInstall: string;
  dockerInstall: string;
  cliReference: string;
  fullReadme: string;
  moreOptions: string;
  whatChangesOnSystem: string;
  expandedInstallFirstSequence: string;
  evaluateCtaBody: string;
  agentAssistedLead: string;
  expandedPromptLeadBold: string;
  expandedPromptLeadAfterBold: string;
  expandedPromptBullets: [string, string, string, string];
  expandedSequenceIntroPrefix: string;
  expandedSequenceIntroSuffix: string;
  expandedSteps: InstallExpandedStep[];
  permissionsNote: string;
  canonicalRefPrefix: string;
  canonicalRefAfterInstallMd: string;
  canonicalRefSuffix: string;
  manualInstallLinkLabel: string;
  dockerLinkLabel: string;
  cliReferenceLinkLabel: string;
  hostedConnectLeadPrefix: string;
  hostedConnectConnectLink: string;
  hostedConnectMiddle: string;
  hostedConnectSandboxLink: string;
  hostedConnectSuffix: string;
  impactTableCreated: string;
  impactTablePath: string;
  impactTableScope: string;
  impactTableReset: string;
  impactRows: InstallImpactRow[];
  whatChangesIntroParagraphs: InstallTextSegment[][];
  whatChangesFootnoteSegments: InstallTextSegment[];
  manualCardDesc: string;
  dockerCardDesc: string;
  integrationCards: InstallIntegrationCard[];
}

const IMPACT_ROWS_EN: InstallImpactRow[] = [
  {
    what: "Global npm package",
    path: "neotoma (global node_modules)",
    scope: "Global",
    reset: "npm uninstall -g neotoma (reset runs it only from inside a Neotoma repo)",
  },
  {
    what: "Config directory",
    path: "~/.config/neotoma/",
    scope: "User",
    reset: "Backed up, then removed",
  },
  {
    what: "Environment file",
    path: "~/.config/neotoma/.env or <project>/.env",
    scope: "User / Project",
    reset: "Backed up, then removed",
  },
  {
    what: "SQLite databases (development and production profiles)",
    path: "<data-dir>/neotoma.db, neotoma.prod.db",
    scope: "Local",
    reset: "Backed up, then removed",
  },
  {
    what: "Data directories",
    path: "<data-dir>/sources/, <data-dir>/logs/",
    scope: "Local",
    reset: "Backed up, then removed",
  },
  {
    what: "MCP config entries: neotoma-dev and neotoma, with separate databases (init adds one to Cursor by default)",
    path: "~/.cursor/mcp.json, .mcp.json, claude.json, etc.",
    scope: "User / Project",
    reset: "Entries stripped from configs",
  },
  {
    what: "CLI instruction files for Claude Code, Cursor and Codex",
    path: ".cursor/rules/, .claude/rules/, and the Codex equivalent",
    scope: "Project",
    reset: "Backed up, then removed",
  },
  {
    what: "Claude Code plugin with 5 hooks: setup runs claude plugin marketplace add and claude plugin install neotoma@neotoma-marketplace (only when claude is on your PATH)",
    path: "Wherever claude installs plugins",
    scope: "User",
    reset: "Not listed among what neotoma reset removes",
  },
  {
    what: "12 Claude Code skills (when ~/.claude exists)",
    path: "~/.claude/skills/",
    scope: "User",
    reset: "Not listed among what neotoma reset removes",
  },
  {
    what: "Allow rules Bash(neotoma:*) and Bash(npm install -g neotoma:*); the first lets Claude Code run any neotoma command without asking",
    path: ".claude/settings.local.json (default), ~/.claude/settings.json with --scope both, .cursor/allowlist.json, ~/.codex/config.toml",
    scope: "Project / User",
    reset: "Not listed among what neotoma reset removes",
  },
];

const INTEGRATION_CARDS_EN: InstallIntegrationCard[] = [
  {
    href: "/neotoma-with-claude-code",
    label: "Claude Code",
    desc: "Connect Claude Code's local CLI agent to the record",
  },
  {
    href: "/neotoma-with-claude",
    label: "Claude",
    desc: "Keep a record alongside Claude's own context",
  },
  {
    href: "/neotoma-with-chatgpt",
    label: "ChatGPT",
    desc: "Connect ChatGPT conversations to the record",
  },
  {
    href: "/neotoma-with-codex",
    label: "Codex",
    desc: "Hooks, MCP and a CLI fallback for Codex tasks",
  },
  {
    href: "/neotoma-with-opencode",
    label: "OpenCode",
    desc: "Lifecycle hooks and MCP for OpenCode",
  },
  {
    href: "/neotoma-with-cursor",
    label: "Cursor",
    desc: "Connect Cursor to the record alongside its context",
  },
  {
    href: "/neotoma-with-openclaw",
    label: "OpenClaw",
    desc: "A user-owned record for OpenClaw agents",
  },
  {
    href: "/neotoma-with-ironclaw",
    label: "IronClaw",
    desc: "Structured MCP access to the record for IronClaw agents",
  },
];

const EXPANDED_STEPS_EN: InstallExpandedStep[] = [
  {
    title: "Confirm the install-first path",
    segments: [
      " - verify that the user wants to proceed now, identify their current tool, and note any major tool constraints that affect setup quality.",
    ],
  },
  {
    title: "Install only if needed",
    segments: [
      " - check whether Neotoma is already installed. If not, branch by tool: for OpenClaw, prefer ",
      { code: "openclaw plugins install clawhub:neotoma" },
      "; for other local tools, run ",
      { code: "npm install -g neotoma" },
      ". Then collapse the rest of setup into two calls: ",
      { code: "neotoma status --json" },
      " to check configuration and connectivity and ",
      { code: "neotoma setup --tool <tool> --yes" },
      " to apply init + MCP + CLI instructions + permission files idempotently. If Neotoma is already installed, just run ",
      { code: "neotoma status --json" },
      " to verify.",
    ],
  },
  {
    title: "Do not improvise shell introspection.",
    segments: [
      " Do not run ",
      { code: "python3 -c" },
      ", ",
      { code: "grep -r" },
      ", ",
      { code: "ls" },
      ", ",
      { code: "cat" },
      ", ",
      { code: "jq" },
      ", ",
      { code: "find" },
      ", ",
      { code: "which" },
      ", or ",
      { code: "node -e" },
      " to introspect Neotoma, and do not run arbitrary ",
      { code: "npm run" },
      " scripts from the user's repositories. If a permission prompt appears for anything other than ",
      { code: "neotoma *" },
      " or ",
      { code: "npm install -g neotoma" },
      ", stop and ask the user to widen the allowlist (see the Permissions pre-flight block below) rather than substituting another command.",
    ],
  },
  {
    title: "Set the first data target",
    segments: [
      " - determine what data should be stored first and, if needed, ask the user which onboarding mode they want: quick win, guided, or power user.",
    ],
  },
  {
    title: "Run activation",
    segments: [
      " - run the activation sequence: discover candidates, preview them, ingest confirmed sources, then query and correct.",
    ],
  },
  {
    title: "Configure the current tool",
    segments: [
      " - after first value is visible, set up the strongest ongoing Neotoma workflow for the tool in use. For OpenClaw, keep the native plugin path as the default and use manual MCP wiring only as fallback. If that tool is too constrained, say so explicitly and recommend a better-supported primary environment.",
    ],
  },
];

export const INSTALL_PAGE_EN: InstallPageStrings = {
  title: "Install options",
  fewMinutesIntegration: "Takes a few minutes",
  fullyReversible: "Fully reversible",
  agentAssistedInstall: "Agent-assisted install",
  directIntegrationDocs: "Direct integration docs",
  manualInstallAndDocker: "Manual install and Docker",
  startWithEvaluation: "Start with evaluation \u2192",
  manualInstall: "Manual install",
  dockerInstall: "Docker install",
  cliReference: "CLI reference \u2192",
  fullReadme: "Full README \u2192",
  moreOptions: "More options:",
  whatChangesOnSystem: "What changes on your system",
  expandedInstallFirstSequence: "Expanded install-first sequence",
  evaluateCtaBody:
    "Want the full agent-driven sequence? Start with evaluation, then let the agent install if needed, store your first records, and configure the tool you are in.",
  agentAssistedLead:
    "If you want to skip the initial evaluation page and proceed directly from install, paste this prompt into Claude, Codex, Cursor, or a similar agent. The prompt stays intentionally short; this page documents the full install-first sequence it should follow.",
  expandedPromptLeadBold: "This page expands the prompt.",
  expandedPromptLeadAfterBold:
    " The copied prompt omits detail for readability; the full install-first flow here includes:",
  expandedPromptBullets: [
    "Confirming the user wants the install-first path and identifying the current tool.",
    "Installing only if needed, then verifying configuration and connectivity with neotoma status --json.",
    "Choosing the first data to store and the onboarding mode.",
    "Running activation, then configuring the current tool for ongoing use.",
  ],
  expandedSequenceIntroPrefix:
    "Use this path only when the user already wants to proceed with Neotoma and does not need the broader fit-assessment flow on ",
  expandedSequenceIntroSuffix: ".",
  expandedSteps: EXPANDED_STEPS_EN,
  permissionsNote:
    "If your agent requires command allowlists, use the pre-flight snippets before running the prompt.",
  canonicalRefPrefix: "Canonical written reference:",
  canonicalRefAfterInstallMd: ". If the user wants the broader qualification flow first, send them to ",
  canonicalRefSuffix: ".",
  manualInstallLinkLabel: "Manual install",
  dockerLinkLabel: "Docker",
  cliReferenceLinkLabel: "CLI reference",
  hostedConnectLeadPrefix: "Connecting an agent to a hosted Neotoma instead of installing locally? Hosted Neotoma instances expose harness-specific connect snippets at their own root URL (with the host pre-filled) - see ",
  hostedConnectConnectLink: "Connect remotely",
  hostedConnectMiddle: " or try the ",
  hostedConnectSandboxLink: "public sandbox",
  hostedConnectSuffix: ".",
  impactTableCreated: "Created",
  impactTablePath: "Path",
  impactTableScope: "Scope",
  impactTableReset: "neotoma reset",
  impactRows: IMPACT_ROWS_EN,
  whatChangesIntroParagraphs: [
    [
      { code: "npm install -g neotoma" },
      " adds a CLI binary. ",
      { code: "neotoma init" },
      " creates a config directory, two local SQLite databases (development and production profiles) and an env file, and by default adds a Neotoma entry to Cursor's MCP config (~/.cursor/mcp.json). Run ",
      { code: "neotoma init --interactive" },
      " to choose each step.",
    ],
    [
      { code: "neotoma setup --tool <tool> --yes" },
      " writes more: two MCP entries (neotoma-dev and neotoma, with separate databases), CLI instruction files for Claude Code, Cursor and Codex in the project, and two allow rules, ",
      { code: "Bash(neotoma:*)" },
      " and ",
      { code: "Bash(npm install -g neotoma:*)" },
      ". The first lets Claude Code run any neotoma command without asking, including destructive ones such as ",
      { code: "neotoma reset" },
      "; ",
      { code: "--skip-permissions" },
      " writes no rules. It also installs 12 user-level skills under ~/.claude when that directory exists and, when claude is on your PATH, the Claude Code plugin (5 hooks) through two claude plugin commands; without claude on your PATH it exits with code 1 after writing the rest. Nothing runs in the background unless you start it.",
    ],
    [
      "No telemetry. The interactive CLI checks the npm registry for a newer version about once a day (off with --no-update-check or NO_UPDATE_NOTIFIER=1). The stdio MCP server checks when a session starts and about every 6 hours after (off with NO_UPDATE_NOTIFIER=1; --no-update-check applies to the CLI only). Agents can also call the npm_check_update tool, which makes the same request and is not turned off by NO_UPDATE_NOTIFIER. The request carries only the package name, and the registry sees ordinary connection metadata such as the address.",
    ],
  ],
  whatChangesFootnoteSegments: [
    { code: "neotoma reset" },
    " backs up local state to a timestamped directory before removing it. It runs ",
    { code: "npm uninstall -g neotoma" },
    " only when run from inside a Neotoma repository; elsewhere it skips the global uninstall. If your ",
    { code: ".env" },
    " sets ",
    { code: "NEOTOMA_DATA_DIR" },
    ", that directory is protected and not removed.",
  ],
  manualCardDesc: "npm install, post-install verification, start the API server, and connect MCP.",
  dockerCardDesc: "Run Neotoma in Docker with docker-compose or standalone containers.",
  integrationCards: INTEGRATION_CARDS_EN,
};

/** Spanish overlays: merge over INSTALL_PAGE_EN for `es` locale. */
export const INSTALL_PAGE_ES: Partial<InstallPageStrings> = {
  title: "Opciones de instalaci\u00f3n",
  fewMinutesIntegration: "Integraci\u00f3n en unos minutos",
  fullyReversible: "Completamente reversible",
  agentAssistedInstall: "Instalaci\u00f3n asistida por agente",
  directIntegrationDocs: "Documentaci\u00f3n de integraci\u00f3n directa",
  manualInstallAndDocker: "Instalaci\u00f3n manual y Docker",
  startWithEvaluation: "Comenzar con evaluaci\u00f3n \u2192",
  manualInstall: "Instalaci\u00f3n manual",
  dockerInstall: "Instalaci\u00f3n Docker",
  cliReference: "Referencia CLI \u2192",
  fullReadme: "README completo \u2192",
  moreOptions: "M\u00e1s opciones:",
  whatChangesOnSystem: "Qu\u00e9 cambia en tu sistema",
  expandedInstallFirstSequence: "Secuencia de instalaci\u00f3n expandida",
  evaluateCtaBody:
    "\u00bfQuieres la secuencia completa guiada por el agente? Empieza con la evaluaci\u00f3n, deja que el agente instale si hace falta, activa Neotoma con tus datos y configura la herramienta en la que est\u00e1s.",
  agentAssistedLead:
    "Si quieres saltarte la evaluaci\u00f3n inicial y seguir directamente desde la instalaci\u00f3n, pega este prompt en Claude, Codex, Cursor o un agente similar. El prompt es breve a prop\u00f3sito; esta p\u00e1gina documenta la secuencia completa de instalaci\u00f3n primero que debe seguir.",
  expandedPromptLeadBold: "Esta p\u00e1gina ampl\u00eda el prompt.",
  expandedPromptLeadAfterBold:
    " El prompt copiado omite detalle por legibilidad; el flujo completo de instalaci\u00f3n primero aqu\u00ed incluye:",
  expandedPromptBullets: [
    "Confirmar que el usuario quiere la v\u00eda de instalaci\u00f3n primero e identificar la herramienta actual.",
    "Instalar solo si hace falta y verificar la configuración y conectividad con neotoma status --json.",
    "Elegir los primeros datos a almacenar y el modo de incorporaci\u00f3n.",
    "Ejecutar la activaci\u00f3n y configurar la herramienta actual para uso continuo.",
  ],
  expandedSequenceIntroPrefix:
    "Usa esta v\u00eda solo cuando el usuario ya quiera seguir con Neotoma y no necesite el flujo m\u00e1s amplio de encaje en ",
  expandedSequenceIntroSuffix: ".",
  expandedSteps: [
    {
      title: "Confirmar la v\u00eda de instalaci\u00f3n primero",
      segments: [
        " - verificar que el usuario quiere continuar ya, identificar su herramienta actual y anotar restricciones importantes que afecten la calidad de la configuraci\u00f3n.",
      ],
    },
    INSTALL_PAGE_EN.expandedSteps[1]!,
    {
      title: "No improvises introspecci\u00f3n en shell.",
      segments: INSTALL_PAGE_EN.expandedSteps[2]!.segments,
    },
    {
      title: "Definir el primer objetivo de datos",
      segments: [
        " - determinar qu\u00e9 datos guardar primero y, si hace falta, preguntar el modo de incorporaci\u00f3n: victoria r\u00e1pida, guiado o usuario avanzado.",
      ],
    },
    {
      title: "Ejecutar la activaci\u00f3n",
      segments: [
        " - ejecuta la secuencia de activaci\u00f3n enlazada abajo: descubrir candidatos, previsualizarlos, ingerir fuentes confirmadas, reconstruir una l\u00ednea de tiempo y luego consultar y corregir.",
      ],
    },
    {
      title: "Configurar la herramienta actual",
      segments: [
        " - cuando ya haya valor visible, configura el flujo Neotoma m\u00e1s s\u00f3lido para la herramienta en uso. En OpenClaw mant\u00e9n la ruta nativa de plugin por defecto y el cableado MCP manual solo como respaldo. Si la herramienta es demasiado limitada, dilo y recomienda un entorno principal mejor soportado.",
      ],
    },
  ],
  permissionsNote:
    "Si tu agente exige listas de comandos permitidos, usa los fragmentos de pre-vuelo antes de ejecutar el prompt.",
  canonicalRefPrefix: "Referencia escrita can\u00f3nica:",
  canonicalRefAfterInstallMd: ". Si el usuario quiere primero el flujo m\u00e1s amplio de cualificaci\u00f3n, env\u00edalo a ",
  canonicalRefSuffix: ".",
  manualInstallLinkLabel: "Instalaci\u00f3n manual",
  dockerLinkLabel: "Docker",
  cliReferenceLinkLabel: "Referencia CLI",
  hostedConnectLeadPrefix:
    "\u00bfConectas un agente a un Neotoma alojado en lugar de instalar en local? Las instancias alojadas exponen fragmentos de conexi\u00f3n por harness en su propia URL ra\u00edz (con el host rellenado): consulta ",
  hostedConnectConnectLink: "Conectar remotamente",
  hostedConnectMiddle: " o prueba el ",
  hostedConnectSandboxLink: "sandbox p\u00fablico",
  hostedConnectSuffix: ".",
  impactTableCreated: "Creado",
  impactTablePath: "Ruta",
  impactTableScope: "\u00c1mbito",
  impactTableReset: "neotoma reset",
  impactRows: [
    {
      what: "Paquete npm global",
      path: "neotoma (node_modules global)",
      scope: "Global",
      reset: "npm uninstall -g neotoma",
    },
    {
      what: "Directorio de configuraci\u00f3n",
      path: "~/.config/neotoma/",
      scope: "Usuario",
      reset: "Copia de seguridad y eliminaci\u00f3n",
    },
    {
      what: "Archivo de entorno",
      path: "~/.config/neotoma/.env o <proyecto>/.env",
      scope: "Usuario / Proyecto",
      reset: "Copia de seguridad y eliminaci\u00f3n",
    },
    {
      what: "Bases SQLite (perfiles de desarrollo y producci\u00f3n)",
      path: "<data-dir>/neotoma.db, neotoma.prod.db",
      scope: "Local",
      reset: "Copia de seguridad y eliminaci\u00f3n",
    },
    {
      what: "Directorios de datos",
      path: "<data-dir>/sources/, <data-dir>/logs/",
      scope: "Local",
      reset: "Copia de seguridad y eliminaci\u00f3n",
    },
    {
      what: "Entradas de config MCP: neotoma-dev y neotoma, con bases separadas (init a\u00f1ade una a Cursor por defecto)",
      path: "~/.cursor/mcp.json, .mcp.json, claude.json, etc.",
      scope: "Usuario / Proyecto",
      reset: "Entradas eliminadas de las configs",
    },
    {
      what: "Archivos de instrucciones CLI para Claude Code, Cursor y Codex",
      path: ".cursor/rules/, .claude/rules/ y el equivalente de Codex",
      scope: "Proyecto",
      reset: "Copia de seguridad y eliminaci\u00f3n",
    },
    {
      what: "Plugin de Claude Code con 5 hooks: setup ejecuta claude plugin marketplace add y claude plugin install neotoma@neotoma-marketplace (solo si claude est\u00e1 en el PATH)",
      path: "Donde claude instala los plugins",
      scope: "Usuario",
      reset: "No figura entre lo que elimina neotoma reset",
    },
    {
      what: "12 skills de Claude Code (si existe ~/.claude)",
      path: "~/.claude/skills/",
      scope: "Usuario",
      reset: "No figura entre lo que elimina neotoma reset",
    },
    {
      what: "Reglas de permiso Bash(neotoma:*) y Bash(npm install -g neotoma:*); la primera deja que Claude Code ejecute cualquier comando neotoma sin preguntar",
      path: ".claude/settings.local.json (por defecto), ~/.claude/settings.json con --scope both, .cursor/allowlist.json, ~/.codex/config.toml",
      scope: "Proyecto / Usuario",
      reset: "No figura entre lo que elimina neotoma reset",
    },
  ],
  whatChangesIntroParagraphs: [
    [
      { code: "npm install -g neotoma" },
      " a\u00f1ade un binario CLI. ",
      { code: "neotoma init" },
      " crea un directorio de configuraci\u00f3n, dos bases SQLite locales (perfiles de desarrollo y producci\u00f3n) y un archivo env, y por defecto a\u00f1ade una entrada de Neotoma a la configuraci\u00f3n MCP de Cursor (~/.cursor/mcp.json). Ejecuta ",
      { code: "neotoma init --interactive" },
      " para elegir cada paso.",
    ],
    [
      { code: "neotoma setup --tool <tool> --yes" },
      " escribe m\u00e1s: dos entradas MCP (neotoma-dev y neotoma, con bases separadas), archivos de instrucciones CLI para Claude Code, Cursor y Codex en el proyecto y dos reglas de permiso, ",
      { code: "Bash(neotoma:*)" },
      " y ",
      { code: "Bash(npm install -g neotoma:*)" },
      ". La primera deja que Claude Code ejecute cualquier comando neotoma sin preguntar, tambi\u00e9n los destructivos como ",
      { code: "neotoma reset" },
      "; ",
      { code: "--skip-permissions" },
      " no escribe reglas. Tambi\u00e9n instala 12 skills de usuario en ~/.claude si ese directorio existe y, si claude est\u00e1 en el PATH, el plugin de Claude Code (5 hooks) mediante dos comandos claude plugin; sin claude en el PATH termina con c\u00f3digo 1 tras escribir el resto. Nada se ejecuta en segundo plano salvo que lo arranques.",
    ],
    [
      "Los agentes tambi\u00e9n pueden llamar a la herramienta npm_check_update, que hace la misma petici\u00f3n al registro de npm y no se desactiva con NO_UPDATE_NOTIFIER.",
    ],
  ],
  whatChangesFootnoteSegments: [
    { code: "neotoma reset" },
    " hace copia de seguridad de cada elemento en un directorio con marca temporal antes de eliminarlo y luego ejecuta ",
    { code: "npm uninstall -g neotoma" },
    ". Si tu ",
    { code: ".env" },
    " define ",
    { code: "NEOTOMA_DATA_DIR" },
    ", ese directorio queda protegido y no se elimina.",
  ],
  manualCardDesc: "npm install, verificaci\u00f3n post-instalaci\u00f3n, arranque del servidor API y conexi\u00f3n MCP.",
  dockerCardDesc: "Ejecuta Neotoma en Docker con docker-compose o contenedores independientes.",
  integrationCards: [
    {
      href: "/neotoma-with-claude-code",
      label: "Claude Code",
      desc: "Memoria persistente para el agente CLI local de Claude Code",
    },
    {
      href: "/neotoma-with-claude",
      label: "Claude",
      desc: "Estado estructurado junto a la memoria de la plataforma Claude",
    },
    {
      href: "/neotoma-with-chatgpt",
      label: "ChatGPT",
      desc: "Memoria determinista para conversaciones de ChatGPT",
    },
    {
      href: "/neotoma-with-codex",
      label: "Codex",
      desc: "Memoria entre tareas y respaldo por CLI",
    },
    {
      href: "/neotoma-with-opencode",
      label: "OpenCode",
      desc: "Hooks de ciclo de vida y memoria MCP para OpenCode",
    },
    {
      href: "/neotoma-with-cursor",
      label: "Cursor",
      desc: "Memoria persistente junto al contexto de Cursor",
    },
    {
      href: "/neotoma-with-openclaw",
      label: "OpenClaw",
      desc: "Memoria del usuario para agentes OpenClaw",
    },
    {
      href: "/neotoma-with-ironclaw",
      label: "IronClaw",
      desc: "Memoria MCP estructurada para agentes IronClaw",
    },
  ],
};
