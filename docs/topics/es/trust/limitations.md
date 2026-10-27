# Límites que comprobar

El registro de Neotoma resulta útil cuando sus límites están claros: una interfaz puede aceptar una solicitud sin demostrar que se obtuvo el estado o la vía de despliegue previstos.

Se aplica a v0.26.0 (`b6ae615`, publicada el 27 de octubre de 2026). La descripción se examinó originalmente en el código `4779784` el 24 de octubre de 2026; ese código está incluido en esta versión. Consulta el contrato de la instancia en ejecución para conocer su comportamiento exacto.

## Una llamada satisfactoria no demuestra el efecto

Después de guardar o corregir datos, recupera la entidad y comprueba el campo exacto. Una clave no declarada puede conservarse fuera de los campos declarados de la instantánea. Una consulta vacía también puede indicar un problema de consulta: tipo de entidad, nombre de campo, forma de identificador o instancia equivocados. Confirma un caso conocido que dé resultado antes de tratar una respuesta vacía como prueba de ausencia.

Neotoma registra evidencia y calcula el estado actual; no determina si un hecho aportado es verdadero en el mundo. La extracción por IA de material no estructurado puede variar entre interpretaciones. Puedes examinar su configuración y las observaciones resultantes; el comportamiento determinista del reductor se evalúa con un conjunto fijo de observaciones y esquema.

## Límites de interfaz y configuración

MCP, CLI y HTTP exponen capacidades relacionadas, pero un ejemplo de una interfaz no demuestra que las demás acepten exactamente la misma forma de llamada. Usa el contrato propio de cada una. Stdio local inicia un proceso MCP para un entorno; no implica que ya funcione un servicio HTTP. Una conexión HTTP remota necesita una instancia accesible y la vía de autenticación apropiada.

Algunos entornos tienen una opción compatible de `neotoma setup --tool`; otros usan configuración manual, plugin nativo o adaptador. El [selector de instalación](https://neotoma.io/es/install/) y la [matriz de integraciones](https://neotoma.io/es/integrations/) distinguen estas vías. Que un entorno enumere un servidor prueba su registro, no que pueda leer la instancia prevista. Verifica mediante una llamada de solo lectura.

## Límites de autoridad y acceso compartido

La identidad de un agente puede comunicarse o verificarse criptográficamente; no describas ambas como el mismo nivel de garantía. El acceso y los enlaces compartidos dependen de las concesiones configuradas y de la aplicación real de políticas por la instancia. Sin medir el acceso en la instancia de destino, no describas una conexión entre pares o un enlace de invitado como acceso universal a todos los registros ni como perfectamente delimitado.

La [instantánea actual](https://neotoma.io/es/current-snapshot/) es una vista derivada; exportarla no es una copia completa del historial. Una lectura histórica por entidad no implica viajar en el tiempo para todo el registro. [Confianza y validez](https://neotoma.io/es/trust/) y la [referencia extensa de arquitectura](../../../architecture/architecture.md) describen el modelo y las garantías relacionadas.
