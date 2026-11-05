# API REST

Usa la API HTTP de Neotoma cuando una aplicación necesite un contrato estructurado de solicitud y respuesta para el registro.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Comprueba primero el destino

Una API local de desarrollo y una API local de producción pueden usar puertos y directorios de datos diferentes. Una API alojada tiene su propia URL y política de acceso. Comprueba la URL base y la autenticación previstas antes de escribir. `GET /health` puede mostrar que un proceso responde, pero no demuestra que su perfil de datos sea el que querías usar. Leer una entidad conocida es una comprobación más sólida; en un perfil nuevo y vacío hará falta leer de nuevo la primera escritura autorizada por el usuario.

El servidor expone `GET /openapi.yaml` con el contrato de rutas. La [referencia REST completa](../../../api/rest_api.md) explica URL base, autenticación, envolturas de error, paginación, descubrimiento OAuth y endpoints auxiliares. La mayoría de las rutas de registro necesitan una credencial; una respuesta pública de salud o descubrimiento no demuestra que funcione una llamada protegida.

## Operaciones habituales del registro

| Finalidad | Operación HTTP | Qué verificar |
| --- | --- | --- |
| Guardar entidades estructuradas | `POST /store` | ID de entidad devueltos y campos previstos de la instantánea |
| Buscar entidades por filtros | `POST /entities/query` | Ámbito, tipo, paginación y un caso conocido que dé resultado |
| Examinar una entidad actual | `POST /get_entity_snapshot` | Valores de campos y procedencia |
| Corregir un campo | `POST /correct` | Instantánea nueva e historial de observaciones |

Estos nombres describen vías de acceso, no cuerpos completos de solicitud. Usa [OpenAPI](../../../../openapi.yaml) para los parámetros obligatorios y las formas de respuesta, sobre todo al pasar de una versión a otra. La [referencia CLI](../../../developer/cli_reference.md) documenta también `neotoma request --operation`, que llama a las operaciones por sus ID de OpenAPI sin construir una solicitud HTTP improvisada.

## Comprueba el efecto

Las llamadas de almacenamiento, corrección y búsqueda pueden devolver una respuesta válida sin resolver la pregunta que pretendías contestar. Comprueba el tipo de entidad y los campos declarados, compara el ID devuelto con la entidad esperada y después recupera la instantánea actual. Ante una búsqueda sin resultados, repite una consulta conocida que dé resultado contra la misma instancia y ámbito de usuario antes de concluir que faltan datos. [Buscar y leer un registro](https://neotoma.io/es/read-search/) y [Guardar y corregir un registro](https://neotoma.io/es/store-correct/) describen esos flujos sin depender de una biblioteca cliente.
