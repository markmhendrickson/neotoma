# Esquemas y reglas de campo

El esquema de una entidad declara qué campos pertenecen a un tipo y cómo las observaciones de cada campo se convierten en un valor actual.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Campos declarados

El registro de esquemas describe los campos de un tipo de entidad, sus tipos, las reglas opcionales de validación y conversión y su política de combinación. Esa declaración forma parte práctica del contrato de escritura. Si un agente envía una clave sin campo declarado, una respuesta satisfactoria de almacenamiento no significa que la clave aparezca en la instantánea de la entidad. Puede conservarse entre los fragmentos sin procesar.

Por eso, el cliente debe examinar el esquema correspondiente antes de elegir nombres de campo. Tras guardar, recupera la entidad y comprueba el campo y valor previstos. Comprobar únicamente que la acción de escritura devolvió éxito deja sin detectar un fallo real.

## La política de combinación determina el estado actual

Dos observaciones pueden discrepar sin borrar ninguna. El reductor aplica la política configurada para el campo: por ejemplo, recencia, prioridad de fuente, especificidad o combinación de arrays. La política importa más que una regla general sobre qué escritor es autoritativo. Un esquema descubierto automáticamente puede usar `last_write` por defecto; una prioridad de fuente aportada no tendrá efecto sobre ese campo hasta registrar una política que utilice prioridades.

Omitir un campo en una observación nueva es distinto de escribir cero o `null`. El cliente debe elegir deliberadamente según el significado del campo. Es especialmente importante para contadores, estados y arrays, donde un valor aceptado sintácticamente puede tener un efecto inesperado.

## Cambios de esquema

Los esquemas tienen versiones. Añadir un campo opcional es un cambio distinto de renombrar un campo o modificar su significado. Revisa el tipo declarado y cualquier migración antes de cambiar un contrato utilizado por observaciones existentes. La [referencia del registro de esquemas](../../../subsystems/schema_registry.md) describe el formato completo; [resolución de conflictos](../../../subsystems/conflict_resolution.md) explica las reglas efectivas y ejemplos.

El esquema también limita lo que una explicación de la instantánea puede afirmar con rigor. Las mismas observaciones bajo otra política activa pueden producir otra vista actual. Registra la versión y política del esquema cuando un resultado deba auditarse o compararse entre despliegues. [Instantáneas actuales](https://neotoma.io/es/current-snapshot/) describe la lectura derivada.
