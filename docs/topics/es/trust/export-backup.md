# Exportar y hacer una copia de seguridad del registro

Elige una exportación para campos actuales portables o una copia de seguridad verificada si la recuperación requiere la base de datos y los archivos fuente.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Decide qué debe sobrevivir

`neotoma entities export --out records.jsonl` escribe un archivo JSONL compatible con importación que contiene tipos de entidad y campos de la instantánea actual. `--with-relationships` añade un archivo complementario de relaciones tipadas. Sirve para trasladar la vista estructurada actual a otra instancia o comprobar que los datos pueden salir de Neotoma. Incluye solo los campos declarados por el esquema activo de cada entidad. No es un archivo completo de todas las observaciones, bytes de fuentes, interpretaciones ni entradas de registro.

`neotoma memory-export` tiene otra finalidad: escribe un resumen Markdown acotado para herramientas que consumen memoria basada en archivos. Sus límites de líneas y campos pueden omitir o abreviar registros. No trates ese archivo como fuente de restauración. El [protocolo de salida y reconstrucción](../../../developer/exit_rebuild_test.md) explica cómo probar una exportación estructurada en una instancia nueva y comparar lo recuperado.

## Conserva una copia recuperable

`neotoma backup create` empaqueta la base de datos local, las fuentes y los registros en un directorio con marca temporal y manifiesto. Ejecuta `neotoma backup verify` sobre ese directorio antes de confiar en él. Guarda la copia separada del directorio de datos activo y protégela con las mismas expectativas de acceso que el registro original. Si está activado el cifrado, conserva aparte el material de claves necesario; los bytes cifrados sin la clave no restauran datos legibles.

```bash
neotoma backup create --output ./backups
neotoma backup verify ./backups/SELECTED_BACKUP_DIRECTORY
```

El segundo comando necesita el directorio con marca temporal real devuelto por el primero. La verificación comprueba el artefacto de copia; un ensayo de recuperación en otro directorio de datos ofrece evidencia más sólida de que la restauración funciona. La [referencia de copia y restauración](../../../developer/cli_reference.md#backup-and-restore) documenta el comando de restauración y el contenido.

## Comprueba el límite

La exportación de campos actuales y la copia completa resuelven problemas distintos. Registra cuál hiciste, cuándo, desde qué instancia y qué demostró su verificación. Una copia puede contener fuentes sensibles aunque una instantánea exportada parezca limitada. [Privacidad y control local](https://neotoma.io/es/local-first/) trata las decisiones de entrada e instancia; [Límites que comprobar](https://neotoma.io/es/limitations/) ayuda a acotar las afirmaciones sobre recuperación.
