# Conectar Continue con Neotoma

Continue carga herramientas MCP mediante su configuración actual de agente. Añade Neotoma en el formato utilizado por la versión de Continue que tienes instalada y después examina el modo Agent.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración MCP manual.

## Antes de conectar

Una vía stdio local instala Neotoma en la máquina del entorno y escribe su configuración; una vía remota compatible configura un endpoint existente. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de elegir o copiar los pasos de configuración.

Sigue el [selector de conexión para personas](https://neotoma.io/es/install/) para instalar e inicializar Neotoma. Node.js y el paquete instalado de Neotoma deben estar en la máquina que ejecuta un entorno stdio local. Usa `neotoma status --json` para examinar el estado del lado de Neotoma. Una conexión remota necesita un endpoint HTTPS `/mcp` accesible y autenticado; stdio local no convierte un servicio en remoto. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

La documentación actual de Continue usa `config.yaml` con una lista `mcpServers`. Añade una entrada local a la configuración activa de Continue.

Encuentra el ejecutable absoluto de Node.js y la raíz de paquetes globales sin cambiar ninguna instalación:

```bash
node -p "process.execPath"
npm root -g
```

Sustituye las dos rutas de ejemplo siguientes por esos resultados. La segunda ruta es `<npm root -g>/neotoma/dist/index.js`; confirma que el archivo existe antes de guardar la configuración del entorno. Es el mismo punto de entrada stdio del paquete instalado que utiliza el generador MCP de Neotoma. Un checkout de código fuente usa en su lugar la ruta absoluta a `scripts/run_neotoma_mcp_stdio_prod.sh`. No uses `neotoma mcp stdio`: la CLI no tiene ese comando.

```yaml
mcpServers:
  - name: Neotoma
    command: /absolute/path/to/node
    args:
      - /absolute/npm/root/neotoma/dist/index.js
    env:
      NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1"
      NEOTOMA_ENV: production
```

Continue también documenta archivos de servidor JSON en `.continue/mcpServers/`; sigue ese formato si tu versión instalada lo usa. Recarga el IDE, elige el modo Agent y examina la lista de herramientas. El ejemplo `~/.continue/config.json` de la guía antigua de Neotoma quizá no coincida con las versiones actuales de Continue. `neotoma setup --tool continue` puede escribir una configuración de Cursor en vez de Continue: usa la vía manual y examina el archivo real.

## Verificar y recuperar

Examina la lista de herramientas del modo Agent de Continue y llama a `retrieve_entities` para una entidad conocida. Si falta el servidor, compara la ubicación YAML o JSON guardada con la documentación de la versión instalada; no confíes en un código de éxito de configuración. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Configuración MCP de Continue](https://docs.continue.dev/customize/deep-dives/mcp)
- [Guía antigua de Neotoma](../../../developer/mcp_continue_setup.md)
