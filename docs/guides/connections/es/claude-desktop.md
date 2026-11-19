# Conectar Claude Desktop con Neotoma

Claude Desktop carga servidores MCP locales desde su configuración de usuario. Para escribir en el destino de Desktop, la configuración de Neotoma necesita indicar expresamente el ámbito de usuario.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración por CLI con ámbito de usuario para MCP stdio local.

## Antes de conectar

La configuración local instala una CLI, inicializa perfiles locales y puede escribir archivos MCP, de instrucciones y de permisos del entorno; hooks o skills opcionales pueden capturar eventos posteriores. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de ejecutar el comando.

Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma. El ejecutable `neotoma` debe estar en la misma máquina que ejecuta el entorno stdio local. Usa `neotoma status --json` para examinar el estado del lado de Neotoma. Una conexión remota necesita un endpoint HTTPS `/mcp` accesible y autenticado; stdio local no convierte un servicio en remoto. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

```bash
neotoma setup --tool claude-desktop --install-scope user
```

El ámbito de usuario explícito importa: la vía predeterminada de configuración del proyecto puede apuntar a `.cursor/mcp.json` en lugar de a la configuración de Desktop. Examina la configuración MCP real de Claude Desktop y reinicia la aplicación. Un conector remoto de Claude es otro flujo del entorno que necesita un endpoint autenticado y accesible; este comando stdio local no lo configura.

## Verificar y recuperar

Examina `claude_desktop_config.json`, reinicia Desktop y llama a `retrieve_entities` para una entidad conocida. Si no se escribió el archivo, confirma `--install-scope user` y examina la salida de la CLI. Una consulta vacía no demuestra que el perfil de datos esté vacío; comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía rápida de MCP para Desktop](https://modelcontextprotocol.io/quickstart/user)
