# Conectar IronClaw con Neotoma

IronClaw tiene su propio flujo de registro MCP. Neotoma no ofrece una opción de configuración para IronClaw; examina la versión del entorno y registra allí el servidor.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** registro MCP manual en el entorno.

## Antes de conectar

El registro remoto cambia la configuración del entorno IronClaw; elegir stdio local también instala e inicializa Neotoma en la máquina del entorno. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de configurar cualquiera de las dos vías.

Usa el [selector de conexión para personas](https://neotoma.io/es/install/) para comparar las vías compatibles. Elige una instancia de Neotoma a la que IronClaw pueda acceder. MCP remoto usa un endpoint HTTPS `/mcp` operado y autenticado y no requiere una CLI local de Neotoma en el cliente IronClaw; stdio local, si la versión instalada lo admite, necesita Neotoma en la máquina que lo inicia. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

Neotoma no tiene una opción `setup --tool ironclaw`. Para una versión de IronClaw que admita su comando de registro MCP, registra una URL `/mcp` de Neotoma accesible y autenticada con `ironclaw mcp add`; después usa `ironclaw mcp list` y `ironclaw mcp test neotoma` para comprobar el descubrimiento. Sigue la sintaxis y el flujo de autenticación de la versión instalada de IronClaw. Stdio local depende de que esa versión admita el transporte; la CLI de Neotoma no escribe por ti la configuración de IronClaw.

## Verificar y recuperar

Examina los servidores registrados en IronClaw y haz una llamada `retrieve_entities` de solo lectura para una entidad conocida. Si falla el registro, comprueba la sintaxis de la CLI instalada y la compatibilidad del endpoint y la autenticación. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía de Neotoma para IronClaw](../../../developer/mcp_ironclaw_setup.md)
- [CLI MCP de IronClaw](https://www.mintlify.com/nearai/ironclaw/cli/mcp)
