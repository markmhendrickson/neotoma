import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const tierRowClass = "border-b border-border last:border-b-0";
const tierLabelClass =
  "py-2 pr-4 text-[14px] font-medium text-foreground align-top whitespace-nowrap";
const tierExampleClass = "py-2 text-[14px] leading-6 text-muted-foreground";

function TierTable({
  rows,
  categoryHeader,
  examplesHeader,
}: {
  rows: { category: string; examples: string }[];
  categoryHeader: string;
  examplesHeader: string;
}) {
  return (
    <table className="w-full text-left mb-2">
      <thead>
        <tr className="border-b border-border">
          <th className="pb-1 text-[13px] font-medium text-muted-foreground">{categoryHeader}</th>
          <th className="pb-1 text-[13px] font-medium text-muted-foreground">{examplesHeader}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category} className={tierRowClass}>
            <td className={tierLabelClass}>{r.category}</td>
            <td className={tierExampleClass}>{r.examples}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WhatToStorePage() {
  const { locale, subpage } = useLocale();
  const w = subpage.whatToStore;
  const lp = (path: string) => localizePath(path, locale);

  return (
    <DetailPage title={w.title}>
      <p className="text-[15px] leading-7 mb-4">
        {w.introP1BeforeStrong}
        <strong>{w.introStrong}</strong>
        {w.introP1AfterStrong}
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">{w.introP2}</p>

      <IntegrationSection title={w.sectionAgentsTitle} sectionKey="agent-driven" dividerBefore={false}>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          {w.agentsP1BeforeCursor}
          <Link to={lp("/neotoma-with-cursor")} className={extLink}>
            {w.linkHarnessCursor}
          </Link>
          {w.agentsP1AfterCursor}
          <Link to={lp("/neotoma-with-claude")} className={extLink}>
            {w.linkHarnessClaude}
          </Link>
          {w.agentsP1AfterClaude}
          <Link to={lp("/neotoma-with-chatgpt")} className={extLink}>
            {w.linkHarnessChatgpt}
          </Link>
          {w.agentsP1AfterChatgpt}
          <Link to={lp("/mcp")} className={extLink}>
            {w.linkHarnessMcpClient}
          </Link>
          {w.agentsP1AfterMcp}
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          {w.agentsP2BeforeRecipes}
          <Link to={lp("/agent-instructions/store-recipes")} className={extLink}>
            {w.linkStoreRecipes}
          </Link>
          {w.agentsP2AfterRecipes}
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          {w.agentsP3BeforeCli}
          <Link to={lp("/cli")} className={extLink}>
            {w.linkCli}
          </Link>
          {w.agentsP3AfterCli}
          <Link to={lp("/api")} className={extLink}>
            {w.linkRestApi}
          </Link>
          {w.agentsP3AfterApi}
          <Link to={lp("/mcp")} className={extLink}>
            {w.linkMcpTools}
          </Link>
          {w.agentsP3AfterMcp}
          {w.agentsP3End}
        </p>
      </IntegrationSection>

      <IntegrationSection title={w.sectionFlexibleTitle} sectionKey="flexible-schemas">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          {w.flexibleP1BeforeRegistry}
          <code className="text-[13px]">entity_type</code>
          {w.flexibleP1BetweenCodeAndRegistry}
          <Link to={lp("/schemas/registry")} className={extLink}>
            {w.linkSchemaRegistry}
          </Link>
          {w.flexibleP1AfterRegistry}
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          {w.flexibleP2BeforeTypes}
          <code className="text-[13px]">contact</code>, <code className="text-[13px]">task</code>,{" "}
          <code className="text-[13px]">transaction</code>, and <code className="text-[13px]">event</code>
          {w.flexibleP2AfterTypesBeforeNewType}
          <code className="text-[13px]">entity_type</code>
          {w.flexibleP2AfterEntityType}
          <Link to={lp("/schemas/versioning")} className={extLink}>
            {w.linkAdditiveSchemaEvolution}
          </Link>
          {w.flexibleP2AfterEvolution}
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          {w.flexibleP3BeforeRaw}
          <code className="text-[13px]">raw_fragments</code>
          {w.flexibleP3AfterRawBeforeSee}
          <Link to={lp("/schemas")} className={extLink}>
            {w.linkSchemasOverview}
          </Link>
          {w.flexibleP3BetweenOverviewAndMerge}
          <Link to={lp("/schemas/merge-policies")} className={extLink}>
            {w.linkMergePolicies}
          </Link>
          {w.flexibleP3BetweenMergeAndStorage}
          <Link to={lp("/schemas/storage-layers")} className={extLink}>
            {w.linkStorageLayers}
          </Link>
          {w.flexibleP3End}
        </p>
      </IntegrationSection>

      <IntegrationSection title={w.sectionTier1Title} sectionKey="tier-1">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">{w.tier1Intro}</p>
        <TierTable
          rows={w.tier1Rows}
          categoryHeader={w.tableHeaderCategory}
          examplesHeader={w.tableHeaderExamples}
        />
      </IntegrationSection>

      <IntegrationSection title={w.sectionTier2Title} sectionKey="tier-2">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">{w.tier2Intro}</p>
        <TierTable
          rows={w.tier2Rows}
          categoryHeader={w.tableHeaderCategory}
          examplesHeader={w.tableHeaderExamples}
        />
      </IntegrationSection>

      <IntegrationSection title={w.sectionTier3Title} sectionKey="tier-3">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">{w.tier3Intro}</p>
        <TierTable
          rows={w.tier3Rows}
          categoryHeader={w.tableHeaderCategory}
          examplesHeader={w.tableHeaderExamples}
        />
      </IntegrationSection>

      <IntegrationSection title={w.sectionExamplesTitle} sectionKey="examples">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-1">{w.exampleContacts.title}</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{w.exampleContacts.beforeLabel}</span>{" "}
              {w.exampleContacts.beforeText}
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">{w.exampleContacts.afterLabel}</span>{" "}
              {w.exampleContacts.afterText}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-1">{w.exampleTask.title}</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{w.exampleTask.beforeLabel}</span>{" "}
              {w.exampleTask.beforeText}
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">{w.exampleTask.afterLabel}</span>{" "}
              {w.exampleTask.afterText}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-[15px] font-medium mb-1">{w.exampleDecision.title}</h3>
            <p className="text-[14px] leading-6 text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{w.exampleDecision.beforeLabel}</span>{" "}
              {w.exampleDecision.beforeText}
            </p>
            <p className="text-[14px] leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">{w.exampleDecision.afterLabel}</span>{" "}
              {w.exampleDecision.afterText}
            </p>
          </div>
        </div>
      </IntegrationSection>

      <IntegrationSection title={w.sectionHeuristicTitle} sectionKey="heuristic">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">{w.heuristicIntro}</p>
        <ol className="list-decimal pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">{w.heuristicLi1Strong}</span>
            {w.heuristicLi1Body}
          </li>
          <li>
            <span className="font-medium text-foreground">{w.heuristicLi2Strong}</span>
            {w.heuristicLi2Body}
          </li>
          <li>
            <span className="font-medium text-foreground">{w.heuristicLi3Strong}</span>
            {w.heuristicLi3Body}
          </li>
          <li>
            <span className="font-medium text-foreground">{w.heuristicLi4Strong}</span>
            {w.heuristicLi4Body}
          </li>
        </ol>
      </IntegrationSection>

      <IntegrationSection title={w.sectionNotStoreTitle} sectionKey="not-store">
        <TierTable
          rows={w.notStoreRows}
          categoryHeader={w.tableHeaderCategory}
          examplesHeader={w.tableHeaderExamples}
        />
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground mt-8">
        {w.footerReady}
        <Link to={lp("/install")} className={extLink}>
          {w.linkInstallNeotoma}
        </Link>
        {w.footerAfterInstall}
        <Link to={lp("/walkthrough")} className={extLink}>
          {w.linkWalkthrough}
        </Link>
        {w.footerAfterWalkthrough}
        <Link to={lp("/backup")} className={extLink}>
          {w.linkBackupRestore}
        </Link>
        {w.footerEnd}
      </p>
    </DetailPage>
  );
}
