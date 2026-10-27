# Examinar un cambio

Compara el campo actual de una entidad con las observaciones que lo produjeron antes de concluir qué cambió.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Empieza por el campo actual

Recupera la instantánea de la entidad por ID e identifica el campo. Comprueba el tipo de entidad y el esquema activo. El campo actual es un resultado calculado, no una copia de un documento fuente mutable. La procedencia del campo identifica la observación elegida según la política de combinación aplicable. Si el campo no aparece en la instantánea, investiga si la escritura intentada acabó como fragmento sin procesar porque no estaba declarado.

Después enumera las observaciones de la entidad. Compara los valores candidatos, sus momentos registrados, tipos de fuente y atribución. Una corrección aporta otra observación. La anterior permanece en la ruta normal del historial, así que puedes ver la afirmación previa y la nueva. Una observación respaldada por fuente también puede conducir a un registro de fuente e interpretación; una escritura estructurada directa puede no tener archivo aparte.

| Pregunta | Consulta |
| --- | --- |
| ¿Qué valor es actual? | Instantánea de la entidad, incluida la procedencia del campo |
| ¿Qué afirmaciones compitieron? | Observaciones de esa entidad y campo |
| ¿Por qué se eligió una? | Esquema activo y política de combinación del campo |
| ¿Qué material se aportó? | Fuente e interpretación, cuando existan |

## Explica la transición con precisión

No describas toda discrepancia como una escritura posterior que reemplaza una anterior. Las políticas pueden usar prioridad de fuente, recencia, especificidad o reglas de arrays. Indica qué política utiliza el esquema activo y qué observación seleccionó. El momento registrado y el momento de ingestión también responden preguntas históricas diferentes: no sustituyas uno por otro sin explicarlo.

La procedencia permite examinar la ruta registrada. No certifica que una afirmación de la fuente fuera cierta ni que una interpretación por IA produjera palabras idénticas en otra ejecución. [Fuentes y procedencia](https://neotoma.io/es/provenance/) explica el límite de la evidencia. [Instantáneas actuales](https://neotoma.io/es/current-snapshot/) describe la vista resultante, y la [referencia de observaciones](../../../subsystems/observation_architecture.md) contiene los detalles de implementación.
