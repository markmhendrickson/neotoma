# Interfaces

MCP, la CLI y la API REST exponen el mismo registro de Neotoma a distintos tipos de clientes.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Elige según el cliente

| Cliente | Empieza por | Motivo |
| --- | --- | --- |
| Un entorno de IA compatible con MCP | [MCP](https://neotoma.io/es/mcp/) | El entorno puede llamar a las herramientas de Neotoma después de configurar la conexión con el servidor. |
| Un flujo de trabajo en terminal | [CLI](https://neotoma.io/es/cli/) | Los comandos permiten a una persona o a un script examinar y gestionar la instancia local. |
| Una aplicación o servicio | [API REST](https://neotoma.io/es/rest-api/) | Los clientes HTTP utilizan el contrato documentado de solicitudes y respuestas. |

La [matriz de integraciones](https://neotoma.io/es/integrations/) recoge las vías actuales para cada entorno. Que un entorno tenga cliente MCP no significa por sí solo que el comando de configuración de Neotoma escriba su configuración. Usa el [selector de instalación](https://neotoma.io/es/install/) para distinguir comandos de configuración compatibles, plugins nativos y configuración manual.

## Tareas habituales

- [Buscar y leer un registro](read-search.md) parte de un ID, identificador o tipo y comprueba los resultados vacíos.
- [Guardar y corregir un registro](store-correct.md) verifica los campos declarados y vuelve a leer el valor resultante.
- [Examinar un cambio](../architecture/history.md) compara el campo actual con sus observaciones.

## Un registro, varias entradas

La interfaz cambia cómo llega una solicitud a Neotoma; no convierte cada herramienta en un depósito de verdad independiente. Después de escribir, recupera la entidad y comprueba el campo que querías cambiar. Una respuesta satisfactoria por sí sola no demuestra que esté presente el valor resultante.

Para entender el modelo subyacente, continúa con [Cómo funciona el registro](https://neotoma.io/es/architecture/).
