# MCP

Neotoma expone herramientas mediante Model Context Protocol para que un entorno de IA configurado pueda leer y escribir en el mismo registro.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Conecta antes de usar

El entorno debe estar conectado a la instancia de Neotoma prevista. Stdio local y HTTP remoto son vías distintas, con requisitos de ejecución y autenticación diferentes. Que una herramienta aparezca en la lista del entorno confirma su registro; la comprobación útil es recuperar datos en modo de solo lectura de la instancia prevista.

Con stdio local, el entorno inicia el proceso MCP de Neotoma en la máquina indicada por su configuración. El binario local y la ubicación de datos inicializada deben estar disponibles en el entorno de ese proceso. Esta vía no inicia por sí misma un servicio API HTTP persistente. Con HTTP remoto, el entorno se conecta a un endpoint de servidor accesible; tanto el endpoint como su autenticación deben corresponder al registro que quería usar la persona. Por eso, un comando de configuración local y una entrada de conector remoto son instrucciones distintas.

El [selector de instalación](https://neotoma.io/es/install/) identifica qué entornos disponen de un comando de configuración compatible, cuáles usan plugin y cuáles necesitan configuración manual. La [matriz de integraciones](https://neotoma.io/es/integrations/) ofrece el inventario actual de entornos.

## Qué significa una llamada a una herramienta

MCP es una interfaz del registro de Neotoma, no una memoria diferente para cada agente. Guarda o corrige una observación mediante la acción documentada; luego recupera la entidad y examina su campo actual y procedencia. Distingue un resultado de consulta vacío de una consulta a la instancia o campo equivocados.

Una escritura de un agente por MCP puede atribuirse al nombre de cliente comunicado o a una identidad de firma verificada, según la conexión y las credenciales. Son niveles de evidencia diferentes. Examina la atribución registrada en vez de suponer que el nombre de la herramienta demuestra quién escribió. Los permisos dependen también de la concesión y la política de instancia activas, no del mero hecho de que el entorno exponga la herramienta.

## Verifica la vía elegida

Primero confirma que el entorno previsto enumera las herramientas de Neotoma. Después haz una llamada de solo lectura que deba devolver una entidad conocida o una respuesta esperada de la instancia. Si falla, examina la configuración MCP real del entorno, la ruta del binario local o la URL remota y el estado de autenticación. No interpretes un resultado de datos vacío como éxito hasta que funcione una consulta a un caso conocido.

Si vas a guardar un hecho, examina el esquema de la entidad y usa la forma de acción documentada para esa interfaz. Después recupera la entidad y comprueba el campo exacto. Esto demuestra el efecto que importa a la persona, más allá de que el transporte aceptase la solicitud.

La [referencia MCP completa](../../../developer/mcp_overview.md) contiene nombres de herramientas, parámetros, detalles de transporte y ejemplos. Para entender el límite entre observaciones, entidades e instantáneas, lee [Cómo funciona el registro](https://neotoma.io/es/architecture/).
