# Conectar OpenClaw con Neotoma

OpenClaw se conecta primero mediante el plugin nativo de Neotoma. El comando de configuración de Neotoma puede añadir después capas de instrucciones y MCP, pero no instala ese plugin.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** primero el plugin nativo; la configuración por CLI es una capa distinta de Neotoma.

## Antes de conectar

El comando del plugin nativo cambia la instalación de plugins de OpenClaw; la configuración opcional de Neotoma también puede escribir archivos MCP, de instrucciones y de permisos. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de instalar el plugin o ejecutar la configuración.

Usa el [selector de conexión para personas](https://neotoma.io/es/install/) para comparar las vías compatibles. Para el plugin nativo, prepara la instancia de Neotoma que usará y comprueba la compatibilidad con plugins de la versión instalada de OpenClaw. Una vía stdio local necesita Neotoma en la máquina del entorno; MCP remoto autenticado tiene otros requisitos de endpoint. El comando del plugin nativo que sigue es distinto de `neotoma setup --tool openclaw`.

## Configurar

La vía nativa documentada es:

```bash
openclaw plugins install clawhub:neotoma
```

Comprueba que OpenClaw enumera y carga el plugin y luego haz una llamada de solo lectura a Neotoma. Si también necesitas las capas de instrucciones y MCP de la CLI de Neotoma, `neotoma setup --tool openclaw` es una opción reconocida; **no** instala el plugin de OpenClaw. El plugin local y una conexión MCP HTTP remota tienen requisitos distintos. Configura HTTP remoto manualmente en OpenClaw solo cuando la versión instalada admita ese transporte y tu endpoint `/mcp` sea accesible y autenticado.

## Verificar y recuperar

Comprueba la lista de plugins de OpenClaw y haz una llamada de solo lectura a Neotoma. Si falla la carga del plugin, examina su registro en OpenClaw. La lista de herramientas MCP de Neotoma por sí sola no demuestra que se cargó el plugin nativo. Una consulta vacía no demuestra que el perfil de datos esté vacío; comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Configuración de Neotoma para OpenClaw](../../../developer/mcp_openclaw_setup.md)
- [Instalación de plugins de OpenClaw](https://docs.openclaw.ai/cli/plugins/install)
