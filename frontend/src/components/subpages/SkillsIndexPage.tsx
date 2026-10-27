import { ArrowRight, Bot, Download, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { getSkillsByTier } from "@/site/skills_catalog";
import type { SkillCatalogEntry } from "@/site/skills_catalog";
import { SeoHead } from "../SeoHead";
import { TrackedProductLink } from "../TrackedProductNav";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { useLocale } from "@/i18n/LocaleContext";
import { spanishSkill } from "@/site/skills_catalog_es";

function SkillCard({ skill }: { skill: SkillCatalogEntry }) {
  const es = useLocale().locale === "es";
  const tierLabel = skill.tier === 1 ? (es ? "Básico" : "Core") : skill.tier === 2 ? (es ? "Ampliado" : "Extended") : (es ? "Desarrollo" : "Developer");
  const tierColor =
    skill.tier === 1
      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
      : skill.tier === 2
        ? "text-sky-600 dark:text-sky-400 border-sky-500/20 bg-sky-500/5"
        : "text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/5";

  return (
    <Link
      to={`${es ? "/es" : ""}/skills/${skill.slug}`}
      className="group relative rounded-xl border border-border bg-card p-6 no-underline transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${tierColor}`}>
            <Bot className="h-3.5 w-3.5" />
            <span className="text-[12px] font-medium">{tierLabel}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-[18px] font-medium text-foreground">{skill.name}</h2>
          <p className="text-[14px] leading-6 text-muted-foreground">{skill.tagline}</p>
        </div>

        {skill.dataSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skill.dataSources.map((ds) => (
              <span
                key={ds}
                className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                {ds}
              </span>
            ))}
          </div>
        )}

        {skill.entityTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skill.entityTypes.map((et) => (
              <span
                key={et}
                className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground/80"
              >
                {et}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function TierSection({ tier, label, description }: { tier: 1 | 2 | 3; label: string; description: string }) {
  const es = useLocale().locale === "es";
  const skills = getSkillsByTier(tier).map((skill) => es ? spanishSkill(skill) : skill);
  if (skills.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-[22px] font-medium text-foreground">{label}</h2>
        <p className="text-[14px] text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {skills.map((skill) => (
          <SkillCard key={skill.slug} skill={skill} />
        ))}
      </div>
    </div>
  );
}

export function SkillsIndexPage() {
  const es = useLocale().locale === "es";
  return (
    <>
      <SeoHead />
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-12 lg:px-16">
          <div className="space-y-4 mb-12">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              {es ? "Skills" : "Skills"}
            </p>
            <h1 className="text-[32px] md:text-[40px] font-medium tracking-[-0.02em] leading-tight">
              {es ? "Procedimientos guiados para guardar datos en Neotoma" : "Guided workflows for storing data in Neotoma"}
            </h1>
            <p className="text-[17px] leading-8 text-muted-foreground max-w-3xl">
              {es ? "Las skills son procedimientos paso a paso que tu agente sigue para importar, extraer y guardar datos en Neotoma. Cada una trata una fuente concreta, como correo, historial de chat, documentos financieros o calendario, y produce entidades estructuradas y consultables con procedencia completa." : "Skills are step-by-step workflows your AI agent follows to import, extract, and store data in Neotoma. Each skill handles a specific data source: email, chat history, financial documents, calendar events, and produces structured, queryable entities with full provenance."}
            </p>
          </div>

          <div className="space-y-12">
            <TierSection
              tier={1}
              label={es ? "Activación básica" : "Core activation"}
              description={es ? "Empieza aquí: estos procedimientos cubren las importaciones más habituales." : "Start here. These skills handle the most common data import patterns."}
            />
            <TierSection
              tier={2}
              label={es ? "Ampliado" : "Extended"}
              description={es ? "Procedimientos específicos para reuniones, finanzas, contactos y calendario." : "Domain-specific skills for meetings, finances, contacts, and calendar."}
            />
            <TierSection
              tier={3}
              label={es ? "Desarrollo y operaciones" : "Developer & operations"}
              description={es ? "Procedimientos para desarrollo y resolución de problemas." : "Skills for developers and troubleshooting."}
            />
          </div>

          {/* Install section */}
          <div className="mt-16 rounded-xl border border-border bg-muted/30 p-8 space-y-6">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-[20px] font-medium text-foreground">{es ? "Instalar skills" : "Install skills"}</h3>
            </div>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
              {es ? "Las skills se distribuyen con el paquete npm " : "Skills ship with the "}<code className="text-[13px]">neotoma</code>{es ? ". Ejecutar " : " npm package. Running "}<code className="text-[13px]">neotoma setup</code>{es ? " las instala automáticamente en tu entorno de agente." : " installs them into your harness automatically."}
            </p>
            <pre className="rounded-lg bg-card border border-border p-4 text-[13px] font-mono text-foreground overflow-x-auto">
              npm install -g neotoma{"\n"}neotoma setup --yes
            </pre>
            <p className="text-[13px] text-muted-foreground">
              {es ? "También puedes pedir a tu agente: " : "Or ask your agent: "}<em>{es ? "«Ejecuta la skill ensure-neotoma»." : "“Run the ensure-neotoma skill.”"}</em>
            </p>
          </div>

          {/* Open source callout */}
          <div className="mt-8 rounded-xl border border-border bg-card p-6 flex items-start gap-4">
            <ExternalLink className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-[15px] font-medium text-foreground">{es ? "Todas las skills son de código abierto" : "All skills are open source"}</p>
              <p className="text-[14px] text-muted-foreground">
                {es ? "Consulta los archivos " : "Browse the "}<code className="text-[13px]">SKILL.md</code>{es ? " en el " : " files in the "}{" "}
                <a
                  href="https://github.com/markmhendrickson/neotoma/tree/main/skills"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-2 hover:no-underline"
                >
                  {es ? "directorio skills/ de GitHub" : "skills/ directory on GitHub"}
                </a>
                {es ? ". También puedes encontrar skills en " : ". Skills are also discoverable on "}{" "}
                <a
                  href="https://skills.palebluedot.live/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-2 hover:no-underline"
                >
                  SkillHub
                </a>
                .
              </p>
            </div>
          </div>

          {/* Cross-links */}
          <div className="mt-8 flex flex-wrap gap-3">
            <TrackedProductLink
              to={es ? "/es/install" : "/install"}
              navTarget="install"
              navSource={PRODUCT_NAV_SOURCES.docsHubInstall}
              className="inline-flex items-center gap-1.5 rounded-md border border-foreground bg-foreground px-5 py-2.5 text-[14px] font-medium text-background no-underline hover:opacity-90 transition-opacity"
            >
              {es ? "Instalar Neotoma" : "Install Neotoma"}
            </TrackedProductLink>
            <Link
              to={es ? "/es/install" : "/install"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
            >
              {es ? "Conectar tu entorno" : "Connect your harness"}
            </Link>
            <Link
              to={es ? "/es/architecture/" : "/architecture/"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
            >
              {es ? "Cómo funciona el registro" : "How the record works"}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
