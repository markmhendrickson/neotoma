# Vocabulario

Estos nombres separan la entrada registrada de la respuesta actual que lee un agente.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## La ruta de la entrada a la respuesta

| Término | Significado para quien lee |
| --- | --- |
| **Fuente** | Material aportado expresamente al registro, como un archivo. Un hecho estructurado directo puede no tener archivo fuente aparte. |
| **Interpretación** | Una pasada registrada que lee una fuente y produce afirmaciones, con configuración y procedencia cuando se utiliza. |
| **Observación** | Una afirmación registrada sobre un campo de una entidad, con contexto propio. Una corrección posterior crea otra observación. |
| **Entidad** | Identidad estable bajo un tipo de entidad y esquema. Varias observaciones pueden referirse a una entidad. |
| **Instantánea de la entidad** | Vista de campos actuales calculada a partir de observaciones elegibles según las políticas de combinación del esquema. |
| **Procedencia** | Ruta desde un campo de la instantánea hasta la observación y, cuando existan, la fuente e interpretación que lo respaldan. |

Son objetos diferentes. Recuperar una instantánea no devuelve todas las observaciones históricas; exportar campos actuales de entidades no conserva necesariamente los archivos fuente ni todo el historial de cambios. [El modelo del registro](https://neotoma.io/es/record-model/) sigue los objetos en orden. [Examinar un cambio](https://neotoma.io/es/history/) muestra cómo usarlos cuando los valores discrepan.

## Nombres que afectan a las operaciones

Un **tipo de entidad** selecciona un esquema registrado. El esquema declara campos y políticas para calcular valores actuales. Un **fragmento sin procesar** puede contener un campo aportado pero no declarado; una respuesta satisfactoria a `store` no implica que ese campo aparezca en la instantánea. Una **relación** es una arista tipada entre entidades; un evento de cronología registra un suceso fechado. Ninguno sustituye el historial de observaciones de una entidad.

La afirmación de sistema de registro se aplica al estado que mantienen los agentes. La base de datos de negocio de quien adopta Neotoma puede seguir siendo autoritativa para sus datos operativos. Neotoma registra el estado versionado que usan los agentes alrededor de ese sistema y permite examinar cómo llegó a su respuesta actual. Esta distinción es arquitectónica; el [vocabulario completo](../../../vocabulary/canonical_terms.md) incluye definiciones normativas, términos antiguos y reglas de nomenclatura para contribuidores.
