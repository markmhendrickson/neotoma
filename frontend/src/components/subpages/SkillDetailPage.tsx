import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, ExternalLink } from "lucide-react";
import { Link, useParams, Navigate } from "react-router-dom";
import {
  getSkillBySlug,
  getSkillInstructionMarkdownBlobUrl,
  getSkillInstructionMarkdownRawUrl,
  getSkillInstructionMarkdownRepoPath,
} from "@/site/skills_catalog";
import type { ExternalTool, SkillCatalogEntry } from "@/site/skills_catalog";
import { skillMarkdownToSnippet } from "@/site/skill_markdown_snippet";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { SeoHead } from "../SeoHead";
import { sendCtaClick } from "@/utils/analytics";

function UseCaseLink({ slug }: { slug: string }) {
  const label = slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Link
      to={`/${slug}`}
      className="text-foreground underline underline-offset-2 hover:no-underline"
    >
      {label}
    </Link>
  );
}

function ExternalToolRow({ tool }: { tool: ExternalTool }) {
  const inner = (
    <>
      <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <span className="text-[14px] font-medium text-foreground">{tool.name}</span>
        <span className="text-[12px] text-muted-foreground ml-2">({tool.type})</span>
        <p className="text-[13px] text-muted-foreground mt-0.5">{tool.description}</p>
      </div>
    </>
  );

  if (tool.url) {
    return (
      <li className="rounded-lg border border-border bg-muted/20 p-3">
        <a
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 text-inherit no-underline hover:opacity-90"
        >
          {inner}
        </a>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border bg-muted/20 p-3 flex items-start gap-3">{inner}</li>
  );
}

function SkillLink({ slug }: { slug: string }) {
  const skill = getSkillBySlug(slug);
  const label = skill?.name ?? slug;
  return (
    <Link
      to={`/skills/${slug}`}
      className="text-foreground underline underline-offset-2 hover:no-underline"
    >
      {label}
    </Link>
  );
}

function SkillInstructionSection({ skill }: { skill: SkillCatalogEntry }) {
  const rawUrl = useMemo(() => getSkillInstructionMarkdownRawUrl(skill), [skill]);
  const blobUrl = useMemo(() => getSkillInstructionMarkdownBlobUrl(skill), [skill]);
  const agentUseSkillPrompt = useMemo(
    () =>
      `Use the Neotoma skill "${skill.name}". Fetch and follow the instructions at:\n${rawUrl}\nExecute every prerequisite, MCP configuration step, and workflow phase described there for this environment.`,
    [skill.name, rawUrl],
  );
  const [snippet, setSnippet] = useState(() =>
    skillMarkdownToSnippet(`${skill.tagline}\n\n${skill.description}`, 520),
  );
  const [previewFromRepo, setPreviewFromRepo] = useState(false);
  const [fetchPending, setFetchPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fb = skillMarkdownToSnippet(`${skill.tagline}\n\n${skill.description}`, 520);
    setSnippet(fb);
    setPreviewFromRepo(false);
    setFetchPending(true);
    const ac = new AbortController();
    fetch(rawUrl, { signal: ac.signal, mode: "cors" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const trimmed = text.trim();
        if (!trimmed) throw new Error("empty");
        if (cancelled) return;
        setSnippet(skillMarkdownToSnippet(trimmed));
        setPreviewFromRepo(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSnippet(fb);
        setPreviewFromRepo(false);
      })
      .finally(() => {
        if (!cancelled) setFetchPending(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [rawUrl, skill.tagline, skill.description]);

  return (
    <section className="mb-10">
      <h2 className="text-[20px] font-medium text-foreground mb-4">Skill instructions</h2>
      <div className="rounded-lg border border-border bg-muted/25 p-4 mb-4">
        <p className="text-[14px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {snippet}
        </p>
        <p className="text-[12px] text-muted-foreground/90 mt-3">
          {fetchPending
            ? "Loading preview from repository…"
            : previewFromRepo
              ? "Preview from repository markdown."
              : "Summary from this page; open GitHub or raw link below for the canonical skill file."}
        </p>
      </div>
      <p className="text-[14px] text-muted-foreground mb-4">
        Install and runtime steps for{" "}
        <span className="text-foreground font-medium">{skill.name}</span> live in the file below.
        Agents should fetch the <strong>raw URL</strong>; humans can use GitHub browse. Follow
        prerequisites, MCP setup, and workflow there after{" "}
        <code className="text-[13px]">neotoma setup</code> when the skill is installed via the
        package.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 text-[14px]">
        <a
          href={blobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-2 hover:no-underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Full skill on GitHub
        </a>
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-2 hover:no-underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Raw markdown (full SKILL.md)
        </a>
      </div>
      <dl className="space-y-3 text-[14px]">
        <div>
          <dt className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide mb-1">
            Repository path
          </dt>
          <dd>
            <code className="text-[13px] break-all">{getSkillInstructionMarkdownRepoPath(skill)}</code>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide mb-1">
            GitHub (browse)
          </dt>
          <dd>
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline break-all"
            >
              {blobUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide mb-1">
            Raw URL
          </dt>
          <dd>
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline break-all"
            >
              {rawUrl}
            </a>
          </dd>
        </div>
      </dl>
      <p className="text-[15px] leading-7 mt-6 mb-2 text-muted-foreground">
        <strong>Suggested prompt</strong>
      </p>
      <div data-skill-copyable-prompt>
        <CopyableCodeBlock
          code={agentUseSkillPrompt}
          className="mb-0"
          variant="emerald"
          evaluateChromeTitle="Use skill prompt"
          evaluateChromeSubtitle="Paste into your harness chat so the agent fetches the canonical markdown and follows it."
          onAfterCopy={() => sendCtaClick("skill_detail_copy_use_prompt")}
        />
      </div>
    </section>
  );
}

function SkillDetailContent({ skill }: { skill: SkillCatalogEntry }) {
  const tierLabel = skill.tier === 1 ? "Tier 1: Core" : skill.tier === 2 ? "Tier 2: Extended" : "Tier 3: Developer";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-12 lg:px-16">
        {/* Breadcrumb */}
        <Link
          to="/skills"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground no-underline hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All skills
        </Link>

        {/* Header */}
        <div className="space-y-4 mb-12">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-muted-foreground" />
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              {tierLabel}
            </p>
          </div>
          <h1 className="text-[32px] md:text-[40px] font-medium tracking-[-0.02em] leading-tight">
            {skill.name}
          </h1>
          <p className="text-[17px] leading-8 text-muted-foreground">{skill.description}</p>
        </div>

        <SkillInstructionSection skill={skill} />

        {/* Data sources */}
        {skill.dataSources.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-medium text-foreground mb-4">Supported data sources</h2>
            <div className="flex flex-wrap gap-2">
              {skill.dataSources.map((ds) => (
                <span
                  key={ds}
                  className="rounded-md border border-border bg-muted/50 px-3 py-1 text-[13px] text-muted-foreground"
                >
                  {ds}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Entity types produced */}
        {skill.entityTypes.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-medium text-foreground mb-4">Entity types produced</h2>
            <div className="flex flex-wrap gap-2">
              {skill.entityTypes.map((et) => (
                <code
                  key={et}
                  className="rounded-md border border-border bg-muted/50 px-3 py-1 text-[13px] text-muted-foreground"
                >
                  {et}
                </code>
              ))}
            </div>
          </section>
        )}

        {/* Workflow */}
        {skill.workflowSteps.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-medium text-foreground mb-4">Workflow</h2>
            <ol className="list-none pl-0 space-y-4">
              {skill.workflowSteps.map((step, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border bg-card p-4 flex items-start gap-4"
                >
                  <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-muted text-[12px] font-mono font-medium text-muted-foreground shrink-0">
                    {step.phase}
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-foreground">{step.title}</p>
                    <p className="text-[14px] text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* External tools */}
        {skill.externalTools.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-medium text-foreground mb-4">External tools</h2>
            <ul className="list-none pl-0 space-y-2">
              {skill.externalTools.map((tool) => (
                <ExternalToolRow key={tool.name} tool={tool} />
              ))}
            </ul>
          </section>
        )}

        {/* Related skills */}
        {skill.relatedSkills.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-medium text-foreground mb-4">Related skills</h2>
            <div className="flex flex-wrap gap-2">
              {skill.relatedSkills.map((slug) => (
                <SkillLink key={slug} slug={slug} />
              ))}
            </div>
          </section>
        )}

        {/* Related use cases */}
        {skill.relatedUseCases.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-medium text-foreground mb-4">Related use cases</h2>
            <div className="flex flex-wrap gap-2">
              {skill.relatedUseCases.map((slug) => (
                <UseCaseLink key={slug} slug={slug} />
              ))}
            </div>
          </section>
        )}

        {/* Back link */}
        <div className="mt-12 pt-8 border-t border-border">
          <Link
            to="/skills"
            className="inline-flex items-center gap-1.5 text-[14px] text-muted-foreground no-underline hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to all skills
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SkillDetailPage() {
  const { skillSlug } = useParams<{ skillSlug: string }>();
  const skill = skillSlug ? getSkillBySlug(skillSlug) : undefined;

  if (!skill) {
    return <Navigate to="/skills" replace />;
  }

  return (
    <>
      <SeoHead />
      <SkillDetailContent key={skill.slug} skill={skill} />
    </>
  );
}
