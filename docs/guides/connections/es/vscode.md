# Conectar VS Code / Copilot Chat con Neotoma

VS Code puede cargar Neotoma mediante la configuración MCP del modo Agent. El archivo específico de espacio de trabajo de VS Code y el archivo MCP portable utilizan claves JSON diferentes.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración MCP manual.

## Antes de conectar

Una vía stdio local instala Neotoma en la máquina del entorno y escribe su configuración; una vía remota compatible configura un endpoint existente. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de elegir o copiar los pasos de configuración.

Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma. Node.js y el paquete instalado de Neotoma deben estar en la máquina que ejecuta un entorno stdio local. Usa `neotoma status --json` para examinar el estado del lado de Neotoma. Una conexión remota necesita un endpoint HTTPS `/mcp` accesible y autenticado; stdio local no convierte un servicio en remoto. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

Usa **MCP: Add Server** en VS Code y elige un comando stdio local o tu URL HTTPS `/mcp` autenticada. Para stdio local, ejecuta `node -p "process.execPath"` y `npm root -g`; sustituye las rutas de ejemplo siguientes por el ejecutable absoluto de Node.js y `<npm root -g>/neotoma/dist/index.js`. Confirma que existe ese punto de entrada. Esta es la forma de lanzamiento del paquete instalado que produce el generador de configuración MCP de Neotoma. Un checkout de código fuente usa en su lugar la ruta absoluta a `scripts/run_neotoma_mcp_stdio_prod.sh`. `neotoma mcp stdio` no es un comando de la CLI. Elige deliberadamente el destino de configuración. Para el formato de espacio de trabajo de VS Code, `.vscode/mcp.json` usa `servers`:

```json
{ "servers": { "neotoma": { "type": "stdio", "command": "/absolute/path/to/node", "args": ["/absolute/npm/root/neotoma/dist/index.js"], "env": { "NEOTOMA_ACTIONS_DISABLE_AUTOSTART": "1", "NEOTOMA_ENV": "production" } } } }
```

El formato portable más reciente de Copilot en VS Code usa `mcpServers` en el `.mcp.json` del espacio de trabajo o en la configuración global de Copilot; no mezcles ambos esquemas. Elige un entorno de agente que exponga herramientas MCP y examina su lista. `neotoma setup --tool vscode` puede escribir una configuración de Cursor en vez de VS Code: configura manualmente y verifica el archivo de destino.

## Verificar y recuperar

Examina la configuración activa de VS Code y el selector de herramientas del modo Agent; luego llama a `retrieve_entities` para una entidad conocida. Si faltan las herramientas, comprueba el formato `servers` frente a `mcpServers` y el espacio de trabajo elegido. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Configuración MCP de VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [Formatos de configuración de VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
