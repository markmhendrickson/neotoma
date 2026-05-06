import type { SupportedLocale } from "@/i18n/config";
import {
  CONNECT_PAGE_EN,
  CONNECT_PAGE_ES,
  type ConnectPageStrings,
} from "@/i18n/locales/connect_page_strings";
import {
  EVALUATE_SUBPAGE_EN,
  EVALUATE_SUBPAGE_ES,
  type EvaluatePageStrings,
} from "@/i18n/locales/evaluate_subpage_strings";
import {
  WHAT_TO_STORE_PAGE_EN,
  WHAT_TO_STORE_PAGE_ES,
  type WhatToStorePageStrings,
} from "@/i18n/locales/what_to_store_page_strings";
import {
  ARCHITECTURE_PAGE_EN,
  ARCHITECTURE_PAGE_ES,
  type ArchitecturePageStrings,
} from "@/i18n/locales/architecture_page_strings";
import {
  INSTALL_PAGE_EN,
  INSTALL_PAGE_ES,
  type InstallPageStrings,
} from "@/i18n/locales/install_page_strings";

export type {
  ConnectPageStrings,
  EvaluatePageStrings,
  WhatToStorePageStrings,
  ArchitecturePageStrings,
  InstallPageStrings,
};

/**
 * Per-page string packs for subpage content that is visible in locale routes.
 * Each page exports its own interface so translations can be added incrementally.
 * Strings default to English via spread; locales override only what they translate.
 */

export interface FaqPageStrings {
  title: string;
  intro: string;
}

export interface DocsIndexPageStrings {
  title: string;
}

export interface CliPageStrings {
  title: string;
}

export interface McpPageStrings {
  title: string;
}

export interface ApiReferencePageStrings {
  title: string;
}

export interface TroubleshootingPageStrings {
  title: string;
}

export interface PrivacyPageStrings {
  title: string;
}

export interface TermsPageStrings {
  title: string;
}

/** Docs sidebar / nav: labels not covered by `LocaleDictionary` or per-page `title` fields. */
export interface DocNavSidebarStrings {
  whatToStoreFirst: string;
  backupRestore: string;
  exposeTunnel: string;
  walkthrough: string;
  categoryHosted: string;
  hostedNeotoma: string;
  publicSandbox: string;
}

export interface SubpageLocalePack {
  install: InstallPageStrings;
  architecture: ArchitecturePageStrings;
  faq: FaqPageStrings;
  connect: ConnectPageStrings;
  docsIndex: DocsIndexPageStrings;
  evaluate: EvaluatePageStrings;
  cli: CliPageStrings;
  mcp: McpPageStrings;
  apiReference: ApiReferencePageStrings;
  whatToStore: WhatToStorePageStrings;
  troubleshooting: TroubleshootingPageStrings;
  privacy: PrivacyPageStrings;
  terms: TermsPageStrings;
  docNav: DocNavSidebarStrings;
}

const EN_SUBPAGE_PACK: SubpageLocalePack = {
  install: INSTALL_PAGE_EN,
  architecture: ARCHITECTURE_PAGE_EN,
  faq: {
    title: "FAQ",
    intro:
      "Answers to common questions about Neotoma: what it is, how it compares to SQLite/Mem0/Zep/RAG, how it works alongside Claude Code memory, what your agent should remember, and how to install it.",
  },
    connect: CONNECT_PAGE_EN,
  docsIndex: { title: "Documentation" },
  evaluate: EVALUATE_SUBPAGE_EN,
  cli: { title: "CLI reference" },
  mcp: { title: "MCP" },
  apiReference: { title: "API reference" },
  whatToStore: WHAT_TO_STORE_PAGE_EN,
  troubleshooting: { title: "Troubleshooting" },
  privacy: { title: "Privacy" },
  terms: { title: "Terms of use" },
  docNav: {
    whatToStoreFirst: "What to store first",
    backupRestore: "Backup and restore",
    exposeTunnel: "Expose tunnel",
    walkthrough: "Walkthrough",
    categoryHosted: "Hosted",
    hostedNeotoma: "Hosted Neotoma",
    publicSandbox: "Public sandbox",
  },
};

type SubpagePackOverrides = {
  [K in keyof SubpageLocalePack]?: Partial<SubpageLocalePack[K]>;
};

const SUBPAGE_LOCALE_PACKS: Record<string, SubpagePackOverrides> = {
  es: {
    install: { ...INSTALL_PAGE_EN, ...INSTALL_PAGE_ES },
    architecture: { ...ARCHITECTURE_PAGE_EN, ...ARCHITECTURE_PAGE_ES },
    faq: {
      title: "Preguntas frecuentes",
      intro:
        "Respuestas a preguntas habituales sobre Neotoma: qu\u00e9 es, c\u00f3mo se compara con SQLite/Mem0/Zep/RAG, c\u00f3mo convive con la memoria de Claude Code, qu\u00e9 deber\u00eda recordar tu agente y c\u00f3mo instalarlo.",
    },
    connect: { ...CONNECT_PAGE_EN, ...CONNECT_PAGE_ES },
    docsIndex: { title: "Documentaci\u00f3n" },
    evaluate: EVALUATE_SUBPAGE_ES,
    cli: { title: "Referencia CLI" },
    mcp: { title: "MCP" },
    apiReference: { title: "Referencia de API" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, ...WHAT_TO_STORE_PAGE_ES },
    troubleshooting: { title: "Soluci\u00f3n de problemas" },
    privacy: { title: "Privacidad" },
    terms: { title: "T\u00e9rminos de uso" },
    docNav: {
      whatToStoreFirst: "Qu\u00e9 almacenar primero",
      backupRestore: "Copia de seguridad y restauraci\u00f3n",
      exposeTunnel: "Exponer t\u00fanel",
      walkthrough: "Recorrido guiado",
      categoryHosted: "Alojado",
      hostedNeotoma: "Neotoma alojado",
      publicSandbox: "Sandbox p\u00fablico",
    },
  },
  ca: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "Opcions d\u2019instal\u00b7laci\u00f3",
      fiveMinuteIntegration: "Integraci\u00f3 en 5 minuts",
      fullyReversible: "Completament reversible",
      agentAssistedInstall: "Instal\u00b7laci\u00f3 assistida per agent",
      directIntegrationDocs: "Documentaci\u00f3 d\u2019integraci\u00f3 directa",
      manualInstallAndDocker: "Instal\u00b7laci\u00f3 manual i Docker",
      startWithEvaluation: "Comen\u00e7ar amb avaluaci\u00f3 \u2192",
      manualInstall: "Instal\u00b7laci\u00f3 manual",
      dockerInstall: "Instal\u00b7laci\u00f3 Docker",
      cliReference: "Refer\u00e8ncia CLI \u2192",
      fullReadme: "README complet \u2192",
      moreOptions: "M\u00e9s opcions:",
      whatChangesOnSystem: "Qu\u00e8 canvia al teu sistema",
      expandedInstallFirstSequence: "Seq\u00fc\u00e8ncia d\u2019instal\u00b7laci\u00f3 expandida",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "Arquitectura" },
    faq: { title: "Preguntes freq\u00fcents" },
    connect: { title: "Connectar remotament" },
    docsIndex: { title: "Documentaci\u00f3" },
    evaluate: { title: "Avaluar Neotoma" },
    cli: { title: "Refer\u00e8ncia CLI" },
    mcp: { title: "MCP" },
    apiReference: { title: "Refer\u00e8ncia d\u2019API" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "Qu\u00e8 emmagatzemar" },
    troubleshooting: { title: "Resoluci\u00f3 de problemes" },
    privacy: { title: "Privacitat" },
    terms: { title: "Termes d\u2019\u00fas" },
    docNav: {
      whatToStoreFirst: "Qu\u00e8 emmagatzemar primer",
      backupRestore: "C\u00f2pia de seguretat i restauraci\u00f3",
      exposeTunnel: "Exposar el t\u00fanel",
      walkthrough: "Guia pas a pas",
      categoryHosted: "Allotjat",
      hostedNeotoma: "Neotoma allotjat",
      publicSandbox: "Sandbox p\u00fablic",
    },
  },
  zh: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "\u5b89\u88c5\u9009\u9879",
      fiveMinuteIntegration: "5\u5206\u949f\u96c6\u6210",
      fullyReversible: "\u5b8c\u5168\u53ef\u9006",
      agentAssistedInstall: "\u4ee3\u7406\u8f85\u52a9\u5b89\u88c5",
      directIntegrationDocs: "\u76f4\u63a5\u96c6\u6210\u6587\u6863",
      manualInstallAndDocker: "\u624b\u52a8\u5b89\u88c5\u548c Docker",
      startWithEvaluation: "\u4ece\u8bc4\u4f30\u5f00\u59cb \u2192",
      manualInstall: "\u624b\u52a8\u5b89\u88c5",
      dockerInstall: "Docker \u5b89\u88c5",
      cliReference: "CLI \u53c2\u8003 \u2192",
      fullReadme: "\u5b8c\u6574 README \u2192",
      moreOptions: "\u66f4\u591a\u9009\u9879\uff1a",
      whatChangesOnSystem: "\u7cfb\u7edf\u4e0a\u7684\u53d8\u5316",
      expandedInstallFirstSequence: "\u5b8c\u6574\u5b89\u88c5\u5e8f\u5217",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "\u67b6\u6784" },
    faq: { title: "\u5e38\u89c1\u95ee\u9898" },
    connect: { title: "\u8fdc\u7a0b\u8fde\u63a5" },
    docsIndex: { title: "\u6587\u6863" },
    evaluate: { title: "\u8bc4\u4f30 Neotoma" },
    cli: { title: "CLI \u53c2\u8003" },
    mcp: { title: "MCP" },
    apiReference: { title: "API \u53c2\u8003" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "\u5b58\u50a8\u4ec0\u4e48" },
    troubleshooting: { title: "\u6545\u969c\u6392\u9664" },
    privacy: { title: "\u9690\u79c1" },
    terms: { title: "\u4f7f\u7528\u6761\u6b3e" },
    docNav: {
      whatToStoreFirst: "\u4f18\u5148\u5b58\u50a8\u4ec0\u4e48",
      backupRestore: "\u5907\u4efd\u4e0e\u6062\u590d",
      exposeTunnel: "\u66b4\u9732\u96a7\u9053",
      walkthrough: "\u4f7f\u7528\u6307\u5357",
      categoryHosted: "\u6258\u7ba1",
      hostedNeotoma: "\u6258\u7ba1 Neotoma",
      publicSandbox: "\u516c\u5f00\u6c99\u76d2",
    },
  },
  hi: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "\u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0935\u093f\u0915\u0932\u094d\u092a",
      fiveMinuteIntegration: "5 \u092e\u093f\u0928\u091f \u0915\u093e \u0907\u0902\u091f\u0940\u0917\u094d\u0930\u0947\u0936\u0928",
      fullyReversible: "\u092a\u0942\u0930\u094d\u0923 \u0930\u0942\u092a \u0938\u0947 \u092a\u094d\u0930\u0924\u093f\u0935\u0930\u094d\u0924\u0940",
      agentAssistedInstall: "\u090f\u091c\u0947\u0902\u091f-\u0938\u0939\u093e\u092f\u0924\u093e \u092a\u094d\u0930\u093e\u092a\u094d\u0924 \u0907\u0902\u0938\u094d\u091f\u0949\u0932",
      directIntegrationDocs: "\u0938\u0940\u0927\u0947 \u0907\u0902\u091f\u0940\u0917\u094d\u0930\u0947\u0936\u0928 \u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c\u093c",
      manualInstallAndDocker: "\u092e\u0948\u0928\u0941\u0905\u0932 \u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0914\u0930 Docker",
      startWithEvaluation: "\u092e\u0942\u0932\u094d\u092f\u093e\u0902\u0915\u0928 \u0938\u0947 \u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902 \u2192",
      manualInstall: "\u092e\u0948\u0928\u0941\u0905\u0932 \u0907\u0902\u0938\u094d\u091f\u0949\u0932",
      dockerInstall: "Docker \u0907\u0902\u0938\u094d\u091f\u0949\u0932",
      cliReference: "CLI \u0938\u0902\u0926\u0930\u094d\u092d \u2192",
      fullReadme: "\u092a\u0942\u0930\u094d\u0923 README \u2192",
      moreOptions: "\u0905\u0927\u093f\u0915 \u0935\u093f\u0915\u0932\u094d\u092a:",
      whatChangesOnSystem: "\u0906\u092a\u0915\u0947 \u0938\u093f\u0938\u094d\u091f\u092e \u092a\u0930 \u0915\u094d\u092f\u093e \u092c\u0926\u0932\u0924\u093e \u0939\u0948",
      expandedInstallFirstSequence: "\u0935\u093f\u0938\u094d\u0924\u0943\u0924 \u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0905\u0928\u0941\u0915\u094d\u0930\u092e",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "\u0906\u0930\u094d\u0915\u093f\u091f\u0947\u0915\u094d\u091a\u0930" },
    faq: { title: "\u0905\u0915\u094d\u0938\u0930 \u092a\u0942\u091b\u0947 \u091c\u093e\u0928\u0947 \u0935\u093e\u0932\u0947 \u092a\u094d\u0930\u0936\u094d\u0928" },
    connect: { title: "\u0930\u093f\u092e\u094b\u091f\u0932\u0940 \u0915\u0928\u0947\u0915\u094d\u091f \u0915\u0930\u0947\u0902" },
    docsIndex: { title: "\u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c\u093c" },
    evaluate: { title: "Neotoma \u0915\u093e \u092e\u0942\u0932\u094d\u092f\u093e\u0902\u0915\u0928" },
    cli: { title: "CLI \u0938\u0902\u0926\u0930\u094d\u092d" },
    mcp: { title: "MCP" },
    apiReference: { title: "API \u0938\u0902\u0926\u0930\u094d\u092d" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "\u0915\u094d\u092f\u093e \u0938\u094d\u091f\u094b\u0930 \u0915\u0930\u0947\u0902" },
    troubleshooting: { title: "\u0938\u092e\u0938\u094d\u092f\u093e \u0928\u093f\u0935\u093e\u0930\u0923" },
    privacy: { title: "\u0917\u094b\u092a\u0928\u0940\u092f\u0924\u093e" },
    terms: { title: "\u0909\u092a\u092f\u094b\u0917 \u0915\u0940 \u0936\u0930\u094d\u0924\u0947\u0902" },
    docNav: {
      whatToStoreFirst: "\u092a\u0939\u0932\u0947 \u0915\u094d\u092f\u093e \u0938\u0902\u0917\u094d\u0930\u0939\u0940\u0924 \u0915\u0930\u0947\u0902",
      backupRestore: "\u092c\u0948\u0915\u0905\u092a \u0914\u0930 \u092a\u0941\u0928\u0930\u094d\u0938\u094d\u0925\u093e\u092a\u0928\u093e",
      exposeTunnel: "\u091f\u0928\u0932 \u0915\u094b \u092a\u094d\u0930\u0915\u093e\u0936\u093f\u0924 \u0915\u0930\u0947\u0902",
      walkthrough: "\u0938\u094d\u091f\u0947\u092a-\u0926\u0930-\u0938\u094d\u091f\u0947\u092a \u0917\u093e\u0907\u0921",
      categoryHosted: "\u0939\u094b\u0938\u094d\u091f\u0947\u0921",
      hostedNeotoma: "\u0939\u094b\u0938\u094d\u091f\u0947\u0921 Neotoma",
      publicSandbox: "\u0938\u093e\u0930\u094d\u0935\u091c\u0928\u093f\u0915 \u0938\u0948\u0902\u0921\u092c\u0949\u0915\u094d\u0938",
    },
  },
  ar: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u062a\u062b\u0628\u064a\u062a",
      fiveMinuteIntegration: "\u062a\u0643\u0627\u0645\u0644 \u0641\u064a 5 \u062f\u0642\u0627\u0626\u0642",
      fullyReversible: "\u0642\u0627\u0628\u0644 \u0644\u0644\u062a\u0631\u0627\u062c\u0639 \u0628\u0627\u0644\u0643\u0627\u0645\u0644",
      agentAssistedInstall: "\u062a\u062b\u0628\u064a\u062a \u0628\u0645\u0633\u0627\u0639\u062f\u0629 \u0627\u0644\u0648\u0643\u064a\u0644",
      directIntegrationDocs: "\u0648\u062b\u0627\u0626\u0642 \u0627\u0644\u062a\u0643\u0627\u0645\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631",
      manualInstallAndDocker: "\u0627\u0644\u062a\u062b\u0628\u064a\u062a \u0627\u0644\u064a\u062f\u0648\u064a \u0648Docker",
      startWithEvaluation: "\u0627\u0628\u062f\u0623 \u0628\u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u2192",
      manualInstall: "\u0627\u0644\u062a\u062b\u0628\u064a\u062a \u0627\u0644\u064a\u062f\u0648\u064a",
      dockerInstall: "\u062a\u062b\u0628\u064a\u062a Docker",
      cliReference: "\u0645\u0631\u062c\u0639 CLI \u2192",
      fullReadme: "README \u0627\u0644\u0643\u0627\u0645\u0644 \u2192",
      moreOptions: "\u062e\u064a\u0627\u0631\u0627\u062a \u0623\u062e\u0631\u0649:",
      whatChangesOnSystem: "\u0645\u0627 \u0627\u0644\u0630\u064a \u064a\u062a\u063a\u064a\u0631 \u0639\u0644\u0649 \u0646\u0638\u0627\u0645\u0643",
      expandedInstallFirstSequence: "\u062a\u0633\u0644\u0633\u0644 \u0627\u0644\u062a\u062b\u0628\u064a\u062a \u0627\u0644\u0645\u0648\u0633\u0639",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "\u0627\u0644\u0628\u0646\u064a\u0629" },
    faq: { title: "\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0634\u0627\u0626\u0639\u0629" },
    connect: { title: "\u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0639\u0646 \u0628\u0639\u062f" },
    docsIndex: { title: "\u0627\u0644\u0648\u062b\u0627\u0626\u0642" },
    evaluate: { title: "\u062a\u0642\u064a\u064a\u0645 Neotoma" },
    cli: { title: "\u0645\u0631\u062c\u0639 CLI" },
    mcp: { title: "MCP" },
    apiReference: { title: "\u0645\u0631\u062c\u0639 API" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "\u0645\u0627\u0630\u0627 \u062a\u062e\u0632\u0646" },
    troubleshooting: { title: "\u0627\u0633\u062a\u0643\u0634\u0627\u0641 \u0627\u0644\u0623\u062e\u0637\u0627\u0621" },
    privacy: { title: "\u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629" },
    terms: { title: "\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645" },
    docNav: {
      whatToStoreFirst: "\u0645\u0627 \u0627\u0644\u0630\u064a \u062a\u062e\u0632\u0646\u0647 \u0623\u0648\u0644\u064b\u0627",
      backupRestore: "\u0627\u0644\u0646\u0633\u062e \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a \u0648\u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639",
      exposeTunnel: "\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0646\u0641\u0642",
      walkthrough: "\u062c\u0648\u0644\u0629 \u0625\u0631\u0634\u0627\u062f\u064a\u0629",
      categoryHosted: "\u0645\u0633\u062a\u0636\u0627\u0641",
      hostedNeotoma: "Neotoma \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641",
      publicSandbox: "\u0628\u064a\u0626\u0629 \u0627\u062e\u062a\u0628\u0627\u0631 \u0639\u0627\u0645\u0629",
    },
  },
  fr: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "Options d\u2019installation",
      fiveMinuteIntegration: "Int\u00e9gration en 5 minutes",
      fullyReversible: "Enti\u00e8rement r\u00e9versible",
      agentAssistedInstall: "Installation assist\u00e9e par agent",
      directIntegrationDocs: "Documentation d\u2019int\u00e9gration directe",
      manualInstallAndDocker: "Installation manuelle et Docker",
      startWithEvaluation: "Commencer par l\u2019\u00e9valuation \u2192",
      manualInstall: "Installation manuelle",
      dockerInstall: "Installation Docker",
      cliReference: "R\u00e9f\u00e9rence CLI \u2192",
      fullReadme: "README complet \u2192",
      moreOptions: "Plus d\u2019options :",
      whatChangesOnSystem: "Ce qui change sur votre syst\u00e8me",
      expandedInstallFirstSequence: "S\u00e9quence d\u2019installation d\u00e9taill\u00e9e",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "Architecture" },
    faq: { title: "Questions fr\u00e9quentes" },
    connect: { title: "Connexion \u00e0 distance" },
    docsIndex: { title: "Documentation" },
    evaluate: { title: "\u00c9valuer Neotoma" },
    cli: { title: "R\u00e9f\u00e9rence CLI" },
    mcp: { title: "MCP" },
    apiReference: { title: "R\u00e9f\u00e9rence API" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "Quoi stocker" },
    troubleshooting: { title: "D\u00e9pannage" },
    privacy: { title: "Confidentialit\u00e9" },
    terms: { title: "Conditions d\u2019utilisation" },
    docNav: {
      whatToStoreFirst: "Quoi stocker en premier",
      backupRestore: "Sauvegarde et restauration",
      exposeTunnel: "Exposer le tunnel",
      walkthrough: "Visite guid\u00e9e",
      categoryHosted: "H\u00e9berg\u00e9",
      hostedNeotoma: "Neotoma h\u00e9berg\u00e9",
      publicSandbox: "Sandbox public",
    },
  },
  pt: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "Op\u00e7\u00f5es de instala\u00e7\u00e3o",
      fiveMinuteIntegration: "Integra\u00e7\u00e3o em 5 minutos",
      fullyReversible: "Totalmente revers\u00edvel",
      agentAssistedInstall: "Instala\u00e7\u00e3o assistida por agente",
      directIntegrationDocs: "Documenta\u00e7\u00e3o de integra\u00e7\u00e3o direta",
      manualInstallAndDocker: "Instala\u00e7\u00e3o manual e Docker",
      startWithEvaluation: "Come\u00e7ar com avalia\u00e7\u00e3o \u2192",
      manualInstall: "Instala\u00e7\u00e3o manual",
      dockerInstall: "Instala\u00e7\u00e3o Docker",
      cliReference: "Refer\u00eancia CLI \u2192",
      fullReadme: "README completo \u2192",
      moreOptions: "Mais op\u00e7\u00f5es:",
      whatChangesOnSystem: "O que muda no seu sistema",
      expandedInstallFirstSequence: "Sequ\u00eancia de instala\u00e7\u00e3o expandida",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "Arquitetura" },
    faq: { title: "Perguntas frequentes" },
    connect: { title: "Conectar remotamente" },
    docsIndex: { title: "Documenta\u00e7\u00e3o" },
    evaluate: { title: "Avaliar Neotoma" },
    cli: { title: "Refer\u00eancia CLI" },
    mcp: { title: "MCP" },
    apiReference: { title: "Refer\u00eancia de API" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "O que armazenar" },
    troubleshooting: { title: "Solu\u00e7\u00e3o de problemas" },
    privacy: { title: "Privacidade" },
    terms: { title: "Termos de uso" },
    docNav: {
      whatToStoreFirst: "O que armazenar primeiro",
      backupRestore: "Backup e restaura\u00e7\u00e3o",
      exposeTunnel: "Expor t\u00fanel",
      walkthrough: "Tour guiado",
      categoryHosted: "Hospedado",
      hostedNeotoma: "Neotoma hospedado",
      publicSandbox: "Sandbox p\u00fablico",
    },
  },
  ru: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "\u0412\u0430\u0440\u0438\u0430\u043d\u0442\u044b \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0438",
      fiveMinuteIntegration: "\u0418\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f \u0437\u0430 5 \u043c\u0438\u043d\u0443\u0442",
      fullyReversible: "\u041f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u043e\u0431\u0440\u0430\u0442\u0438\u043c\u043e",
      agentAssistedInstall: "\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430 \u0441 \u043f\u043e\u043c\u043e\u0449\u044c\u044e \u0430\u0433\u0435\u043d\u0442\u0430",
      directIntegrationDocs: "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430\u0446\u0438\u044f \u043f\u043e \u043f\u0440\u044f\u043c\u043e\u0439 \u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438",
      manualInstallAndDocker: "\u0420\u0443\u0447\u043d\u0430\u044f \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430 \u0438 Docker",
      startWithEvaluation: "\u041d\u0430\u0447\u0430\u0442\u044c \u0441 \u043e\u0446\u0435\u043d\u043a\u0438 \u2192",
      manualInstall: "\u0420\u0443\u0447\u043d\u0430\u044f \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430",
      dockerInstall: "\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430 Docker",
      cliReference: "\u0421\u043f\u0440\u0430\u0432\u043a\u0430 CLI \u2192",
      fullReadme: "\u041f\u043e\u043b\u043d\u044b\u0439 README \u2192",
      moreOptions: "\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b:",
      whatChangesOnSystem: "\u0427\u0442\u043e \u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f \u0432 \u0432\u0430\u0448\u0435\u0439 \u0441\u0438\u0441\u0442\u0435\u043c\u0435",
      expandedInstallFirstSequence: "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u043d\u0430\u044f \u043f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0438",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "\u0410\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u0443\u0440\u0430" },
    faq: { title: "\u0427\u0430\u0441\u0442\u043e \u0437\u0430\u0434\u0430\u0432\u0430\u0435\u043c\u044b\u0435 \u0432\u043e\u043f\u0440\u043e\u0441\u044b" },
    connect: { title: "\u0423\u0434\u0430\u043b\u0451\u043d\u043d\u043e\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435" },
    docsIndex: { title: "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430\u0446\u0438\u044f" },
    evaluate: { title: "\u041e\u0446\u0435\u043d\u0438\u0442\u044c Neotoma" },
    cli: { title: "\u0421\u043f\u0440\u0430\u0432\u043a\u0430 CLI" },
    mcp: { title: "MCP" },
    apiReference: { title: "\u0421\u043f\u0440\u0430\u0432\u043a\u0430 API" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "\u0427\u0442\u043e \u0445\u0440\u0430\u043d\u0438\u0442\u044c" },
    troubleshooting: { title: "\u0423\u0441\u0442\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u043d\u0435\u043f\u043e\u043b\u0430\u0434\u043e\u043a" },
    privacy: { title: "\u041a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c" },
    terms: { title: "\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f" },
    docNav: {
      whatToStoreFirst: "\u0427\u0442\u043e \u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0432 \u043f\u0435\u0440\u0432\u0443\u044e \u043e\u0447\u0435\u0440\u0435\u0434\u044c",
      backupRestore: "\u0420\u0435\u0437\u0435\u0440\u0432\u043d\u043e\u0435 \u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0438 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435",
      exposeTunnel: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0442\u0443\u043d\u043d\u0435\u043b\u044c",
      walkthrough: "\u041f\u043e\u0448\u0430\u0433\u043e\u0432\u044b\u0439 \u0442\u0443\u0440",
      categoryHosted: "\u0425\u043e\u0441\u0442\u0438\u043d\u0433",
      hostedNeotoma: "\u0425\u043e\u0441\u0442\u0438\u043d\u0433 Neotoma",
      publicSandbox: "\u041f\u0443\u0431\u043b\u0438\u0447\u043d\u0430\u044f \u043f\u0435\u0441\u043e\u0447\u043d\u0438\u0446\u0430",
    },
  },
  bn: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "\u0987\u09a8\u09b8\u09cd\u099f\u09b2 \u09ac\u09bf\u0995\u09b2\u09cd\u09aa",
      fiveMinuteIntegration: "\u09e9 \u09ae\u09bf\u09a8\u09bf\u099f\u09c7\u09b0 \u0987\u09a8\u09cd\u099f\u09bf\u0997\u09cd\u09b0\u09c7\u09b6\u09a8",
      fullyReversible: "\u09b8\u09ae\u09cd\u09aa\u09c2\u09b0\u09cd\u09a3 \u09aa\u09cd\u09b0\u09a4\u09cd\u09af\u09be\u09ac\u09b0\u09cd\u09a4\u09a8\u09af\u09cb\u0997\u09cd\u09af",
      agentAssistedInstall: "\u098f\u099c\u09c7\u09a8\u09cd\u099f-\u09b8\u09b9\u09be\u09af\u09bc\u09a4\u09be\u09aa\u09cd\u09b0\u09be\u09aa\u09cd\u09a4 \u0987\u09a8\u09b8\u09cd\u099f\u09b2",
      directIntegrationDocs: "\u09b8\u09b0\u09be\u09b8\u09b0\u09bf \u0987\u09a8\u09cd\u099f\u09bf\u0997\u09cd\u09b0\u09c7\u09b6\u09a8 \u09a1\u0995\u09c1\u09ae\u09c7\u09a8\u09cd\u099f\u09c7\u09b6\u09a8",
      manualInstallAndDocker: "\u09ae\u09cd\u09af\u09be\u09a8\u09c1\u09af\u09bc\u09be\u09b2 \u0987\u09a8\u09b8\u09cd\u099f\u09b2 \u098f\u09ac\u0982 Docker",
      startWithEvaluation: "\u09ae\u09c2\u09b2\u09cd\u09af\u09be\u09af\u09bc\u09a8 \u09a6\u09bf\u09af\u09bc\u09c7 \u09b6\u09c1\u09b0\u09c1 \u0995\u09b0\u09c1\u09a8 \u2192",
      manualInstall: "\u09ae\u09cd\u09af\u09be\u09a8\u09c1\u09af\u09bc\u09be\u09b2 \u0987\u09a8\u09b8\u09cd\u099f\u09b2",
      dockerInstall: "Docker \u0987\u09a8\u09b8\u09cd\u099f\u09b2",
      cliReference: "CLI \u09b0\u09c7\u09ab\u09be\u09b0\u09c7\u09a8\u09cd\u09b8 \u2192",
      fullReadme: "\u09b8\u09ae\u09cd\u09aa\u09c2\u09b0\u09cd\u09a3 README \u2192",
      moreOptions: "\u0986\u09b0\u0993 \u09ac\u09bf\u0995\u09b2\u09cd\u09aa:",
      whatChangesOnSystem: "\u0986\u09aa\u09a8\u09be\u09b0 \u09b8\u09bf\u09b8\u09cd\u099f\u09c7\u09ae\u09c7 \u0995\u09c0 \u09aa\u09b0\u09bf\u09ac\u09b0\u09cd\u09a4\u09a8 \u09b9\u09af\u09bc",
      expandedInstallFirstSequence: "\u09ac\u09bf\u09b8\u09cd\u09a4\u09be\u09b0\u09bf\u09a4 \u0987\u09a8\u09b8\u09cd\u099f\u09b2 \u09b8\u09bf\u0995\u09cb\u09af\u09bc\u09c7\u09a8\u09cd\u09b8",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "\u0986\u09b0\u09cd\u0995\u09bf\u099f\u09c7\u0995\u099a\u09be\u09b0" },
    faq: { title: "\u09aa\u09cd\u09b0\u09be\u09af\u09bc\u0987 \u099c\u09bf\u099c\u09cd\u099e\u09be\u09b8\u09bf\u09a4 \u09aa\u09cd\u09b0\u09b6\u09cd\u09a8" },
    connect: { title: "\u09a6\u09c2\u09b0\u09ac\u09b0\u09cd\u09a4\u09c0\u09ad\u09be\u09ac\u09c7 \u09b8\u0982\u09af\u09c1\u0995\u09cd\u09a4 \u0995\u09b0\u09c1\u09a8" },
    docsIndex: { title: "\u09a1\u0995\u09c1\u09ae\u09c7\u09a8\u09cd\u099f\u09c7\u09b6\u09a8" },
    evaluate: { title: "Neotoma \u09ae\u09c2\u09b2\u09cd\u09af\u09be\u09af\u09bc\u09a8" },
    cli: { title: "CLI \u09b0\u09c7\u09ab\u09be\u09b0\u09c7\u09a8\u09cd\u09b8" },
    mcp: { title: "MCP" },
    apiReference: { title: "API \u09b0\u09c7\u09ab\u09be\u09b0\u09c7\u09a8\u09cd\u09b8" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "\u0995\u09c0 \u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3 \u0995\u09b0\u09ac\u09c7\u09a8" },
    troubleshooting: { title: "\u09b8\u09ae\u09b8\u09cd\u09af\u09be \u09b8\u09ae\u09be\u09a7\u09be\u09a8" },
    privacy: { title: "\u0997\u09cb\u09aa\u09a8\u09c0\u09af\u09bc\u09a4\u09be" },
    terms: { title: "\u09ac\u09cd\u09af\u09ac\u09b9\u09be\u09b0\u09c7\u09b0 \u09b6\u09b0\u09cd\u09a4\u09be\u09ac\u09b2\u09c0" },
    docNav: {
      whatToStoreFirst: "\u09aa\u09cd\u09b0\u09a5\u09ae\u09c7 \u0995\u09c0 \u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3 \u0995\u09b0\u09ac\u09c7\u09a8",
      backupRestore: "\u09ac\u09cd\u09af\u09be\u0995\u09be\u09aa \u098f\u09ac\u0982 \u09aa\u09c1\u09a8\u09b0\u09c1\u09a6\u09cd\u09a7\u09be\u09b0",
      exposeTunnel: "\u099f\u09a8\u09c7\u09b2 \u09aa\u09cd\u09b0\u0995\u09be\u09b6 \u0995\u09b0\u09c1\u09a8",
      walkthrough: "\u09aa\u09cd\u09af\u09be\u0995\u09cd\u099f\u09bf\u0995\u09be\u09b2 \u0997\u09be\u0987\u09a1",
      categoryHosted: "\u09b9\u09cb\u09b8\u09cd\u099f",
      hostedNeotoma: "\u09b9\u09cb\u09b8\u09cd\u099f Neotoma",
      publicSandbox: "\u09aa\u09be\u09ac\u09cd\u09b2\u09bf\u0995 \u09b8\u09cd\u09af\u09be\u09a8\u09cd\u09a1\u09ac\u0995\u09cd\u09b8",
    },
  },
  ur: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "\u0627\u0646\u0633\u0679\u0627\u0644 \u06a9\u06d2 \u0627\u062e\u062a\u06cc\u0627\u0631\u0627\u062a",
      fiveMinuteIntegration: "5 \u0645\u0646\u0679 \u06a9\u0627 \u0627\u0646\u0679\u06cc\u06af\u0631\u06cc\u0634\u0646",
      fullyReversible: "\u0645\u06a9\u0645\u0644 \u0637\u0648\u0631 \u067e\u0631 \u0648\u0627\u067e\u0633 \u06c1\u0648\u0646\u06d2 \u06a9\u06d2 \u0642\u0627\u0628\u0644",
      agentAssistedInstall: "\u0627\u06cc\u062c\u0646\u0679 \u06a9\u06cc \u0645\u062f\u062f \u0633\u06d2 \u0627\u0646\u0633\u0679\u0627\u0644",
      directIntegrationDocs: "\u0628\u0631\u0627\u06c1 \u0631\u0627\u0633\u062a \u0627\u0646\u0679\u06cc\u06af\u0631\u06cc\u0634\u0646 \u062f\u0633\u062a\u0627\u0648\u06cc\u0632\u0627\u062a",
      manualInstallAndDocker: "\u062f\u0633\u062a\u06cc \u0627\u0646\u0633\u0679\u0627\u0644 \u0627\u0648\u0631 Docker",
      startWithEvaluation: "\u062c\u0627\u0626\u0632\u06d2 \u0633\u06d2 \u0634\u0631\u0648\u0639 \u06a9\u0631\u06cc\u06ba \u2192",
      manualInstall: "\u062f\u0633\u062a\u06cc \u0627\u0646\u0633\u0679\u0627\u0644",
      dockerInstall: "Docker \u0627\u0646\u0633\u0679\u0627\u0644",
      cliReference: "CLI \u062d\u0648\u0627\u0644\u06c1 \u2192",
      fullReadme: "\u0645\u06a9\u0645\u0644 README \u2192",
      moreOptions: "\u0645\u0632\u06cc\u062f \u0627\u062e\u062a\u06cc\u0627\u0631\u0627\u062a:",
      whatChangesOnSystem: "\u0622\u067e \u06a9\u06d2 \u0633\u0633\u0679\u0645 \u067e\u0631 \u06a9\u06cc\u0627 \u0628\u062f\u0644\u062a\u0627 \u06c1\u06d2",
      expandedInstallFirstSequence: "\u062a\u0641\u0635\u06cc\u0644\u06cc \u0627\u0646\u0633\u0679\u0627\u0644 \u062a\u0631\u062a\u06cc\u0628",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "\u0622\u0631\u06a9\u06cc\u0679\u06cc\u06a9\u0686\u0631" },
    faq: { title: "\u0627\u06a9\u062b\u0631 \u067e\u0648\u0686\u06be\u06d2 \u062c\u0627\u0646\u06d2 \u0648\u0627\u0644\u06d2 \u0633\u0648\u0627\u0644\u0627\u062a" },
    connect: { title: "\u0631\u06cc\u0645\u0648\u0679\u0644\u06cc \u0645\u0646\u0633\u0644\u06a9 \u06a9\u0631\u06cc\u06ba" },
    docsIndex: { title: "\u062f\u0633\u062a\u0627\u0648\u06cc\u0632\u0627\u062a" },
    evaluate: { title: "Neotoma \u06a9\u0627 \u062c\u0627\u0626\u0632\u06c1" },
    cli: { title: "CLI \u062d\u0648\u0627\u0644\u06c1" },
    mcp: { title: "MCP" },
    apiReference: { title: "API \u062d\u0648\u0627\u0644\u06c1" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "\u06a9\u06cc\u0627 \u0633\u0679\u0648\u0631 \u06a9\u0631\u06cc\u06ba" },
    troubleshooting: { title: "\u0645\u0633\u0627\u0626\u0644 \u06a9\u0627 \u062d\u0644" },
    privacy: { title: "\u0631\u0627\u0632\u062f\u0627\u0631\u06cc" },
    terms: { title: "\u0627\u0633\u062a\u0639\u0645\u0627\u0644 \u06a9\u06cc \u0634\u0631\u0627\u0626\u0637" },
    docNav: {
      whatToStoreFirst: "\u067e\u06c1\u0644\u06d2 \u06a9\u06cc\u0627 \u0633\u0679\u0648\u0631 \u06a9\u0631\u06cc\u06ba",
      backupRestore: "\u0628\u06cc\u06a9 \u0622\u067e \u0627\u0648\u0631 \u0628\u06d2\u0627\u0632\u06cc\u0627\u0628\u06cc",
      exposeTunnel: "\u0679\u0646\u0644 \u0632\u0627\u06c1\u0631 \u06a9\u0631\u06cc\u06ba",
      walkthrough: "\u0627\u06cc\u06a9 \u0627\u06cc\u06a9 \u0642\u062f\u0645\u0648\u062a \u0645\u0646\u062a\u0642\u0644",
      categoryHosted: "\u06c1\u0648\u0633\u0679\u0688",
      hostedNeotoma: "\u06c1\u0648\u0633\u0679\u0688 Neotoma",
      publicSandbox: "\u0639\u0648\u0627\u0645\u06cc \u0633\u06cc\u0646\u0688\u0628\u0627\u06a9\u0633",
    },
  },
  id: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "Opsi instalasi",
      fiveMinuteIntegration: "Integrasi 5 menit",
      fullyReversible: "Sepenuhnya dapat dikembalikan",
      agentAssistedInstall: "Instalasi dibantu agen",
      directIntegrationDocs: "Dokumentasi integrasi langsung",
      manualInstallAndDocker: "Instalasi manual dan Docker",
      startWithEvaluation: "Mulai dengan evaluasi \u2192",
      manualInstall: "Instalasi manual",
      dockerInstall: "Instalasi Docker",
      cliReference: "Referensi CLI \u2192",
      fullReadme: "README lengkap \u2192",
      moreOptions: "Opsi lainnya:",
      whatChangesOnSystem: "Apa yang berubah di sistem Anda",
      expandedInstallFirstSequence: "Urutan instalasi lengkap",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "Arsitektur" },
    faq: { title: "Pertanyaan umum" },
    connect: { title: "Hubungkan jarak jauh" },
    docsIndex: { title: "Dokumentasi" },
    evaluate: { title: "Evaluasi Neotoma" },
    cli: { title: "Referensi CLI" },
    mcp: { title: "MCP" },
    apiReference: { title: "Referensi API" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "Apa yang disimpan" },
    troubleshooting: { title: "Pemecahan masalah" },
    privacy: { title: "Privasi" },
    terms: { title: "Ketentuan penggunaan" },
    docNav: {
      whatToStoreFirst: "Apa yang disimpan lebih dulu",
      backupRestore: "Cadangan dan pemulihan",
      exposeTunnel: "Ekspos terowongan",
      walkthrough: "Panduan langkah demi langkah",
      categoryHosted: "Ber-hosting",
      hostedNeotoma: "Neotoma ter-hosting",
      publicSandbox: "Sandbox publik",
    },
  },
  de: {
    install: {
      ...INSTALL_PAGE_EN,
      title: "Installationsoptionen",
      fiveMinuteIntegration: "Integration in 5 Minuten",
      fullyReversible: "Vollst\u00e4ndig umkehrbar",
      agentAssistedInstall: "Agentengest\u00fctzte Installation",
      directIntegrationDocs: "Direkte Integrationsdokumentation",
      manualInstallAndDocker: "Manuelle Installation und Docker",
      startWithEvaluation: "Mit Bewertung beginnen \u2192",
      manualInstall: "Manuelle Installation",
      dockerInstall: "Docker-Installation",
      cliReference: "CLI-Referenz \u2192",
      fullReadme: "Vollst\u00e4ndige README \u2192",
      moreOptions: "Weitere Optionen:",
      whatChangesOnSystem: "Was sich auf Ihrem System \u00e4ndert",
      expandedInstallFirstSequence: "Erweiterte Installationssequenz",
    },
    architecture: { ...ARCHITECTURE_PAGE_EN, title: "Architektur" },
    faq: { title: "H\u00e4ufig gestellte Fragen" },
    connect: { title: "Remote verbinden" },
    docsIndex: { title: "Dokumentation" },
    evaluate: { title: "Neotoma bewerten" },
    cli: { title: "CLI-Referenz" },
    mcp: { title: "MCP" },
    apiReference: { title: "API-Referenz" },
    whatToStore: { ...WHAT_TO_STORE_PAGE_EN, title: "Was speichern" },
    troubleshooting: { title: "Fehlerbehebung" },
    privacy: { title: "Datenschutz" },
    terms: { title: "Nutzungsbedingungen" },
    docNav: {
      whatToStoreFirst: "Was zuerst speichern",
      backupRestore: "Sichern und Wiederherstellen",
      exposeTunnel: "Tunnel freigeben",
      walkthrough: "Interaktive Tour",
      categoryHosted: "Gehostet",
      hostedNeotoma: "Gehostetes Neotoma",
      publicSandbox: "\u00d6ffentliche Sandbox",
    },
  },
};

function buildSubpagePack(locale: SupportedLocale): SubpageLocalePack {
  if (locale === "en") return EN_SUBPAGE_PACK;
  const overrides = SUBPAGE_LOCALE_PACKS[locale];
  if (!overrides) return EN_SUBPAGE_PACK;

  const result = {} as SubpageLocalePack;
  for (const key of Object.keys(EN_SUBPAGE_PACK) as Array<keyof SubpageLocalePack>) {
    const merged = { ...EN_SUBPAGE_PACK[key], ...(overrides[key] ?? {}) } as SubpageLocalePack[typeof key];
    (result as Record<keyof SubpageLocalePack, SubpageLocalePack[keyof SubpageLocalePack]>)[key] =
      merged;
  }
  return result;
}

export function getSubpageLocalePack(locale: SupportedLocale): SubpageLocalePack {
  return buildSubpagePack(locale);
}
