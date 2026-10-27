# Conectar Cursor con Neotoma

Cursor puede cargar Neotoma desde su configuración MCP de proyecto o de usuario. Elige el ámbito que quieres usar y comprueba las herramientas de Cursor después de configurarlo.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración por CLI de MCP stdio local.

## Antes de conectar

La configuración local instala una CLI, inicializa perfiles locales y puede escribir archivos MCP, de instrucciones y de permisos del entorno; hooks o skills opcionales pueden capturar eventos posteriores. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de ejecutar el comando.

Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma. El ejecutable `neotoma` debe estar en la misma máquina que ejecuta el entorno stdio local. Usa `neotoma status --json` para examinar el estado del lado de Neotoma. Una conexión remota necesita un endpoint HTTPS `/mcp` accesible y autenticado; stdio local no convierte un servicio en remoto. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

```bash
neotoma setup --tool cursor
```

Examina el archivo `.cursor/mcp.json` generado o la configuración de Cursor en el ámbito de usuario. Reinicia Cursor si aún no ha cargado el servidor nuevo. Para uso remoto, añade la URL HTTPS `/mcp` autenticada mediante la configuración MCP de Cursor y verifica que apunta a la instancia de Neotoma prevista. La capa de hooks de Neotoma es independiente de MCP y, si se activa, requiere su propia verificación.

## Verificar y recuperar

Examina el `.cursor/mcp.json` seleccionado o la configuración de usuario y la lista de herramientas de Cursor. Llama a `retrieve_entities` para una entidad conocida. Si faltan las herramientas, comprueba el destino de configuración y el PATH del binario local. Una consulta vacía no demuestra que el perfil de datos esté vacío; comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía de Neotoma para Cursor](../../../developer/mcp_cursor_setup.md)
- [Configuración MCP de Cursor](https://docs.cursor.com/context/model-context-protocol)
