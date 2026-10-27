# Buscar y leer un registro

Empieza por la identidad y el tipo de lo que necesitas; después examina el valor actual y su evidencia.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Acota la pregunta

Si tienes el ID devuelto de una entidad, recupérala primero por ese ID exacto. Si tienes un identificador estable, usa la recuperación por identificador. Para una pregunta por categoría, consulta con un tipo de entidad y un límite de resultados. Una búsqueda amplia de texto sirve para descubrir candidatos, pero compartir palabras no demuestra que dos resultados sean la misma entidad.

| Qué sabes | Primera lectura adecuada | Comprobación posterior |
| --- | --- | --- |
| ID exacto de entidad | Instantánea de la entidad o `entities get` | Tipo, campos y contexto de observaciones |
| Un identificador | Recuperación por identificador o `entities search` | A qué entidad se resolvió el identificador |
| Un tipo y algunos campos | Consulta de entidades filtrada o `entities list --type` | Ámbito de usuario y paginación |
| Una persona u organización descrita de varias maneras | Identificación por varias señales | Identidades candidatas antes de escribir |

En terminal, `neotoma schemas list` y `neotoma entities list --type task --limit 5` ilustran la lectura sin modificar datos. El tipo debe existir en la instancia elegida. Para clientes HTTP, [OpenAPI](../../../../openapi.yaml) define `POST /entities/query` y las rutas de instantáneas. Los clientes MCP exponen herramientas de recuperación en la instancia configurada. [Interfaces](https://neotoma.io/es/interfaces/) ayuda a elegir la vía del cliente.

## Verifica un resultado vacío

Cero resultados pueden significar que la consulta usó un tipo o campo incorrecto, otra instancia o ámbito de usuario, que se omitió una página de resultados o que realmente no hay coincidencias. Antes de afirmar ausencia, lee mediante la misma conexión una entidad que sabes que existe. Después examina el esquema y amplía la consulta con cuidado. Un caso conocido que da resultado valida la vía; no demuestra que todos los modos de búsqueda sean completos.

Cuando una búsqueda textual sigue a una escritura reciente, vuelve a leer mediante el ID exacto devuelto. Un índice de búsqueda puede ir por detrás de la escritura; la instantánea de la entidad es el lugar apropiado para verificar el resultado inmediato. La [referencia del subsistema de búsqueda](../../../subsystems/search/search.md) explica indexación y filtros.

## Lee más allá de la respuesta

La instantánea es la vista actual, no la cadena completa de afirmaciones. Para un valor discutido, enumera sus observaciones y examina la procedencia del campo. Una observación respaldada por fuente puede apuntar a un archivo y una interpretación; un hecho directo puede no tener archivo aparte. [Examinar un cambio](https://neotoma.io/es/history/) explica cómo comparar, y [Fuentes y procedencia](https://neotoma.io/es/provenance/) explica qué puede demostrar la trazabilidad.
