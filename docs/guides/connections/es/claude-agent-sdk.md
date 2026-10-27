# Conectar Claude Agent SDK con Neotoma

El adaptador de Claude Agent SDK registra en Neotoma los eventos de aplicación compatibles. Incorpora sus hooks a la aplicación consumidora y verifica un evento capturado.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** hooks de adaptador dentro del proceso.

## Antes de conectar

El adaptador cambia la aplicación consumidora y puede capturar eventos posteriores; la conexión MCP es opcional e independiente. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de activar los hooks.

Usa el [selector de conexión para personas](https://neotoma.io/es/install/) para comparar las vías compatibles. Elige un endpoint de Neotoma para la aplicación consumidora e instala allí el adaptador. Los hooks del adaptador capturan eventos a través de la aplicación; no registran MCP ni necesitan un entorno stdio local. Comprueba el endpoint, la autorización y el ámbito de captura antes de activar los hooks.

## Configurar

Añade `@neotoma/claude-agent-sdk-adapter` y `@neotoma/client` a la aplicación consumidora y monta las callbacks de `createNeotomaAgentHooks()` en las opciones `query` del SDK, como muestra la guía del adaptador. Proporciona el endpoint y la autenticación de la API de Neotoma mediante las opciones compatibles del adaptador. Ejecuta una interacción del SDK y confirma que puedes volver a leer el turno o la observación de herramienta esperados. Los hooks no registran automáticamente un servidor MCP para el agente. Si necesitas lecturas y escrituras estructuradas dirigidas por el agente, añade MCP de Neotoma por separado mediante la configuración MCP propia del SDK.

Esta es una integración de biblioteca; no existe una opción `neotoma setup --tool claude-agent-sdk`. Comprueba la versión del SDK y los nombres de hooks de la aplicación consumidora antes de copiar un ejemplo específico de versión.

## Verificar y recuperar

Ejecuta una interacción del SDK diseñada para producir una observación permitida y vuelve a leer ese evento desde Neotoma. Si no aparece, comprueba el registro de hooks, el endpoint y la autenticación en la aplicación consumidora. El descubrimiento de MCP se comprueba por separado. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía del adaptador SDK de Neotoma](../../../integrations/hooks/claude_agent_sdk.md)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
