# Conecta Neotoma a Antigravity

Conecta una instancia de Neotoma mediante los ajustes de servidor MCP personalizado de Antigravity.

**Vía de conexión manual.** Antigravity documenta servidores MCP personalizados, pero esta vía de Neotoma no se ha probado en un host instalado. Neotoma no publica `setup --tool antigravity`.

## Antes de conectar

Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de elegir una conexión local o remota. Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma en el equipo que ejecuta el entorno local. Una conexión remota necesita un endpoint HTTPS autenticado ya disponible; `stdio` local no hace accesible la instancia desde otro equipo. No guardes credenciales en archivos compartidos ni las pegues en chats con agentes.

## Configurar

Abre los [ajustes MCP de Antigravity](https://www.antigravity.google/docs/mcp?tab=cli) y añade un servidor personalizado. Para una instancia local, dirige la entrada `stdio` al proceso MCP de Neotoma instalado en ese equipo. Para una instancia remota, usa el endpoint HTTPS `/mcp` autenticado y el formato Streamable HTTP actual de Antigravity. Sigue las instrucciones actuales de autenticación del entorno. No existe un comando Neotoma `setup --tool antigravity` verificado.

## Verificar y recuperar

Inspecciona las herramientas que expone Antigravity y recupera en solo lectura una entidad conocida de la instancia y el perfil previstos. Una conexión correcta por sí sola no demuestra que llegue a tus registros. Si la herramienta no aparece, comprueba la configuración activa y el proceso Neotoma o endpoint remoto antes de cambiar credenciales o datos.

## Fuentes

- [Ajustes MCP de Antigravity](https://www.antigravity.google/docs/mcp?tab=cli)
- [Cambios de Neotoma en el sistema](../../../topics/es/install/system-changes.md)
