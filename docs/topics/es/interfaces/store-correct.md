# Guardar y corregir un registro

Escribe un campo declarado en la entidad prevista y después vuelve a leer su valor actual y la observación que lo produjo.

Se aplica a la versión publicada v0.25.0 (`8ca1f0a`) y al código fuente actual examinado en `4779784` el 24 de octubre de 2026. El código fuente actual añade ciertas operaciones condicionales y de corrección de varias entidades que no están en esa versión; usa el contrato de la instancia en ejecución.

## Antes de una escritura estructurada

Busca la entidad existente si puede haber una y examina su esquema activo. Usa el tipo de entidad y los campos de nivel superior declarados por el esquema. `store` acepta entidades estructuradas mediante MCP, CLI o HTTP. La CLI admite `--entities` para JSON o `--file` para un archivo JSON; la [referencia CLI completa](../../../developer/cli_reference.md#store) detalla las opciones y marcas de procedencia. El [contrato OpenAPI](../../../../openapi.yaml) indica la forma de la solicitud HTTP.

Si el hecho procede de un archivo, conserva la fuente y registra, cuando corresponda, la vía de interpretación. Un hecho directo dado en una conversación o por una aplicación no necesita fingir que vino de un documento aparte. Elige un origen de observación que describa la clase de escritura y conserva un origen de datos útil cuando el contrato lo permita.

## Comprueba el resultado

Conserva el ID de entidad devuelto. Recupera su instantánea actual y comprueba el campo y valor exactos que querías escribir. Si falta el campo, examina el esquema y los fragmentos sin procesar de la observación. Una solicitud aceptada puede conservar un campo no declarado sin proyectarlo en la instantánea de la entidad. No repitas la escritura con una identidad o clave de idempotencia nueva hasta saber si la primera llegó a guardarse.

Para corregir, lee antes el valor actual y su historial de observaciones. La acción habitual de corrección crea una observación nueva y recalcula la instantánea; no edita la observación ni la fuente anteriores. Después vuelve a leer la instantánea y compara la procedencia del campo y el historial. Si el valor previsto aún no es actual, examina la política de combinación del campo en vez de suponer que debe ganar la solicitud más reciente.

## Mantén distintas las versiones

El código fuente más reciente contiene opciones de corrección condicional y una operación de transacción atómica acotada; esto no promete que todas las instancias v0.25.0 instaladas las tengan. Consulta la ayuda de la CLI instalada o la descripción OpenAPI de esa instancia. [Esquemas y reglas de campo](https://neotoma.io/es/schemas/) explica por qué aparece un campo en la vista actual. [Examinar un cambio](https://neotoma.io/es/history/) explica cómo auditar una corrección.
