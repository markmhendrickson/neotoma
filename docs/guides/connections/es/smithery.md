# Conectar Smithery con Neotoma

Smithery puede publicar para descubrimiento un endpoint MCP HTTPS de Neotoma ya existente. La publicación en el registro y una conexión autenticada que permita usar herramientas necesitan comprobaciones distintas.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** registro externo de una URL HTTPS.

## Antes de conectar

La publicación en el registro expone la dirección del endpoint seleccionado y metadatos de conexión; no instala Neotoma por sí misma. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de registrar el endpoint.

Usa el [selector de conexión para personas](https://neotoma.io/es/install/) para comparar las vías compatibles. Opera un endpoint HTTPS `/mcp` autenticado de Neotoma antes de registrarlo. Smithery recibe el registro de un endpoint; no instala ni inicializa Neotoma en la máquina de quien visite la página. No guardes credenciales en archivos de proyecto compartidos.

## Configurar

Smithery es una vía de descubrimiento y registro, no un entorno local de Neotoma. Primero opera un endpoint HTTPS autenticado que sirva `/mcp` de Neotoma y valida el acceso desde la red que utilizará Smithery. Sigue después el flujo de publicación de URL externa de Smithery, proporcionando ese endpoint y únicamente el esquema de configuración necesario para registrarlo. No hay comando `neotoma setup --tool smithery` ni servidor específico de Smithery incluido para instalar.

Tras el registro, vuelve a leer la entrada y confirma que apunta a la URL `/mcp` prevista. Haz una llamada MCP de solo lectura a través de la conexión publicada. Si falla el análisis, comprueba que el endpoint sea accesible, el descubrimiento de autenticación y los metadatos de la ficha del servidor; una ficha publicada por sí sola no demuestra que la conexión con las herramientas funcione.

## Verificar y recuperar

Vuelve a leer la entrada de Smithery y compara su URL con el endpoint HTTPS `/mcp` previsto. Llama a `retrieve_entities` a través de la conexión para una entidad conocida; una ficha publicada no basta. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía de URL externa de Neotoma para Smithery](../../../integrations/smithery_external_url.md)
- [Servidores externos de Smithery](https://smithery.ai/docs/build/publish)
