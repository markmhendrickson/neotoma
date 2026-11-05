# Conecta Neotoma a Grok Bot

Conecta una instancia de Neotoma mediante los ajustes documentados de servidor MCP de Grok Bot.

**Vía de conexión manual.** Grok Bot documenta la incorporación de un servidor MCP por URL o mediante un comando en su propio ordenador. Esta vía de Neotoma no se ha probado en un host instalado. Neotoma no publica `setup --tool grok-bot`.

## Antes de conectar

Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de elegir una conexión local o remota. Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma en el ordenador del Bot si se conecta mediante un comando. La instalación de tu portátil es independiente. Una conexión por URL necesita un endpoint HTTPS autenticado accesible desde el Bot. No pegues credenciales en chats con agentes.

Todos los Bots de tu cuenta comparten el ordenador de Grok Bot: pueden acceder a sus archivos, sesiones del navegador y credenciales de línea de comandos. Un servidor MCP iniciado mediante un comando también está disponible para tus otros Bots. Las conexiones de aplicaciones pertenecen a la cuenta, así que no supongas que una conexión por URL es privada de un solo Bot. Conecta únicamente una instancia y un perfil de Neotoma adecuados para todos los Bots que puedan usar esta conexión. Si necesitas restringir el acceso a los datos, usa una instancia o credencial de Neotoma con permisos separados y comprueba a qué Bots da acceso el host.

## Configurar

Usa las [instrucciones MCP actuales de Grok Bot](https://docs.x.ai/grok-bot/computer-and-apps) para añadir tu servidor Neotoma por URL o comando. Para una URL, usa el endpoint HTTPS `/mcp` autenticado. Para un comando, dirige el Bot al proceso MCP de Neotoma instalado en su propio ordenador. Esta vía es distinta de los conectores del chat Grok. No existe un comando Neotoma `setup --tool grok-bot` verificado.

## Verificar y recuperar

Inspecciona las herramientas conectadas del Bot y recupera una entidad conocida de la instancia y el perfil de Neotoma previstos. Registrar el servidor no demuestra por sí solo que el registro esté disponible. Si falla la consulta, comprueba la conexión activa del Bot, la instancia y el perfil de destino, y el proceso local o endpoint remoto.

## Fuentes

- [Ordenador y aplicaciones de Grok Bot](https://docs.x.ai/grok-bot/computer-and-apps)
- [Cambios de Neotoma en el sistema](../../../topics/es/install/system-changes.md)
