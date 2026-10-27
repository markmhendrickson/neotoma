# Qué cambia en tu sistema

La instalación, la inicialización y la conexión de un entorno pueden afectar a máquinas y archivos de configuración distintos.

Se aplica a la versión publicada v0.26.0 (`b6ae615`) y a la comprobación de afirmaciones del 27 de octubre de 2026. Comprueba la versión y la vía de entorno que vas a usar. Un cliente remoto que se conecta a una instancia ya operada no necesita que la CLI de Neotoma esté instalada en la máquina cliente.

## Elige el efecto que buscas

Instalar el paquete npm añade un binario CLI global en la máquina donde se ejecuta el comando. `neotoma init` crea configuración local y perfiles de bases de datos de desarrollo y producción. Después, la configuración del entorno, un plugin nativo o un adaptador SDK puede cambiar la configuración de ese entorno o capturar eventos posteriores. Son decisiones separadas: conectar un cliente remoto autenticado no inicializa por sí solo un registro local de Neotoma.

Antes de ejecutar un comando, elige la [guía de conexión](https://neotoma.io/es/install/) de tu entorno. Distingue stdio local, MCP remoto autenticado, plugin nativo, configuración manual, adaptador SDK y registro. Revisa el comando y sus permisos antes de ejecutarlo; un comando de configuración completado no demuestra que el entorno pueda leer la instancia prevista ni que funcione la captura opcional.

## Archivos y permisos de una instalación local

`npm install -g neotoma@0.26.0` añade el binario CLI. `neotoma init` crea un directorio de configuración, dos bases de datos SQLite locales (perfiles de desarrollo y producción) y un archivo de entorno. Por defecto, init añade también una entrada de Neotoma a la configuración MCP de Cursor. Ejecuta `neotoma init --interactive` para elegir cada paso.

El inventario siguiente describe rutas locales y efectos del flujo documentado de instalación y configuración de Claude Code. Otros entornos tienen sus propias guías y pueden afectar a otros archivos. Estas rutas y el comportamiento de reset no prometen que un cliente remoto escriba en su propia máquina.

| Creado o modificado | Ruta | Ámbito | Comportamiento de `neotoma reset` |
| --- | --- | --- | --- |
| Paquete npm global | `node_modules` global | Global | `npm uninstall -g neotoma` solo se ejecuta si reset se llama desde un repositorio de Neotoma. |
| Directorio de configuración | `~/.config/neotoma/` | Usuario | Se crea una copia de seguridad y luego se elimina. |
| Archivo de entorno | `~/.config/neotoma/.env` o `<project>/.env` | Usuario o proyecto | Se crea una copia de seguridad y luego se elimina. |
| Bases de datos SQLite de los perfiles de desarrollo y producción | `<data-dir>/neotoma.db`, `<data-dir>/neotoma.prod.db` | Local | Se crea una copia de seguridad y luego se eliminan. |
| Directorios de datos de ambos perfiles | `<data-dir>/sources/`, `<data-dir>/logs/` (desarrollo); `<data-dir>/sources_prod/`, `<data-dir>/logs_prod/` (producción) | Local | Se crea una copia de seguridad y luego se eliminan, salvo que `NEOTOMA_DATA_DIR` proteja el directorio configurado. |
| Registros de eventos de ambos perfiles | `<data-dir>/logs/events.log` (desarrollo), `<data-dir>/logs/events.prod.log` (producción) por defecto; `NEOTOMA_EVENT_LOG_PATH` o `NEOTOMA_EVENT_LOG_DIR` pueden cambiar la ruta | Local | Comprueba la ruta resuelta antes de reset o de una copia; un directorio de datos protegido no se elimina. |
| Entradas MCP `neotoma-dev` y `neotoma`, con bases de datos distintas; init añade una entrada de Cursor por defecto | `~/.cursor/mcp.json`, `.mcp.json`, `claude.json` o configuración elegida del entorno | Usuario o proyecto | Se quitan las entradas de usuario; las de .mcp.json del proyecto pueden quedar si reset se ejecuta fuera de un repositorio de Neotoma. |
| Archivos de instrucciones CLI para Claude Code, Cursor y Codex | `.cursor/rules/`, `.claude/rules/` y el equivalente de Codex | Proyecto | Pueden quedar si reset se ejecuta fuera de un repositorio de Neotoma; elimínalos a mano. |
| Plugin de Claude Code con cinco hooks, cuando `claude` está en `PATH` | Ubicación del plugin de Claude | Usuario | No aparece entre los elementos que reset elimina. |
| Doce skills de Claude Code, cuando existe `~/.claude` | `~/.claude/skills/` | Usuario | No aparecen entre los elementos que reset elimina. |
| Reglas de permiso de Claude Code `Bash(neotoma:*)` y `Bash(npm install -g neotoma:*)` | `.claude/settings.local.json` por defecto; `~/.claude/settings.json` con `--scope both` | Proyecto o usuario | No aparecen entre los elementos que reset elimina. |
| Lista de comandos permitidos de Cursor `neotoma *` e instalación npm global | `.cursor/allowlist.json` | Proyecto | No aparece entre los elementos que reset elimina. `neotoma *` permite cualquier subcomando de Neotoma, incluido reset. |
| Aprobación de comandos de Codex `neotoma *` e instalación npm global | `~/.codex/config.toml` | Usuario | No aparece entre los elementos que reset elimina. `neotoma *` permite cualquier subcomando de Neotoma, incluido reset. |

El ejemplo de configuración de Claude Code `neotoma setup --tool claude-code --yes` escribe dos entradas MCP y archivos de instrucciones CLI para Claude Code, Cursor y Codex en el proyecto. Su paso de permisos escribe las dos reglas **de Claude Code** de la tabla; los objetivos de configuración elegidos para Cursor y Codex escriben sus respectivas reglas. La regla de Claude `Bash(neotoma:*)` puede permitir cualquier comando de Neotoma sin otra pregunta del entorno, incluidos comandos destructivos como `neotoma reset`; las reglas `neotoma *` de Cursor y Codex abarcan igualmente todos los subcomandos. Reset puede continuar sin confirmación interactiva: fuera del entorno de producción, es el comportamiento predeterminado salvo que `--interactive` pida una pregunta; esta depende además del terminal y el modo de salida. `--skip-permissions` no escribe reglas de permiso. La configuración instala también skills de usuario si existe `~/.claude` y, cuando `claude` está en `PATH`, ejecuta los comandos de marketplace e instalación del plugin de Claude Code. Si `claude` no está en `PATH`, puede terminar con código 1 después de haber escrito los demás cambios. Examina los archivos y permisos resultantes en vez de interpretar el código de salida como informe completo de efectos.

## Captura y comportamiento de red

La conexión MCP permite llamadas dirigidas por el agente desde el entorno. Los hooks, plugins y adaptadores SDK son vías de captura separadas: tras activarlos, pueden registrar automáticamente eventos posteriores compatibles. Comprueba su configuración y vuelve a leer un evento capturado; una recuperación MCP satisfactoria no demuestra captura, ni registrar un plugin demuestra acceso MCP.

No hay telemetría de producto en este flujo documentado. La CLI interactiva consulta el registro npm para saber si hay una versión nueva aproximadamente una vez al día; `--no-update-check` o `NO_UPDATE_NOTIFIER=1` desactivan esa consulta. El servidor MCP stdio consulta al comenzar una sesión y aproximadamente cada seis horas después; `NO_UPDATE_NOTIFIER=1` desactiva esa consulta, pero la opción de CLI no. Un agente puede llamar por separado a `npm_check_update`, que hace la misma solicitud al registro y no queda desactivada por `NO_UPDATE_NOTIFIER`. La solicitud incluye el nombre del paquete; el registro ve además metadatos ordinarios de conexión, como la dirección de red.

## Restablece y verifica

`neotoma reset` crea una copia de seguridad del estado local en un directorio con marca temporal antes de eliminarlo. Ejecuta `npm uninstall -g neotoma` solo si se invoca desde un repositorio de Neotoma; en otros lugares omite la desinstalación global. Si `.env` establece `NEOTOMA_DATA_DIR`, ese directorio queda protegido y no se elimina. Las filas de plugins, skills y reglas de permiso de arriba no figuran entre las eliminaciones de reset; examínalas y elimínalas por separado si eso quieres.

Tras la configuración local, examina la configuración del entorno afectado y haz una recuperación de solo lectura de una entidad conocida en la instancia y perfil previstos. Una consulta vacía satisfactoria demuestra transporte, no que hayas llegado al registro esperado. Antes de importar datos o ampliar permisos, revisa la fuente, el ámbito y el efecto elegidos. Vuelve a las [opciones de instalación](https://neotoma.io/es/install/) o a la guía de conexión correspondiente para elegir el siguiente paso.
