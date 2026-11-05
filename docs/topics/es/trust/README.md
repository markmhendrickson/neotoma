# Confianza y validez

Las garantías útiles de Neotoma se refieren al estado registrado, sus fuentes y el cálculo determinista de la vista actual.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Comprueba el efecto real

Después de escribir, recupera la entidad y verifica el campo concreto. Una respuesta satisfactoria no demuestra que el campo previsto se haya guardado: los campos no declarados pueden conservarse como fragmentos sin procesar. Del mismo modo, antes de considerar un resultado vacío como prueba de ausencia, comprueba la consulta con un caso que sabes que debe dar resultado.

Tras una corrección, examina tanto la instantánea actual de la entidad como el historial de observaciones. Las observaciones anteriores siguen en la ruta normal del historial; solo las observaciones respaldadas por una fuente tienen una fuente independiente. El valor actual cambia según la política de campo configurada en el reductor.

## Alcance de la garantía

Los componentes deterministas producen el mismo resultado con las mismas entradas y configuración. La interpretación mediante IA de material no estructurado puede variar; su salida necesita procedencia y tratamiento idempotente, no una promesa de reproducción idéntica byte por byte. Neotoma tampoco comprueba que el material aportado como fuente sea factualmente correcto.

Continúa con [Cómo funciona el registro](https://neotoma.io/es/architecture/), [Fuentes y procedencia](https://neotoma.io/es/provenance/) y [Privacidad y control local](https://neotoma.io/es/local-first/).

Para conservar una copia, [elige entre exportar los campos actuales y crear una copia de seguridad para recuperación](export-backup.md). Su contenido y sus comprobaciones son diferentes.
