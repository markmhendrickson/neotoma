/** Current shared artwork and copy for crawler-visible EN/ES social previews. */
export const SOCIAL_CARD = {
  width: 1200,
  height: 630,
  mime: "image/png",
  origin: "https://neotoma.io",
  archive: "brand/october/essay/archive-hero-desktop.svg",
  logo: "brand/n2-nav-light.svg",
  en: {
    path: "/brand/october/social/neotoma-archive-en-20261030.png",
    headline: ["The system of", "record for", "AI agents"],
    title: "Neotoma: the system of record for AI agents",
    description: "Retain observations, read current values, and trace changes to their source evidence across the AI tools you connect.",
    alt: "Neotoma, the system of record for AI agents. A paper archive of retained records connects with a person, task, conversation, agent and date record.",
  },
  es: {
    path: "/brand/october/social/neotoma-archive-es-20261030.png",
    headline: ["El sistema de", "registro para", "agentes de IA"],
    title: "Neotoma: sistema de registro para agentes de IA",
    description: "Conserva observaciones, consulta valores actuales y sigue los cambios hasta sus fuentes entre las herramientas de IA que conectas.",
    alt: "Neotoma, sistema de registro para agentes de IA. Un archivo de registros conservados se conecta con una persona, una tarea, una conversación, un agente y un registro de fecha.",
  },
} as const;

/** The retained non-Spanish locale shells continue to use the English card. */
export function socialCardForLocale(locale: string) {
  const card = locale === "es" ? SOCIAL_CARD.es : SOCIAL_CARD.en;
  return { ...card, url: `${SOCIAL_CARD.origin}${card.path}` };
}
