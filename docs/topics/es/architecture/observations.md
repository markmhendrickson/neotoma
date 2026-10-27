# Observaciones

Una observación registra una afirmación sobre una entidad en un momento del historial; una afirmación posterior no edita la anterior.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Qué contiene una observación

Una observación se refiere a una entidad y contiene campos, tiempos, contexto de esquema y procedencia. Su fuente puede ser un archivo aportado u otra entrada registrada. Una escritura estructurada de un agente o una corrección puede no tener archivo fuente aparte; la falta de enlace a un documento no demuestra por sí sola que la observación sea inválida. Su atribución y contexto de escritura siguen importando.

Los campos se interpretan según un esquema declarado para el tipo de entidad. Una clave enviada que el esquema no declara puede conservarse como fragmento sin procesar en lugar de aparecer entre los campos actuales de la entidad. Después de escribir, recupera la entidad y verifica el campo exacto, no solo el estado de la respuesta.

Omitir un campo dice menos que aportar un valor explícito. Por ejemplo, omitir el estado en una observación nueva deja la afirmación de estado anterior disponible para el reductor; indicar un estado concreto crea otra afirmación que debe considerar. `null`, cero y una cadena vacía también tienen significados propios según el esquema: no los uses indiscriminadamente como «desconocido».

## Las correcciones añaden evidencia

Una corrección crea otra observación. La anterior sigue disponible para examen, lo que permite entender por qué el valor actual difiere del primero registrado. Las correcciones reciben una prioridad propia en la vía de reducción configurada, pero el resultado efectivo depende de la política de combinación del campo. No presupongas que todos los campos siguen la misma regla para elegir el valor ganador.

En un campo con política `last_write`, decide la marca temporal observada más reciente. Con `highest_priority`, deciden la prioridad de fuente y luego los desempates definidos. Las políticas de combinación de arrays tienen reglas propias de contribución. Lee la política del tipo de entidad antes de predecir qué valor ganará.

## Reinterpretación e historial

Reinterpretar una fuente crea observaciones nuevas con su propio contexto de configuración; no altera silenciosamente la interpretación anterior. La extracción asistida por IA puede dar otro resultado en una ejecución posterior: examina la observación nueva y su configuración. El cálculo determinista de la instantánea empieza una vez fijados el conjunto de observaciones y el esquema.

La [arquitectura de observaciones](../../../subsystems/observation_architecture.md) describe el ciclo de vida. [Resolución de conflictos](../../../subsystems/conflict_resolution.md) define las políticas por campo. Continúa con [Instantáneas actuales](https://neotoma.io/es/current-snapshot/) para ver cómo se calcula una respuesta presente.
