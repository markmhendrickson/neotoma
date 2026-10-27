# Fuentes y procedencia

Un valor actual de una entidad solo es útil si quien lo lee puede identificar la evidencia registrada que lo respalda.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Sigue un valor hacia atrás

Empieza por la instantánea actual de la entidad. Examina las observaciones del campo, incluidas las correcciones, y después la fuente y el contexto registrado de cada observación. Antes de concluir que una fuente no existe a partir de una consulta sin resultados, comprueba la consulta con un caso conocido que deba aparecer.

Esta ruta importa cuando dos herramientas comunican valores diferentes. La instantánea actual de Neotoma determina el estado que mantienen los agentes, y el historial de observaciones explica la transición. La fuente no se cambia silenciosamente para hacer que la respuesta más reciente parezca cierta desde siempre.

En una interpretación respaldada por fuente, el rastro puede incluir el material original y la configuración de interpretación. Una escritura estructurada directa o una corrección puede no tener archivo fuente separado. En ese caso, examina la atribución, el momento y el contexto de escritura de la observación en lugar de prometer un documento inexistente.

## Compara afirmaciones discrepantes

Cuando dos observaciones discrepan, identifica primero la entidad y el campo. Después lee la política de combinación del esquema activo para ese campo. Recencia, prioridad de fuente, especificidad y combinación de arrays responden preguntas diferentes. El campo elegido en la instantánea debe apuntar a la observación seleccionada por la política. Esto resulta más útil que describir la última escritura como inherentemente correcta.

Si parece que una corrección no hizo nada, vuelve a leer la entidad y examina el historial de observaciones. Puede que la clave prevista no esté declarada, que la consulta apunte a otra entidad o que la política seleccione otra observación. Comprueba una recuperación con resultado conocido antes de concluir que no hay datos. Una respuesta satisfactoria de corrección solo inicia la verificación; no la termina.

## Qué puede y no puede decir el rastro

La procedencia muestra la entrada registrada y el contexto de procesamiento. No convierte en verdadero un hecho falso de la fuente ni hace perfectamente reproducible una interpretación por IA. La [referencia de arquitectura](../../../architecture/architecture.md) describe con detalle el modelo de observaciones y reductor. [Cómo funciona el registro](https://neotoma.io/es/architecture/) ofrece la secuencia breve.

Exportar campos actuales de entidades no equivale necesariamente a archivar todas las fuentes, observaciones y configuraciones necesarias para restaurar el registro. Si buscas preservación o recuperación, usa la vía documentada de copia de seguridad y verifica su contenido. Para la vista actual de campos, continúa con [Instantáneas actuales](https://neotoma.io/es/current-snapshot/).
