import { SOCIAL_CARD } from "./social_card";
/** Source-owned descriptions for the exact retained Spanish public shells. */
export const SPANISH_PUBLIC_SEO: Record<string, { title: string; description: string }> = {
  "/": { title: "Neotoma: sistema de registro para agentes de IA", description: SOCIAL_CARD.es.description },
  "/install": { title: "Instalar y conectar Neotoma", description: "Elige la ruta de conexión de tu herramienta, revisa los cambios en el sistema y comprueba la instancia y el perfil de datos configurados." },
  "/compare": { title: "Comparar memoria, recuperación y sistema de registro", description: "Compara el contexto de sesión, la búsqueda de documentos, los servicios de memoria y los registros con valores actuales verificables." },
  "/evaluate": { title: "Evaluar si Neotoma encaja", description: "Evalúa tu flujo de trabajo, tus herramientas y tus datos antes de instalar o importar información." },
  "/evaluate/agent-instructions": { title: "Instrucciones para evaluar Neotoma con un agente", description: "Un procedimiento basado en el contexto autorizado para valorar el encaje, las limitaciones y una pequeña prueba inicial." },
  "/meet": { title: "Hablar con el creador de Neotoma", description: "Reserva una conversación sobre arquitectura de agentes, integración, datos o comentarios sobre tu flujo de trabajo." },
  "/privacy": { title: "Aviso de privacidad del sitio Neotoma", description: "Consulta cómo se tratan las visitas al sitio, las solicitudes y las preferencias funcionales de idioma." },
  "/terms": { title: "Condiciones de uso del sitio Neotoma", description: "Consulta las condiciones aplicables al sitio web y a sus materiales; el software se rige por su propia licencia." },
  "/sandbox": { title: "Entorno público de pruebas de Neotoma", description: "Prueba la conexión MCP en un entorno público y efímero; no guardes datos privados ni dependas de su persistencia." },
  "/sandbox/terms-of-use": { title: "Condiciones del entorno público de pruebas", description: "Lee las reglas de datos públicos, caducidad, reinicio y uso permitido antes de escribir en el entorno de pruebas." },
  "/skills": { title: "Skills para trabajar con Neotoma", description: "Explora procedimientos de instalación, importación y recuperación, y revisa sus requisitos antes de usarlos." },
  "/skills/ensure-neotoma": { title: "Skill: preparar Neotoma", description: "Instala y comprueba Neotoma y su conexión MCP antes de ejecutar procedimientos que dependen de él." },
  "/skills/remember-email": { title: "Skill: recordar correo", description: "Importa mensajes seleccionados con procedencia y límites de autorización claros." },
  "/skills/remember-conversations": { title: "Skill: recordar conversaciones", description: "Incorpora conversaciones autorizadas conservando contexto, fuente y límites de privacidad." },
  "/skills/remember-meetings": { title: "Skill: recordar reuniones", description: "Extrae acuerdos y seguimientos de reuniones seleccionadas con revisión de la fuente." },
  "/skills/remember-finances": { title: "Skill: recordar finanzas", description: "Importa transacciones y comprobantes seleccionados con cuidado de datos financieros." },
  "/skills/remember-contacts": { title: "Skill: recordar contactos", description: "Consolida relaciones y datos de contacto pertinentes a partir de fuentes autorizadas." },
  "/skills/remember-calendar": { title: "Skill: recordar calendario", description: "Registra eventos y compromisos de un calendario configurado con procedencia." },
  "/skills/remember-codebase": { title: "Skill: recordar código", description: "Crea un inventario persistente de repositorios y decisiones técnicas verificables." },
  "/skills/recover-sqlite-database": { title: "Skill: recuperar SQLite", description: "Comprueba la integridad de una base SQLite de Neotoma y sigue el procedimiento de recuperación cuando sea necesario." },
};
