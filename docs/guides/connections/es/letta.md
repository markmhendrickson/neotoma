# Conectar Letta con Neotoma

Letta Agent SDK puede añadir herramientas MCP de Neotoma a una sesión. Configura el endpoint en la aplicación SDK y verifica las herramientas de esa sesión.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** configuración de una sesión de Letta Agent SDK para un endpoint MCP de Neotoma.

## Antes de conectar

Registrar el servidor en la sesión cambia las herramientas disponibles en Letta, mientras los datos de Neotoma permanecen en el endpoint operado. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de añadirlo.

Usa el [selector de conexión para personas](https://neotoma.io/es/install/) para comparar las vías compatibles. Para la sesión de Letta Agent SDK, utiliza un endpoint HTTPS `/mcp` de Neotoma ya operado, accesible y autenticado. El registro no instala Neotoma en la máquina cliente de Letta. Comprueba la API de sesiones actual y no guardes credenciales en archivos de proyecto compartidos.

## Configurar

Opera un endpoint HTTPS `/mcp` de Neotoma accesible y autenticado. En el Letta Agent SDK actual, pásalo en `mcpServers` al crear o reanudar una sesión:

```ts
await using session = client.resumeSession("YOUR_AGENT_ID", {
  mcpServers: {
    neotoma: {
      type: "http",
      url: "https://YOUR-HOST/mcp",
      headers: { Authorization: `Bearer ${process.env.NEOTOMA_TOKEN}` },
    },
  },
});
```

Usa la inicialización de `LettaAgentClient` de la guía actual de Letta. Estas herramientas pertenecen a la sesión SDK, no quedan guardadas en el agente de Letta. La guía antigua de Neotoma describe un registro V1 mediante `mcp_servers.create()`; no lo copies en una aplicación Agent SDK actual sin comprobar su versión. Neotoma no tiene opción `setup --tool letta`. La dirección importa: el servidor MCP alojado por Letta expone agentes de Letta a otros clientes; esta vía da a un agente de Letta herramientas de Neotoma.

Verifica que la sesión expone `mcp__neotoma__retrieve_entities` y pide al agente que la llame. Si la inicialización termina pero el agente no ve herramientas de Neotoma, examina primero el resultado de la conexión MCP de la sesión y la autenticación del endpoint, antes de investigar los datos.

## Verificar y recuperar

Examina las herramientas MCP de la sesión y llama a `retrieve_entities` para una entidad conocida. Si no aparece la herramienta, compara la versión del SDK y el formato de registro por sesión. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía de Neotoma para Letta](../../../developer/mcp_letta_setup.md)
- [Herramientas MCP de Letta Agent SDK](https://docs.letta.com/agent-sdk/mcp)
