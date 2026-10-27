# Matriz de integraciones

Compara las vías de conexión de Neotoma y sus requisitos de verificación en los entornos documentados.

El comportamiento de configuración de Neotoma se comprobó en la versión publicada v0.25.0 (`8ca1f0a`) y en el código principal (`4779784`). La documentación de proveedores se consultó el 24 de octubre de 2026; la compatibilidad de las versiones instaladas de los entornos y de Windows sigue sin verificarse.

Este es el índice canónico de las vías documentadas para conectar Neotoma con distintos entornos. La lista de opciones de CLI se basa en la implementación de configuración y el [selector de conexión para personas](https://neotoma.io/es/install/). No se han hecho pruebas de humo de compatibilidad con cada entorno, especialmente en Windows y los flujos de autenticación remota. «Documentado» significa que hay una vía en el código y las guías, no que el entorno instalado haya superado una prueba completa. Consulta las [guías de conexión](https://neotoma.io/es/install/) antes de configurar un entorno.

| Entorno | Vía de Neotoma | Transporte / requisito | Verificación y límite actual |
| --- | --- | --- | --- |
| [Claude Code](../../guides/connections/es/claude-code.md) | `setup --tool claude-code` | Stdio local; HTTP remoto se configura aparte | Comprueba `/mcp` en Claude Code y haz una lectura; hooks por separado. |
| [Cursor](../../guides/connections/es/cursor.md) | `setup --tool cursor` | Stdio local; HTTP remoto se configura aparte | Examina `.cursor/mcp.json` o la configuración de usuario y la lista de herramientas; hooks por separado. |
| [Codex CLI](../../guides/connections/es/codex.md) | `setup --tool codex` | Stdio local; HTTP remoto y OAuth se configuran en Codex | Comprueba `codex mcp list` y haz una lectura. |
| [OpenClaw](../../guides/connections/es/openclaw.md) | Primero el plugin nativo; `setup --tool openclaw` solo cubre capas de configuración de Neotoma | Plugin local; MCP remoto manual | Confirma la carga del plugin por separado de la lista de herramientas MCP. |
| [Claude Desktop](../../guides/connections/es/claude-desktop.md) | `setup --tool claude-desktop --install-scope user` | Stdio local; conector remoto independiente | Examina la configuración de Desktop; el ámbito de proyecto predeterminado puede apuntar a Cursor. |
| [ChatGPT](../../guides/connections/es/chatgpt.md) | Conector MCP manual; Custom GPT Actions usa OpenAPI por separado | HTTPS autenticado accesible; sin stdio local | Comprueba las funciones del entorno y una lectura o la lista de operaciones Actions. |
| [Windsurf](../../guides/connections/es/windsurf.md) | MCP manual | Stdio local; HTTP remoto sujeto al entorno | `setup --tool windsurf` puede informar de éxito aunque escriba configuración de Cursor. |
| [Continue](../../guides/connections/es/continue.md) | MCP manual | Stdio local o transporte remoto compatible | La guía actual usa YAML o `.continue/mcpServers/`; la configuración automática puede escribir para Cursor. |
| [VS Code / Copilot Chat](../../guides/connections/es/vscode.md) | MCP manual | Stdio local o HTTP; esquemas propios del entorno | `servers` en `.vscode/mcp.json`, `mcpServers` en formato portable; la configuración automática puede escribir para Cursor. |
| [IronClaw](../../guides/connections/es/ironclaw.md) | Registro manual en el entorno | Vía MCP remota documentada; stdio local condicional | No es opción `setup --tool`; verifica con las herramientas de IronClaw. |
| [Letta](../../guides/connections/es/letta.md) | Configuración de sesión SDK | Endpoint MCP externo de Neotoma | En Agent SDK actual, las herramientas pertenecen a la sesión; la guía V1 antigua difiere. |
| [OpenCode](../../guides/connections/es/opencode.md) | Plugin y hooks; MCP se configura aparte | API local de Neotoma para captura | Volver a leer un evento de hook y consultar mediante MCP son comprobaciones distintas. |
| [Claude Agent SDK](../../guides/connections/es/claude-agent-sdk.md) | Hooks de adaptador dentro del proceso | La aplicación consumidora aporta el endpoint | Verifica el evento capturado; el adaptador no registra MCP. |
| [Smithery](../../guides/connections/es/smithery.md) | Registro de URL externa | Endpoint HTTPS `/mcp` existente | Vuelve a leer el destino registrado y haz una llamada MCP de solo lectura. |

## Alcance y procedencia

La CLI reconoce cinco opciones `setup --tool`; la vía principal de OpenClaw es el plugin nativo, así que esta matriz contiene cuatro comandos directos de configuración. El analizador de argumentos acepta algunos otros nombres, pero el escritor puede acabar generando una configuración de Cursor; este defecto de configuración se sigue por separado en las incidencias 2691 y 2681. Que la CLI termine correctamente no demuestra que se haya escrito la configuración de Windsurf, Continue o VS Code. Las guías usan vías manuales hasta que se corrijan el escritor y las pruebas. HTTP remoto necesita una instancia accesible y autenticada y compatibilidad actual del entorno con transporte y autenticación; ninguna guía supone que una entrada stdio local accede a datos remotos.

El [índice de guías de conexión](https://neotoma.io/es/install/) y cada guía distinguen la compatibilidad del código de Neotoma del comportamiento del proveedor del entorno. La [introducción a MCP](../../developer/mcp_overview.md) explica el transporte; la [referencia CLI](../../developer/cli_reference.md) define los comandos de Neotoma. El [selector de conexión para personas](https://neotoma.io/es/install/) indica los requisitos previos de instalación.

## Hooks y bibliotecas cliente

Los hooks capturan eventos de ciclo de vida; MCP permite llamadas estructuradas dirigidas por agentes. Pueden coexistir, pero uno no verifica el otro. Guías de código: [Claude Code](../hooks/claude_code.md), [Cursor](../hooks/cursor.md), [Codex CLI](../hooks/codex_cli.md), [OpenCode](../hooks/opencode.md) y [Claude Agent SDK](../hooks/claude_agent_sdk.md). Las aplicaciones pueden usar el [cliente TypeScript](../../../packages/client) o el [cliente Python](../../../packages/client-python) sin un entorno de agente.

## Añadir un entorno

Confirma la documentación principal del entorno y una vía de configuración operativa; después añade una guía de conexión con su tipo de configuración, requisitos previos, verificación y vía de recuperación. Actualiza `src/shared/harness_connections.ts` y las entradas de instalación de `frontend/src/site/docs_viewer_manifest.ts` con el mismo ID. Afirma compatibilidad con `setup --tool` solo cuando el escritor de la CLI apunte a la configuración real del entorno y una prueba del efecto lo demuestre.
