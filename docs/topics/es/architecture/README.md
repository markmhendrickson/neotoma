---
applies_to: Versión publicada v0.26.0 en b6ae615 (27 de octubre de 2026); examen original 4779784 (24 de octubre de 2026), incluido en esta versión.
---

# Cómo funciona el sistema de registro

Neotoma es el sistema de registro para agentes de IA. Da a los agentes conectados un lugar estructurado donde mantener hechos que cambian, recuperar sus valores actuales y examinar las afirmaciones y la evidencia que los respaldan. Su arquitectura separa el material fuente aportado, las observaciones registradas, la identidad de la cosa descrita y las reglas que calculan su estado presente.

Esta separación importa cuando varios agentes trabajan con distintas herramientas y sesiones. Cada uno puede conservar su conversación, razonamiento y contexto temporal mientras lee y actualiza la misma instancia configurada. Neotoma mantiene el estado compartido. Los agentes deciden qué recopilar, qué significa la evidencia y qué acción emprender. Esta introducción explica primero la arquitectura y luego sigue una factura a través de ella.

## Separa el estado de los agentes que lo usan

Un agente, aplicación u orquestador opera por encima de Neotoma. Puede investigar una pregunta, extraer campos de material, decidir si registra un resultado y usar hechos guardados en un flujo de trabajo. Neotoma acepta escrituras por sus interfaces y mantiene sus consecuencias estructuradas. No se convierte en planificador del agente, no se suscribe a sus propias señales para decidir el siguiente paso ni actúa sobre obligaciones comerciales.

Un desarrollador puede conectar un entorno de IA por [MCP](https://neotoma.io/es/mcp/), usar la [CLI](https://neotoma.io/es/cli/) para examinar desde terminal o llamar a la [API REST](https://neotoma.io/es/rest-api/) desde una aplicación. La aplicación incluida ofrece otra superficie de inspección. Estas vías tienen requisitos de configuración y autenticación distintos; no dan significados diferentes a los campos seleccionados de una entidad. La [introducción a interfaces](https://neotoma.io/es/interfaces/) ayuda a elegir la adecuada.

La autoridad se limita al estado que mantienen los agentes y que quien adopta Neotoma decide guardar aquí. Una base de datos contable puede seguir siendo autoritativa para pagos, mientras Neotoma mantiene los hechos de contexto que los agentes utilizan en torno a ese trabajo. Guardar una fecha de pago en Neotoma no autoriza al agente a pagarlo. [Confianza y validez](https://neotoma.io/es/trust/) explica el alcance de las garantías.

## Distingue fuentes, interpretaciones y observaciones

Una fuente es material aportado, como un archivo cuyos bytes pueden conservarse para examinarlos después. Una interpretación registra cómo se obtuvo información estructurada a partir del material. Una observación es una afirmación registrada sobre campos, con su propio contexto de escritura. Son partes relacionadas del modelo, no nombres intercambiables para un documento.

Un agente puede aportar juntos un PDF y los campos extraídos de una factura, conservando el vínculo entre material y afirmación. También puede enviar una observación estructurada sin archivo aparte. Sigue siendo una afirmación registrada; guardarla no crea una prueba documental que nunca se aportó. Neotoma no examina automáticamente un buzón ni recupera fuentes externas para cubrir esa ausencia. Esas fuentes necesitan otra herramienta y un paso de recopilación autorizado.

La instancia mantiene el estado estructurado en su base de datos configurada y el material de archivo aportado en el almacén de fuentes. Los hashes del contenido ayudan a identificar y deduplicar bytes. Establecen qué material se guardó, no si sus afirmaciones son correctas. La interpretación asistida por modelos puede variar; por eso importan su procedencia y configuración. La reducción determinista es una garantía distinta de la salida determinista de un modelo. [El modelo del registro](https://neotoma.io/es/record-model/), [observaciones](https://neotoma.io/es/observations/) y [fuentes y procedencia](https://neotoma.io/es/provenance/) explican cada parte.

## Asocia observaciones con una identidad definida

Un esquema declara los campos aceptados por un tipo de entidad y las entradas utilizadas para resolver su identidad. La resolución de entidades asocia observaciones a una entidad según esas reglas declaradas. No es un juicio ilimitado de que toda frase parecida o cosa con otro nombre deba referirse a lo mismo.

En el esquema de factura incluido, el número de factura, nombre del proveedor y fecha de factura forman esa identidad. Aportar esas entradas de forma consistente permite que observaciones posteriores describan la misma factura. Un cliente que ya tenga el ID de entidad puede referirse a ella mediante la operación compatible apropiada. Si faltan entradas de identidad o difieren sustancialmente, hay que examinarlo; cambiar una descripción no garantiza encontrar la coincidencia prevista.

La identidad de una entidad también se distingue de una relación. Una relación tipada conecta dos entidades; una observación de campo describe una. Así, las aplicaciones pueden mantener hechos sobre una factura y conectarla con otras entidades sin tratar el acceso de un agente al sistema como otra relación comercial. [Vocabulario](https://neotoma.io/es/vocabulary/) define los términos, y [esquemas y reglas de campo](https://neotoma.io/es/schemas/) explica las declaraciones que rigen escritura y reducción.

## Calcula campos actuales sin descartar afirmaciones anteriores

El reductor calcula la instantánea de una entidad a partir de sus observaciones según el esquema activo y las políticas de combinación. La instantánea es la vista de campos actuales, no un sustituto de las observaciones que la produjeron. La reducción forma parte del mantenimiento de la entidad; una persona no tiene que razonar manualmente sobre cada afirmación anterior tras cada escritura.

Las políticas se aplican campo por campo. Un campo escalar puede seleccionar un valor por recencia, prioridad configurada o especificidad; un array puede combinar contribuciones. Por tanto, una instantánea puede tomar el importe de una observación y la fecha de vencimiento de otra. Cada campo seleccionado tiene procedencia que apunta a la observación que lo aportó. Una corrección añade una observación, sin editar la fuente anterior ni borrar su afirmación histórica.

Se espera que el mismo conjunto de observaciones y reglas activas produzca los mismos campos seleccionados. Un cambio de esquema o política puede alterar la vista; la configuración forma parte de una explicación del resultado. Estas políticas no establecen por sí solas la credibilidad de una observación. La aplicación debe elegir una política apropiada y comprobar la evidencia. [Instantáneas actuales](https://neotoma.io/es/current-snapshot/) describe el modelo de lectura, y [examinar un cambio](https://neotoma.io/es/history/) sigue la vía histórica. Una lectura histórica por entidad tiene un alcance menor que reproducir completamente todas las entidades, archivos y configuraciones en un momento arbitrario.

## Sigue una factura a través de la arquitectura

Considera la factura INV-2041 de Acme. Su PDF indica que se deben 3.200 USD el 22 de octubre de 2026. Un agente autorizado aporta el PDF y registra una observación con los campos de la factura. La identidad declarada para facturas asocia esa observación con una entidad. El reductor calcula los campos actuales y conserva el vínculo con la fuente cuando se aportó.

Un correo posterior del proveedor traslada el vencimiento al 29 de octubre. Cuando se le pide comprobarlo, el agente recupera el mensaje mediante una herramienta de correo conectada por separado y envía el campo modificado a la factura existente. Neotoma no lee el buzón por sí mismo. El PDF y la observación anteriores siguen disponibles para examen.

La política incluida para el vencimiento de facturas es `last_write`: la observación más reciente que contiene ese campo aporta su valor actual. La instantánea muestra ahora el 29 de octubre, mientras el importe y la moneda pueden seguir procediendo de la observación original. Para saber por qué cambió la fecha, sigue su puntero de procedencia hasta la observación posterior y, cuando se aportó, el correo fuente. Para saber de dónde vino el importe, sigue otro puntero a la observación del PDF.

Supón que una tercera observación, posterior, afirma sin evidencia que la fecha es el 5 de noviembre. Con `last_write`, esa afirmación puede volverse actual. La presencia de un correo fuente no da automáticamente prioridad al 29 de octubre. Una aplicación que necesite ese resultado puede configurar expresamente `highest_priority` para el vencimiento y asignar a la observación del correo verificado mayor prioridad de fuente que a la afirmación sin respaldo. Entonces se selecciona el 29 de octubre bajo esa configuración. La prioridad expresa una política declarada; Neotoma no infiere credibilidad de las palabras ni autentica la autoridad comercial del correo.

## Comparte un ámbito configurado y verifica el estado resultante

Dos agentes ven el mismo estado mantenido solo si acceden a la misma instancia y perfil de datos con los permisos adecuados. Instalar Neotoma en dos herramientas no comparte por sí solo sus bases de datos. La operación con control local trata de dónde viven la instancia y los datos; el uso remoto requiere un endpoint accesible y autenticación configurada. La identidad verificada del agente y las concesiones activas con alcance definido son distintas de un cliente que simplemente comunica su nombre. La [matriz de integraciones](https://neotoma.io/es/integrations/) y la [guía de control local](https://neotoma.io/es/local-first/) explican estos límites prácticos.

Después de escribir, recupera la entidad y verifica el campo previsto. Una respuesta satisfactoria no sustituye la comprobación del valor y su procedencia. Las guías de [guardar y corregir](https://neotoma.io/es/store-correct/) y [buscar y leer](https://neotoma.io/es/read-search/) describen el ciclo. Neotoma puede comunicar cambios de estado ya realizados a consumidores registrados; la entrega es de mejor esfuerzo y los consumidores siguen siendo responsables de ponerse al día y tomar decisiones. Exportar el estado actual favorece la portabilidad; recuperar requiere una copia de seguridad que conserve el material adicional: consulta [exportación y copia de seguridad](https://neotoma.io/es/export-backup/).

Se admiten el acceso compartido configurado, los controles de acceso y ciertos intercambios entre pares. La propiedad amplia de dominios, las posiciones retenidas y la semántica de las explicaciones siguen siendo trabajo de diseño, no promesas generales de implementación. [Límites que comprobar](https://neotoma.io/es/limitations/) ayuda a decidir de qué puede depender un flujo concreto hoy.
