# Control local y privacidad

Neotoma puede ejecutarse como una instancia controlada por la persona usuaria. La ingestión se elige expresamente; los hooks que capturan eventos posteriores se pueden activar por separado.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Controla la entrada

El flujo de instalación no autoriza un análisis en segundo plano del correo, las unidades en la nube ni los archivos. Elige el material que aportarás y examina la extracción propuesta antes de ingerirlo. El [protocolo de instalación para agentes](../../../../install.md) describe la evaluación y la secuencia de activación explícita.

La distinción sigue vigente después de la configuración. Una herramienta conectada puede solicitar una escritura cuando la llama un agente o una persona; la conexión sola no autoriza la ingestión de todo un espacio de trabajo. Los hooks o adaptadores activados expresamente pueden capturar después eventos de ciclo de vida automáticamente: revisa las opciones de activación y su alcance. Empieza por una fuente elegida o un hecho estructurado, recupera después la entidad resultante y cualquier referencia de fuente. Si falta el campo previsto, examina el esquema y la observación antes de añadir más material.

## Controla la instancia

La instalación local sitúa el registro en la instancia que configura la persona. Una conexión remota es otra decisión de despliegue y autenticación; su URL y credenciales deben apuntar a la instancia prevista. Verifica la conexión con una lectura antes de escribir datos.

El control local no promete que jamás haya solicitudes de red. La instalación de paquetes, las comprobaciones de actualización y las conexiones MCP remotas pueden usar la red. Examina la configuración de despliegue y entorno para la vía realmente usada.

El directorio de datos del usuario y el directorio de instalación de la aplicación cumplen funciones distintas. Elegir un repositorio como directorio de trabajo no lo convierte automáticamente en el lugar adecuado para registros personales. El protocolo de instalación pide a la persona que identifique una ubicación de datos apropiada y apruebe expresamente la ingestión.

## Compartir es otra decisión

Un registro local puede exponerse mediante un servicio remoto configurado; una instancia compartida puede tener reglas de acceso distintas de una personal. No deduzcas el alcance de un enlace de invitado o una conexión entre pares a partir de su etiqueta. Comprueba la política de la instancia de destino y mide la ruta de acceso de quien recibirá el enlace antes de compartir material sensible. La atribución de agentes también tiene niveles: un nombre de cliente comunicado aporta contexto; la verificación criptográfica necesita la vía de firma y su evidencia de confianza.

Si solo quieres evaluar si encaja, el primer paso puede seguir siendo local y acotado. El [selector de instalación](https://neotoma.io/es/install/) explica las vías disponibles; [Límites que comprobar](https://neotoma.io/es/limitations/) enumera afirmaciones de configuración y acceso que requieren verificación.

Para otros límites, consulta [Confianza y validez](https://neotoma.io/es/trust/) y la [presentación del repositorio](../../../../README.md).
