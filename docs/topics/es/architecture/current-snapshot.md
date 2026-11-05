# Instantáneas actuales de entidades

Una instantánea de la entidad es la vista de campos actuales calculada a partir de las observaciones según un esquema activo y sus políticas de combinación.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Una vista con derivación

La instantánea no es una afirmación independiente. El reductor la calcula a partir de las observaciones sobre una entidad. Cada campo actual tiene procedencia que apunta a la observación de la que se seleccionó su valor. Quien lee puede seguir ese vínculo y comprobar si el valor llegó de un archivo, una escritura estructurada o una corrección.

Como los campos se seleccionan por separado, una instantánea puede combinar valores de distintas observaciones. La fuente que respalda el nombre actual no tiene por qué respaldar también el estado actual. Examina la procedencia del campo que te interesa, en vez de atribuir toda la entidad a una única fuente.

Se espera que el mismo conjunto de observaciones, esquema y configuración del reductor produzca los mismos campos actuales. La marca temporal del cálculo puede cambiar entre ejecuciones. Un cambio de esquema o política de combinación puede alterar la vista resultante sin reescribir las observaciones de origen; por eso, una explicación rigurosa de un valor actual incluye la versión del esquema.

## Lee después de escribir

La ruta de lectura estructurada está diseñada para ofrecer visibilidad inmediata después de la escritura. Recupera la entidad mediante un identificador estable o un filtro por tipo adecuado y verifica el campo recién escrito. Si una consulta devuelve inesperadamente cero resultados, demuestra que funciona con un caso conocido que sí debe aparecer antes de afirmar la ausencia. La posición en los resultados de búsqueda no determina si se guardó una escritura estructurada.

## El historial no implica una reproducción universal

Neotoma ofrece lectura histórica «a fecha de» por entidad. No deduzcas de ello una instantánea de todo el registro en un momento arbitrario para todas las entidades. Una exportación de instantáneas actuales tampoco constituye automáticamente una copia de seguridad completa de fuentes, observaciones, configuración e historial. Para recuperarte de una pérdida, utiliza la vía de copia de seguridad documentada.

La [referencia de instantáneas](../../../subsystems/entity_snapshots.md) describe campos y procedencia. [Consistencia](../../../architecture/consistency.md) explica el contrato de lectura estructurada. [Fuentes y procedencia](https://neotoma.io/es/provenance/) muestra por dónde empezar una investigación.
