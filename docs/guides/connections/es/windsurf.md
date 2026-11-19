# Conectar Windsurf con Neotoma

El agente Cascade anterior de Windsurf admite configuración MCP manual. Antes de añadir Neotoma, comprueba qué agente y formato de configuración utiliza tu versión instalada.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración MCP manual.

## Antes de conectar

Una vía stdio local instala Neotoma en la máquina del entorno y escribe su configuración; una vía remota compatible configura un endpoint existente. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de elegir o copiar los pasos de configuración.

Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma. Node.js y el paquete instalado de Neotoma deben estar en la máquina que ejecuta un entorno stdio local. Usa `neotoma status --json` para examinar el estado del lado de Neotoma. Una conexión remota necesita un endpoint HTTPS `/mcp` accesible y autenticado; stdio local no convierte un servicio en remoto. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

Para el agente Cascade anterior, añade una entrada stdio local a su configuración MCP (`mcp_config.json`, accesible desde el menú MCP de Cascade).

Ejecuta `node -p "process.execPath"` y `npm root -g` para obtener la ruta absoluta del ejecutable Node.js y la raíz de paquetes globales. Sustituye las rutas de ejemplo de abajo; la segunda es `<npm root -g>/neotoma/dist/index.js`. Confirma que existe ese punto de entrada. Coincide con el paquete instalado que utiliza el generador de configuración MCP de Neotoma. Un checkout de código fuente utiliza, en cambio, la ruta absoluta a `scripts/run_neotoma_mcp_stdio_prod.sh`. `neotoma mcp stdio` no es un comando de la CLI.

```json
{ "mcpServers": { "neotoma": { "command": "/absolute/path/to/node", "args": ["/absolute/npm/root/neotoma/dist/index.js"], "env": { "NEOTOMA_ACTIONS_DISABLE_AUTOSTART": "1", "NEOTOMA_ENV": "production" } } } }
```

Recarga el agente y examina la lista de herramientas MCP de Cascade. El agente Devin Local predeterminado actual usa archivos de configuración de Devin CLI, no este archivo antiguo de Cascade; sigue las instrucciones principales del proveedor para ese agente. Una entrada HTTP remota usa tu URL HTTPS `/mcp` autenticada y la sintaxis de transporte HTTP actual del agente elegido. `neotoma setup --tool windsurf` acepta actualmente el nombre, pero puede escribir una configuración de Cursor; por eso **no** es la vía recomendada. Comprueba el archivo de Windsurf, no solo la salida del comando.

## Verificar y recuperar

Examina la configuración y lista de herramientas del agente activo y llama a `retrieve_entities` para una entidad conocida. Si la configuración informó de éxito pero no existe una entrada de Windsurf, comprueba si escribió una configuración de Cursor. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía manual de Neotoma para Windsurf](../../../developer/mcp_windsurf_setup.md)
- [Documentación MCP de Windsurf](https://docs.devin.ai/desktop/cascade/mcp)
