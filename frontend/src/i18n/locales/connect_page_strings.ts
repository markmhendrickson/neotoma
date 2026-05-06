/**
 * Connect index (`/connect`) copy. Harness `label` values stay English (product names).
 */

export interface ConnectHarnessRow {
  label: string;
  desc: string;
  remote: string;
  local?: string;
}

export interface ConnectPageStrings {
  title: string;
  introP1BeforeSandbox: string;
  introSandboxLink: string;
  introP1AfterSandbox: string;
  introP1AfterMcp: string;
  introP2BeforeInstall: string;
  introInstallLink: string;
  introP2Middle: string;
  introHostedLink: string;
  introP2End: string;
  sectionPickHarness: string;
  linkRemoteMcpSetup: string;
  linkLocalStdioSetup: string;
  sectionHostRequirements: string;
  hostReqIntro: string;
  hostReqLi1Strong: string;
  hostReqLi1Body: string;
  hostReqLi2Strong: string;
  hostReqLi2Body: string;
  hostReqTip: string;
  sectionRelated: string;
  relatedInstall: string;
  relatedHosted: string;
  relatedSandbox: string;
  relatedTunnel: string;
  relatedApi: string;
  relatedMcp: string;
  harnesses: ConnectHarnessRow[];
}

export const CONNECT_PAGE_EN: ConnectPageStrings = {
  title: "Connect remotely",
  introP1BeforeSandbox: "Every hosted Neotoma instance—the ",
  introSandboxLink: "public sandbox",
  introP1AfterSandbox:
    ", a personal tunnel, or a self-hosted deployment—exposes an MCP endpoint at ",
  introP1AfterMcp:
    ". This page points you at the per-harness doc for connecting to it over HTTP without installing Neotoma locally.",
  introP2BeforeInstall: "Installing Neotoma on the same machine as your agent? Use the ",
  introInstallLink: "install guide",
  introP2Middle: " instead—stdio is faster and needs no tunnel. See ",
  introHostedLink: "Hosted Neotoma",
  introP2End: " for the flavor comparison.",
  sectionPickHarness: "Pick your harness",
  linkRemoteMcpSetup: "Remote MCP setup",
  linkLocalStdioSetup: "Local / stdio setup",
  sectionHostRequirements: "What you need from the host",
  hostReqIntro: "Each per-harness doc above expects you to know two things about the Neotoma you want to talk to:",
  hostReqLi1Strong: "MCP URL.",
  hostReqLi1Body:
    " e.g. https://sandbox.neotoma.io/mcp for the sandbox, or https://your-tunnel.example.com/mcp for a personal tunnel.",
  hostReqLi2Strong: "Auth posture.",
  hostReqLi2Body:
    " The sandbox is unauthenticated. Personal tunnels and self-hosted instances typically require OAuth or a bearer token for writes; discovery endpoints (/server-info, /.well-known/*) stay public.",
  hostReqTip:
    "Tip: the root page of any hosted Neotoma (e.g. sandbox.neotoma.io) renders harness-specific connect snippets with its own URL prefilled. The per-harness docs linked above mirror that content with placeholders you substitute manually.",
  sectionRelated: "Related",
  relatedInstall: "Install Neotoma locally",
  relatedHosted: "Hosted flavors overview",
  relatedSandbox: "Public sandbox",
  relatedTunnel: "Expose tunnel",
  relatedApi: "REST API reference",
  relatedMcp: "MCP reference",
  harnesses: [
    {
      label: "Claude Code",
      desc: "CLI agent—register with `claude mcp add --transport http`.",
      remote: "/neotoma-with-claude-code",
    },
    {
      label: "Claude Desktop",
      desc: "Desktop app—add a stdio server or remote MCP endpoint.",
      remote: "/neotoma-with-claude-connect-remote-mcp",
      local: "/neotoma-with-claude-connect-desktop",
    },
    {
      label: "claude.ai (remote MCP)",
      desc: "Web Claude with remote MCP support.",
      remote: "/neotoma-with-claude-connect-remote-mcp",
    },
    {
      label: "ChatGPT (remote MCP)",
      desc: "ChatGPT developer mode—add Neotoma as a remote MCP server.",
      remote: "/neotoma-with-chatgpt-connect-remote-mcp",
      local: "/neotoma-with-chatgpt-connect-custom-gpt",
    },
    {
      label: "Codex",
      desc: "OpenAI Codex—add an `[mcp_servers.neotoma]` block to ~/.codex/config.toml.",
      remote: "/neotoma-with-codex-connect-remote-http-oauth",
      local: "/neotoma-with-codex-connect-local-stdio",
    },
    {
      label: "OpenCode",
      desc: "OpenCode—add @neotoma/opencode-plugin to opencode.json and keep MCP configured.",
      remote: "/neotoma-with-opencode",
    },
    {
      label: "Cursor",
      desc: "Cursor IDE—add a `mcpServers` entry to .cursor/mcp.json.",
      remote: "/neotoma-with-cursor",
    },
    {
      label: "OpenClaw",
      desc: "OpenClaw agents—install via clawhub or add manual MCP config.",
      remote: "/neotoma-with-openclaw-connect-remote-http",
      local: "/neotoma-with-openclaw-connect-local-stdio",
    },
    {
      label: "IronClaw",
      desc: "IronClaw agents—add Neotoma as an HTTP MCP server with `ironclaw mcp add`.",
      remote: "/neotoma-with-ironclaw",
    },
  ],
};

/** Spanish body for `/connect`; title matches `docNav`/nav usage elsewhere. */
export const CONNECT_PAGE_ES: Partial<ConnectPageStrings> = {
  title: "Conectar remotamente",
  introP1BeforeSandbox: "Cada instancia alojada de Neotoma—el ",
  introSandboxLink: "sandbox público",
  introP1AfterSandbox:
    ", un túnel personal o un despliegue propio—expone un endpoint MCP en ",
  introP1AfterMcp:
    ". Esta página enlaza la documentación por herramienta para conectarte por HTTP sin instalar Neotoma en local.",
  introP2BeforeInstall: "¿Instalas Neotoma en la misma máquina que tu agente? Usa la ",
  introInstallLink: "guía de instalación",
  introP2Middle: " en su lugar: stdio es más rápido y no requiere túnel. Consulta ",
  introHostedLink: "Neotoma alojado",
  introP2End: " para comparar modalidades.",
  sectionPickHarness: "Elige tu entorno",
  linkRemoteMcpSetup: "Configuración MCP remota",
  linkLocalStdioSetup: "Configuración local / stdio",
  sectionHostRequirements: "Qué necesitas del host",
  hostReqIntro:
    "Cada guía por herramienta arriba asume que conoces dos cosas del Neotoma al que quieres conectar:",
  hostReqLi1Strong: "URL del MCP.",
  hostReqLi1Body:
    " p. ej. https://sandbox.neotoma.io/mcp para el sandbox, o https://tu-tunel.ejemplo.com/mcp para un túnel personal.",
  hostReqLi2Strong: "Postura de autenticación.",
  hostReqLi2Body:
    " El sandbox no requiere autenticación. Los túneles personales y las instancias autohospedadas suelen exigir OAuth o un token bearer para escrituras; los endpoints de descubrimiento (/server-info, /.well-known/*) siguen siendo públicos.",
  hostReqTip:
    "Consejo: la página raíz de cualquier Neotoma alojado (p. ej. sandbox.neotoma.io) muestra fragmentos de conexión por herramienta con su propia URL ya rellenada. Los documentos enlazados arriba repiten ese contenido con marcadores que sustituyes a mano.",
  sectionRelated: "Relacionado",
  relatedInstall: "Instalar Neotoma en local",
  relatedHosted: "Resumen de modalidades alojadas",
  relatedSandbox: "Sandbox público",
  relatedTunnel: "Exponer túnel",
  relatedApi: "Referencia REST API",
  relatedMcp: "Referencia MCP",
  harnesses: [
    {
      label: "Claude Code",
      desc: "Agente CLI—regístrate con `claude mcp add --transport http`.",
      remote: "/neotoma-with-claude-code",
    },
    {
      label: "Claude Desktop",
      desc: "Aplicación de escritorio—añade un servidor stdio o un endpoint MCP remoto.",
      remote: "/neotoma-with-claude-connect-remote-mcp",
      local: "/neotoma-with-claude-connect-desktop",
    },
    {
      label: "claude.ai (remote MCP)",
      desc: "Claude web con soporte MCP remoto.",
      remote: "/neotoma-with-claude-connect-remote-mcp",
    },
    {
      label: "ChatGPT (remote MCP)",
      desc: "Modo desarrollador de ChatGPT—añade Neotoma como servidor MCP remoto.",
      remote: "/neotoma-with-chatgpt-connect-remote-mcp",
      local: "/neotoma-with-chatgpt-connect-custom-gpt",
    },
    {
      label: "Codex",
      desc: "OpenAI Codex—añade un bloque `[mcp_servers.neotoma]` en ~/.codex/config.toml.",
      remote: "/neotoma-with-codex-connect-remote-http-oauth",
      local: "/neotoma-with-codex-connect-local-stdio",
    },
    {
      label: "OpenCode",
      desc: "OpenCode—añade @neotoma/opencode-plugin en opencode.json y mantén MCP configurado.",
      remote: "/neotoma-with-opencode",
    },
    {
      label: "Cursor",
      desc: "Cursor IDE—añade una entrada `mcpServers` en .cursor/mcp.json.",
      remote: "/neotoma-with-cursor",
    },
    {
      label: "OpenClaw",
      desc: "Agentes OpenClaw—instala vía clawhub o añade configuración MCP manual.",
      remote: "/neotoma-with-openclaw-connect-remote-http",
      local: "/neotoma-with-openclaw-connect-local-stdio",
    },
    {
      label: "IronClaw",
      desc: "Agentes IronClaw—añade Neotoma como servidor MCP HTTP con `ironclaw mcp add`.",
      remote: "/neotoma-with-ironclaw",
    },
  ],
};
