const comparison = [
  ["¿Qué se guarda?", "Normalmente, un resumen de lo visto por el agente.", "Cada hecho registrado como observación vinculada a su fuente."],
  ["¿Qué ocurre cuando cambia un hecho?", "El texto nuevo suele quedar junto al anterior o sustituirlo.", "Una regla por campo selecciona el valor actual; las observaciones anteriores permanecen en el historial."],
  ["¿Cómo sabes por qué un valor es actual?", "Sueles depender de la explicación del propio agente.", "Cada campo actual identifica la observación que lo estableció."],
  ["¿Qué lee otro agente?", "El contexto guardado en su propia herramienta, que puede diferir.", "El mismo registro, si usa la misma instancia y la misma entrada MCP o perfil de datos."],
] as const;

export const RECALL_VS_RECORD_ES = comparison.map(([question, recall, record]) => ({ question, recall, record }));
