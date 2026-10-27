# Conectar OpenCode con Neotoma

Usa MCP para que OpenCode lea y escriba en la instancia de Neotoma elegida. El paquete opcional `@neotoma/opencode-plugin` no está publicado en npm; esta guía no ofrece su instalación.

## Requisitos previos

Opera una instancia de Neotoma y elige el transporte MCP local por stdio o remoto autenticado que admita tu versión de OpenCode. Un cliente remoto no necesita otra instalación local de Neotoma. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de configurar una instancia local.

## Configurar

Usa la [configuración de servidores MCP de OpenCode](https://opencode.ai/docs/mcp-servers/) para añadir Neotoma en `opencode.json`. Para stdio local, el binario debe estar instalado e inicializado en la máquina del entorno. Para una conexión remota, usa el endpoint HTTPS `/mcp` autenticado de la instancia operada y la autenticación que admita tu versión del entorno. Nunca pegues credenciales en una conversación.

## Verificar y recuperar

Examina las herramientas conectadas de OpenCode y llama a `retrieve_entities` para una entidad conocida en la instancia y el perfil deseados. Una respuesta vacía demuestra el transporte, no que hayas elegido el registro correcto. MCP no demuestra la captura por hooks; no actives captura en segundo plano como parte de esta conexión.

Usa el [selector de conexión para personas](https://neotoma.io/es/install/) para comparar las vías. `neotoma setup --tool opencode` no es un objetivo de configuración compatible.

## Fuentes

- [Servidores MCP de OpenCode](https://opencode.ai/docs/mcp-servers/)
- [MCP de Neotoma](../../../developer/mcp_overview.md)
