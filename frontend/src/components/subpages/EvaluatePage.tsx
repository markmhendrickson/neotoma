import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES, sendFunnelEvaluatePromptCopy } from "@/utils/analytics";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { TrackedProductLink } from "../TrackedProductNav";
import { DetailPage } from "../DetailPage";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

export function EvaluatePage() {
  const { locale, subpage } = useLocale();
  const ev = subpage.evaluate;

  return (
    <DetailPage title={ev.title}>
      <p className="text-[15px] leading-7 mb-4">{ev.introP1}</p>
      <p className="text-[15px] leading-7 mb-4 text-muted-foreground">
        {ev.introP2BeforeLink}
        <TrackedProductLink
          to={localizePath("/install", locale)}
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
          className="underline"
        >
          {ev.introInstallLink}
        </TrackedProductLink>
        {ev.introP2After}
      </p>
      <div className="mb-8">
        <p className="text-[15px] leading-7 mb-2 text-muted-foreground">
          <strong>{ev.promptToUseLabel}</strong>
        </p>
        <CopyableCodeBlock
          code={ev.agentEvaluationPrompt}
          className="mb-0"
          variant="emerald"
          onAfterCopy={() => sendFunnelEvaluatePromptCopy("evaluate_page")}
        />
      </div>

      <section>
        <h2 className="text-xl font-medium mb-4">{ev.whatNeotomaHeading}</h2>
        <p className="text-[15px] leading-7 mb-4">{ev.whatNeotomaP1}</p>
        <p className="text-[15px] leading-7 mb-4">{ev.whatNeotomaP2}</p>
      </section>

      <div className="mb-8 rounded-lg border border-border bg-card p-4">
        <Link to={localizePath("/evaluate/agent-instructions", locale)} className="group no-underline">
          <span className="text-[15px] font-medium text-foreground group-hover:underline block mb-1">
            {ev.agentInstructionsCardTitle}
          </span>
          <p className="text-[13px] leading-5 text-muted-foreground">{ev.agentInstructionsCardDesc}</p>
        </Link>
      </div>

      <section>
        <h2 className="text-xl font-medium mb-4">{ev.whoForHeading}</h2>
        <p className="text-[15px] leading-7 mb-4">{ev.whoForP}</p>

        <h3 className="text-lg font-medium mt-6 mb-3">{ev.strongFitHeading}</h3>
        <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 mb-4">
          {ev.strongFitBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h3 className="text-lg font-medium mt-6 mb-3">{ev.notFitHeading}</h3>
        <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 mb-4">
          {ev.notFitBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">{ev.taxHeading}</h2>
        <p className="text-[15px] leading-7 mb-3">{ev.taxIntro}</p>
        <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>
            <strong>{ev.taxLi1Strong}</strong>
            {ev.taxLi1BeforeLink}
            <a href={localizePath("/memory-models", locale)} className="underline">
              {ev.taxLi1LinkMemoryModels}
            </a>
            .
          </li>
          <li>
            <strong>{ev.taxLi2Strong}</strong>
            {ev.taxLi2BeforeLink}
            <a href={localizePath("/architecture", locale)} className="underline">
              {ev.taxLi2LinkArchitecture}
            </a>
            .
          </li>
          <li>
            <strong>{ev.taxLi3Strong}</strong>
            {ev.taxLi3BeforeLink}
            <a href={localizePath("/memory-guarantees", locale)} className="underline">
              {ev.taxLi3LinkGuarantees}
            </a>
            .
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">{ev.storeFirstHeading}</h2>
        <p className="text-[15px] leading-7 mb-3">{ev.storeFirstIntro}</p>
        <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-4">
          {ev.storeFirstItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">{ev.comparesHeading}</h2>
        <p className="text-[15px] leading-7 mb-3">{ev.comparesIntro}</p>
        <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
          {ev.comparesItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">{ev.nextStepsHeading}</h2>
        <p className="text-[15px] leading-7 mb-3">
          {ev.nextStepsP1BeforeOnboarding}
          <TrackedProductLink
            to={localizePath("/install", locale)}
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
            className="underline"
          >
            <strong>{ev.onboardingSequenceLiteral}</strong>
          </TrackedProductLink>
          {ev.nextStepsP1Between}
          <TrackedProductLink
            to={localizePath("/install", locale)}
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
            className="underline"
          >
            <strong>{ev.activationSequenceLiteral}</strong>
          </TrackedProductLink>
          {ev.nextStepsP1After}
        </p>
        <p className="text-[15px] leading-7 mb-3">
          {locale === "es" ? "Antes de desplegar una implementación completa, ofrece " : "Before rolling out a full implementation, offer "}
          <Link to={localizePath("/non-destructive-testing", locale)} className="underline">
            {locale === "es" ? "Probar con seguridad" : "Test safely"}
          </Link>
          {locale === "es"
            ? ": una prueba no destructiva en modo sombra que permita comparar con la configuración actual antes de adoptar Neotoma del todo."
            : ": a non-destructive shadow-mode trial that lets the user compare against their current setup before adopting Neotoma fully."}
        </p>
        <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>{ev.nextStepsOlEvaluation}</li>
          <li>
            {ev.nextStepsInstallationBeforeNpm}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded">npm install -g neotoma</code>
            {ev.nextStepsInstallationBetweenCommands}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded">neotoma init</code>
            {ev.nextStepsInstallationAfterInit}
          </li>
          <li>{ev.nextStepsOlActivation}</li>
          <li>{ev.nextStepsOlTooling}</li>
        </ol>
        <p className="text-[15px] leading-7 mb-3">
          {ev.nextStepsP2BeforeInstallGuide}
          <TrackedProductLink
            to={localizePath("/install", locale)}
            navTarget="install"
            navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall}
            className="underline"
          >
            {ev.nextStepsInstallGuideLink}
          </TrackedProductLink>
          {ev.nextStepsP2Between}
          <a href={localizePath("/architecture", locale)} className="underline">
            {ev.nextStepsArchLink}
          </a>
          {ev.nextStepsP2And}
          <a href={localizePath("/memory-guarantees", locale)} className="underline">
            {ev.nextStepsGuaranteesLink}
          </a>
          {ev.nextStepsP2End}
        </p>
        <p className="text-[15px] leading-7 mb-4 text-muted-foreground">
          {ev.nextStepsEmailP.split("contact@neotoma.io")[0]}
          <a href="mailto:contact@neotoma.io" className="underline">
            contact@neotoma.io
          </a>
          {ev.nextStepsEmailP.split("contact@neotoma.io")[1] ?? ""}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">{ev.scorecardHeading}</h2>
        <p className="text-[15px] leading-7 mb-3">{ev.scorecardP1}</p>
        <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto mb-4 whitespace-pre-wrap">{ev.scorecardPre}</pre>
        <p className="text-[15px] leading-7 mb-3">{ev.scorecardP2}</p>
        <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-4">
          <li>{ev.scorecardOl1}</li>
          <li>{ev.scorecardOl2}</li>
        </ol>
        <p className="text-[15px] leading-7 text-muted-foreground">{ev.scorecardFooter}</p>
      </section>
    </DetailPage>
  );
}
