# El modelo del registro

Neotoma separa la identidad estable de una cosa de las observaciones sobre ella y de la vista actual calculada a partir de esas observaciones.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Cuatro objetos útiles

Una **fuente** es material registrado, como un archivo o datos estructurados aportados expresamente. Una **observación** afirma uno o más campos sobre un objetivo. Una **entidad** es el objetivo estable: una persona, empresa, tarea, documento u otro tipo declarado. Una **instantánea de la entidad** es la vista calculada de sus campos actuales. Cada objeto cumple una función distinta. Una observación nueva puede cambiar la instantánea sin cambiar la identidad de la entidad ni reescribir la fuente.

En el caso habitual de un archivo, la ruta va de fuente a interpretación, luego a observación y finalmente a instantánea de la entidad. Una escritura estructurada también puede registrar una observación sin guardar un archivo fuente aparte. No presupongas que toda observación tiene detrás bytes de un documento: examina la procedencia de la fila concreta.

## Por qué se separan identidad y estado

El ID de entidad identifica el objetivo lógico para que observaciones de distintos envíos puedan referirse a la misma cosa. El nombre o estado actual es un valor observado y puede cambiar. Separar el objetivo de sus campos actuales permite comparar afirmaciones anteriores y presentes sin tratar cada edición como una cosa nueva.

La resolución y combinación de entidades tienen reglas propias. Que un valor de campo se parezca al nombre de una persona o empresa no garantiza que se haya creado otra entidad relacionada ni una relación. Examina la entidad y el grafo resultantes en vez de deducir esos vínculos de la forma de entrada.

## Lee la vista actual

El reductor usa el esquema declarado del tipo de entidad y sus políticas de combinación por campo para seleccionar valores actuales. Por eso la instantánea es útil para leer, pero las observaciones siguen siendo la evidencia duradera. Un campo de la instantánea debe permitir seguir el rastro hasta la observación que aportó su valor. Si un campo no apareció después de escribir, comprueba el esquema activo y la observación guardada antes de suponer que la escritura cambió la instantánea.

Lee [Observaciones](https://neotoma.io/es/observations/) para conocer la capa de evidencia e [Instantáneas actuales](https://neotoma.io/es/current-snapshot/) para la vista derivada. Las referencias extensas de [entidades](../../../subsystems/entities.md) e [instantáneas](../../../subsystems/entity_snapshots.md) describen sus formas almacenadas.
