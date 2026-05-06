/** Homepage body copy keyed for locale packs (see `home_body_en.ts` + locale files). */

export interface HomeGuaranteePreviewCard {
  slug: string;
  property: string;
  failure: string;
  status: "guaranteed" | "prevented";
}

export interface HomeFaqItem {
  q: string;
  a: string;
}

export interface HomeScenario {
  left: string;
  fail: string;
  succeed: string;
  version: string;
}

export interface HomeOutcomeCard {
  category: string;
  failTitle: string;
  failDescription: string;
  successTitle: string;
  successDescription: string;
  scenarioIndex: number;
}

export interface HomeRecordTypeCard {
  label: string;
  description: string;
}

export interface HomeIcpCard {
  slug: string;
  modeLabel: string;
  name: string;
  tagline: string;
  homepageTransition: string;
}

export interface HomeQuote {
  text: string;
  attribution: string;
  attributionHref?: string;
}

/** Copy for `StateFlowDiagram` (homepage hero + architecture technical). */
export interface HomeStateFlowHeroCopy {
  regionAriaLabel: string;
  youTellProduct: string;
  invoiceQuote: string;
  storedLabel: string;
  storedSub: string;
  youAskProduct: string;
  balanceQuote: string;
  answerBold: string;
  answerRest: string;
  answerFootnote: string;
}

export interface HomeStateFlowTechnicalCopy {
  regionAriaLabel: string;
  pipelineKicker: string;
  layers: { label: string; sub: string }[];
  operations: readonly [string, string, string];
  replayHint: string;
}

export type HomeCliDemoChatMsgRole = "user" | "assistant" | "tool" | "divider";

export interface HomeCliDemoChatMsg {
  role: HomeCliDemoChatMsgRole;
  content: string;
  toolName?: string;
  toolLines?: string[];
}

export interface HomeCliDemoChatScenario {
  label: string;
  messages: HomeCliDemoChatMsg[];
}

export interface HomeCliDemoTerminalStep {
  comment: string;
  command: string;
  output: string[];
}

export interface HomeCliDemoTerminalScenario {
  label: string;
  steps: HomeCliDemoTerminalStep[];
}

/** Homepage `CliDemoInteractive` copy + scripted demo payloads (commands stay English). */
export interface HomeCliDemoPack {
  modeTabs: { chat: string; cli: string; mcp: string; api: string; inspector: string };
  chatPlaceholder: string;
  playPause: { pauseLabel: string; playLabel: string };
  installCta: string;
  chatScenarios: HomeCliDemoChatScenario[];
  cliScenarios: HomeCliDemoTerminalScenario[];
  agenticScenarios: HomeCliDemoTerminalScenario[];
  apiScenarios: HomeCliDemoTerminalScenario[];
}

export interface HomeBodyPack {
  outcomes: {
    kicker: string;
    heading: string;
    subtitle: string;
    withoutNeotoma: string;
    withNeotoma: string;
    bridgeLabel: string;
  };
  guaranteePreviewCards: HomeGuaranteePreviewCard[];
  guaranteeStatusLabels: { guaranteed: string; prevented: string };
  faqPreview: HomeFaqItem[];
  scenarios: HomeScenario[];
  outcomeCards: HomeOutcomeCard[];
  recordTypes: {
    kicker: string;
    heading: string;
    headingAccent: string;
    subtitle: string;
    startHereBadge: string;
    viewFullGuideCta: string;
    seeAllGuaranteesCta: string;
    cards: HomeRecordTypeCard[];
  };
  who: {
    kicker: string;
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    calloutHeading: string;
    calloutBodyBeforeLink: string;
    calloutLink: string;
    calloutBodyAfterLink: string;
    calloutNotForLead: string;
    calloutNotForLink: string;
    calloutNotForTrail: string;
    icpCards: HomeIcpCard[];
  };
  demo: {
    kicker: string;
    title: string;
    subtitle: string;
  };
  guarantees: {
    kicker: string;
    title: string;
    subtitle: string;
  };
  proof: {
    kicker: string;
    blockquote: string;
    founderPhotoAlt: string;
    founderName: string;
    founderRole: string;
    readFullPost: string;
    statsContacts: string;
    statsTasks: string;
    statsConversations: string;
    statsAgentMessages: string;
    statsEntityTypes: string;
  };
  evaluate: {
    kicker: string;
    title: string;
    subtitle: string;
    promptHint: string;
    evaluateIllustrationAlt: string;
    /** Snippet copied from the homepage / integration evaluate cards (keep `neotoma doctor` token). */
    homeEvaluatePrompt: string;
    evaluatePromptPill: string;
    evaluatePromptCardSubtitle: string;
    evaluatePromptCopy: string;
    evaluatePromptCopied: string;
    evaluatePromptCopyMobile: string;
    evaluatePromptIntroBeforeTarget: string;
    evaluatePromptIntroBetweenTargetAndLink: string;
    evaluatePromptIntroLink: string;
    evaluatePromptIntroAfterLink: string;
    /** Default phrase after "Copy this prompt into …" when `agentTargetPhrase` prop is omitted. */
    evaluatePromptDefaultAgentTarget: string;
  };
  commonQuestions: {
    moreQuestionsLink: string;
  };
  hero: {
    trustLine: string;
    releasesShipped: string;
    heroStateCaption: string;
    /** Shown after star count, e.g. "1.2k on GitHub" */
    onGithubSuffix: string;
    /** Fallback when stars unavailable */
    githubLabel: string;
  };
  stateFlow: {
    hero: HomeStateFlowHeroCopy;
    technical: HomeStateFlowTechnicalCopy;
  };
  cliDemo: HomeCliDemoPack;
  agentToolChips: {
    ariaLabel: string;
    worksWith: string;
  };
  quotes: HomeQuote[];
  sectionNavAria: { previous: string; next: string; quoteDot: string };
}
