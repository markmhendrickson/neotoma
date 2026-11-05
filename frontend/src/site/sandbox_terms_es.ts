import { SANDBOX_ABUSE_REPORT_EMAIL, SANDBOX_SESSION_TTL_CAP_UTC } from "@shared/sandbox_terms_content";

/** Versioned translation of the shared sandbox terms; policy constants stay canonical. */
export const SANDBOX_TERMS_ES_MARKDOWN = `# Entorno público de pruebas de Neotoma — Condiciones de uso

La instancia de sandbox.neotoma.io es una demostración pública de Neotoma, con acceso de lectura y escritura, destinada a que los desarrolladores evalúen el producto sin instalarlo localmente.

## Qué aceptas al utilizarlo

- **Todos los datos son públicos.** Cualquier cosa que guardes puede verla cualquier otra persona que use el entorno. No envíes datos personales, credenciales, información empresarial interna ni nada que no quisieras publicar.
- **Los datos son efímeros por sesión.** Tu espacio de trabajo se elimina definitivamente al caducar la sesión (hasta 7 días, con límite en ${SANDBOX_SESSION_TTL_CAP_UTC}), al finalizarla o reiniciarla, o cuando el proceso periódico elimina sesiones caducadas. No trates este entorno como almacenamiento duradero.
- **No se permiten abusos.** No envíes contenido ilegal, acoso, correo no deseado ni material que vulnere derechos de terceros. Los incumplimientos pueden eliminarse fuera del ciclo normal y la IP remitente puede quedar limitada o bloqueada.
- **No se permite uso en producción.** El entorno es solo para evaluación. La disponibilidad, exactitud y durabilidad de los datos se proporcionan expresamente en la medida de lo posible.
- **Escrituras limitadas.** Las escrituras tienen un límite por IP para mantener la demostración operativa. La API HTTP devuelve 429 cuando se supera.
- **Vías administrativas destructivas deshabilitadas.** Combinar o dividir entidades, eliminar esquemas y recalcular instantáneas devuelve 403. Instala Neotoma localmente para usar toda la administración.

## Comunicación de abusos o filtraciones de datos personales

- Usa el enlace **Report abuse** del aviso de Inspector o envía un POST a \`/sandbox/report\`.
- Para incidencias urgentes, escribe a ${SANDBOX_ABUSE_REPORT_EMAIL}.
- Los informes reciben un access_token. Guárdalo: es la única forma de comprobar después el estado de resolución.

## Privacidad

- Registramos las IP de las solicitudes en el borde para investigar abusos. Las IP se convierten en hashes antes de guardarlas en un informe de abuso.
- Los correos, teléfonos y tokens de API presentes en el contenido enviado se ocultan automáticamente con marcadores \`<LABEL:hash>\`.
- No se requieren cookies ni cuentas.

## Ausencia de garantía

El entorno de pruebas se proporciona «tal cual», sin garantías de ningún tipo.
`;
