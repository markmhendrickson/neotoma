# CLI

La CLI de Neotoma es una vía de acceso desde la terminal al mismo registro que exponen MCP y HTTP.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Empieza con una lectura

Después de la [instalación](https://neotoma.io/es/install/), comprueba la instancia seleccionada antes de cambiar nada:

```bash
neotoma status --json
neotoma schemas list
neotoma entities list --limit 5
```

`status` ayuda a determinar qué configuración local está activa. La lista de esquemas muestra qué tipos de entidad y campos acepta la instancia; una lista de entidades indica si esa instancia contiene el registro esperado. Una lista vacía no demuestra que el registro no exista en otro lugar. Si esperabas una entidad conocida, recupérala por ID o identificador y comprueba que la respuesta procede del perfil previsto.

## Elige una familia de comandos

| Objetivo | Empieza por | Después |
| --- | --- | --- |
| Buscar una entidad | `entities list` o `entities search` | `entities get` para el ID exacto |
| Examinar la evidencia | `observations list` para las afirmaciones registradas; `sources get` para metadatos de fuentes; `sources content` para los bytes de la fuente | Compárala con los campos actuales de la entidad |
| Escribir hechos estructurados | `store` | Recupera cada entidad y campo devueltos |
| Conservar una copia | `entities export` o `backup create` | Comprueba el alcance de la exportación o ejecuta `backup verify` |

[Buscar y leer un registro](https://neotoma.io/es/read-search/) explica la secuencia de búsqueda, y [Guardar y corregir un registro](https://neotoma.io/es/store-correct/) explica la de escritura. Los comandos que afectan a una base de datos o ejecución local requieren el mismo cuidado que las llamadas API: elige primero el entorno y el ámbito de usuario. Que un comando termine correctamente es un resultado del transporte; la lectura posterior demuestra el valor resultante del registro.

## Consulta la referencia completa

La [referencia de la CLI](../../../developer/cli_reference.md) contiene opciones, precedencia de variables de entorno, operaciones del servidor y comandos ajenos al flujo de lectura habitual. Describe el contrato de los comandos instalados; comprueba la versión antes de usar una opción. Para una llamada OpenAPI directa mediante la CLI, consulta su sección `request --operation`. Esta página es un punto de partida, no un sustituto del contrato detallado.
