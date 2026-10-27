# Conectar Codex CLI con Neotoma

Codex CLI lee los servidores MCP de su configuración. La opción de configuración de Neotoma escribe una entrada stdio local; un servidor remoto necesita el flujo HTTP y de autenticación independiente de Codex.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración por CLI de MCP stdio local.

## Antes de conectar

La configuración local instala una CLI, inicializa perfiles locales y puede escribir archivos MCP, de instrucciones y de permisos del entorno; hooks o skills opcionales pueden capturar eventos posteriores. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de ejecutar el comando.

Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma. El ejecutable `neotoma` debe estar en la misma máquina que ejecuta el entorno stdio local. Usa `neotoma status --json` para examinar el estado del lado de Neotoma. Una conexión remota necesita un endpoint HTTPS `/mcp` accesible y autenticado; stdio local no convierte un servicio en remoto. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

```bash
neotoma setup --tool codex
```

Examina `~/.codex/config.toml` y ejecuta `codex mcp list`; después de iniciar el servidor, haz desde Codex una llamada de solo lectura a Neotoma. La configuración local no establece una sesión OAuth remota. Para un endpoint remoto, usa `codex mcp add neotoma --url https://YOUR-HOST/mcp` y completa el flujo de autenticación del entorno. Verifica las reglas de permisos o aprobación dentro de Codex en vez de confiar solo en el texto de configuración generado.

## Verificar y recuperar

Ejecuta `codex mcp list` y después llama a `retrieve_entities` para una entidad conocida. Si la detección funciona pero la consulta falla, comprueba por separado el registro del proceso local o el OAuth y endpoint remotos. Una consulta vacía no demuestra que el perfil de datos esté vacío; comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Configuración MCP de Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
