/** `/architecture` — localized chrome for lead, TOC, and opening invariant (body tables remain EN until expanded). */

export interface ArchitectureTocLink {
  id: string;
  label: string;
}

export interface ArchitecturePageStrings {
  title: string;
  lead: string;
  tocTitle: string;
  tocLinks: ArchitectureTocLink[];
  invariantP1: string;
  invariantP2: string;
}

export const ARCHITECTURE_PAGE_EN: ArchitecturePageStrings = {
  title: "Architecture",
  lead: "Neotoma's architecture is built on three foundations: append-only observation logs for immutability, deterministic reducers for consistent state composition, and schema-bound entity types for structural guarantees.",
  tocTitle: "On this page",
  tocLinks: [
    { id: "state-flow", label: "How state flows" },
    { id: "how-data-enters", label: "How data enters Neotoma" },
    { id: "guarantees", label: "Guarantees" },
    { id: "foundations", label: "Three foundations" },
    { id: "agent-loop", label: "How agents remember" },
    { id: "what-this-is-not", label: "What this is not" },
    { id: "problems-solved", label: "Problems solved" },
    { id: "terminology", label: "Core terminology" },
    { id: "interfaces", label: "Interfaces" },
    { id: "principles", label: "Core principles" },
    { id: "preview-status", label: "Developer preview status" },
    { id: "go-deeper", label: "Go deeper" },
  ],
  invariantP1:
    "Memory evolves deterministically. Given the same observations, Neotoma produces the same entity snapshots. Every state change is versioned with full provenance. Nothing mutates silently; nothing overwrites implicitly.",
  invariantP2:
    "This means you can inspect any entity at any point in time, diff two versions, and replay the full sequence of changes that produced the current state.",
};

export const ARCHITECTURE_PAGE_ES: Partial<ArchitecturePageStrings> = {
  title: "Arquitectura",
  lead: "La arquitectura de Neotoma se apoya en tres fundamentos: registros de observaciones solo-append para inmutabilidad, reductores deterministas para componer el estado de forma coherente y tipos de entidad ligados al esquema para garant\u00edas estructurales.",
  tocTitle: "En esta p\u00e1gina",
  tocLinks: [
    { id: "state-flow", label: "C\u00f3mo fluye el estado" },
    { id: "how-data-enters", label: "C\u00f3mo entran los datos en Neotoma" },
    { id: "guarantees", label: "Garant\u00edas" },
    { id: "foundations", label: "Tres fundamentos" },
    { id: "agent-loop", label: "C\u00f3mo recuerdan los agentes" },
    { id: "what-this-is-not", label: "Qu\u00e9 no es esto" },
    { id: "problems-solved", label: "Problemas resueltos" },
    { id: "terminology", label: "Terminolog\u00eda central" },
    { id: "interfaces", label: "Interfaces" },
    { id: "principles", label: "Principios centrales" },
    { id: "preview-status", label: "Estado de vista previa para desarrolladores" },
    { id: "go-deeper", label: "Profundizar" },
  ],
  invariantP1:
    "La memoria evoluciona de forma determinista. Con las mismas observaciones, Neotoma produce los mismos snapshots de entidad. Cada cambio de estado queda versionado con procedencia completa. Nada muta en silencio; nada sobrescribe de forma impl\u00edcita.",
  invariantP2:
    "Esto significa que puedes inspeccionar cualquier entidad en cualquier momento, comparar dos versiones y reproducir la secuencia completa de cambios que produjo el estado actual.",
};
