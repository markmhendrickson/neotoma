# Conectar Claude Code con Neotoma

Claude Code puede iniciar Neotoma como proceso MCP local mientras trabajas en un proyecto. Usa la opción de configuración compatible de Neotoma y después examina la conexión en Claude Code.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración por CLI de MCP stdio local.

## Antes de conectar

La configuración local instala una CLI, inicializa perfiles locales y puede escribir archivos MCP, de instrucciones y de permisos del entorno; hooks o skills opcionales pueden capturar eventos posteriores. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de ejecutar el comando.

Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma. El ejecutable `neotoma` debe estar en la misma máquina que ejecuta el entorno stdio local. Usa `neotoma status --json` para examinar el estado del lado de Neotoma. Una conexión remota necesita un endpoint HTTPS `/mcp` accesible y autenticado; stdio local no convierte un servicio en remoto. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

```bash
neotoma setup --tool claude-code
```

Esta opción escribe la entrada MCP y las capas de instrucciones de Neotoma para Claude Code. Examina el `.mcp.json` del proyecto o el ámbito de usuario elegido: son ámbitos diferentes. En Claude Code, ejecuta `/mcp` para confirmar que el servidor está conectado. Para una instancia remota de Neotoma, configura un endpoint MCP HTTP autenticado mediante el flujo propio de Claude Code, `claude mcp add --transport http`, en lugar de suponer que stdio local alcanza la instancia remota. Los hooks y skills son capacidades independientes; una conexión MCP no demuestra que estén activos.

## Verificar y recuperar

En Claude Code, ejecuta `/mcp`. Confirma la instancia local y el perfil de datos seleccionados mediante la configuración MCP y `neotoma status --json`; para acceso remoto, compara la URL `/mcp` autenticada con el host previsto. En un perfil existente, recupera una entidad conocida **antes de escribir** y comprueba que pertenece al perfil previsto. En un perfil nuevo y vacío, la lista de herramientas MCP confirma el transporte y el acceso a herramientas, no que el perfil de datos sea el previsto; no crees datos de prueba solo para verificar la instalación. Después de la primera escritura de datos aportados y autorizada por el usuario, recupera el ID exacto de la entidad devuelta para confirmar la vía de lectura y escritura de la instancia conectada; eso todavía no demuestra de manera independiente que se eligiera el destino previsto. Si falta el servidor, examina el `.mcp.json` o la entrada de usuario elegidos y el PATH local de `neotoma`. Comprueba por separado hooks, skills y permisos.

## Fuentes

- [Guía de Neotoma para Claude Code](../../../developer/mcp_claude_code_setup.md)
- [MCP en Claude Code](https://docs.anthropic.com/en/docs/claude-code/mcp)
