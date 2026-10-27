# Empieza aquí

Neotoma ofrece a los agentes un registro compartido de hechos que cambian y permite examinar la evidencia que respalda cada valor actual.

Se aplica al código fuente examinado en `b6ae615` el 24 de octubre de 2026. La versión publicada v0.26.0 está fijada en `b6ae615`; confirma la disponibilidad de cada función en esa versión.

## Para qué sirve

Un agente puede escribir una observación, consultar la entidad resultante y seguir el valor hasta su fuente. Una corrección añade evidencia nueva sobre cuál debe ser el valor actual; la observación anterior sigue disponible para su examen. MCP, la CLI y la API HTTP exponen el mismo registro.

Neotoma es el sistema de registro para el **estado que mantienen los agentes**. No sustituye la base de datos de negocio de una aplicación ni decide lo que debe hacer un agente a continuación. [Cómo funciona el registro](https://neotoma.io/es/architecture/) explica ese límite.

## Decide si encaja

Puede ser útil cuando varios agentes o herramientas necesitan compartir hechos que cambian, o cuando una respuesta actual debe mostrar su fuente. Un solo agente que trabaja en un ámbito reducido quizá no necesite un registro aparte. Empieza con un flujo de trabajo concreto y comprueba que puedes recuperar tanto el valor actual como su procedencia.

## Siguientes pasos

1. [Elige una vía de instalación](https://neotoma.io/es/install/) para la herramienta que usas.
2. [Elige una interfaz](https://neotoma.io/es/interfaces/) para esa herramienta o aplicación.
3. Lee la [presentación completa del repositorio](../../../README.md) para conocer su alcance y contexto de desarrollo.

El [protocolo de instalación para agentes](../../../install.md) incluye evaluación, instalación, activación y configuración de herramientas. Es una referencia operativa más extensa; no sustituye el selector de instalación para personas.
