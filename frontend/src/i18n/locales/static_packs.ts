import { getDictionary } from "@/i18n/dictionaries";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";
import type { HomeBodyPack } from "@/i18n/locales/home_body_types";
import { HOME_BODY_EN } from "@/i18n/locales/home_body_en";
import { getHomeBodyPack } from "@/i18n/locales/home_body_registry";

export interface SeoRouteCopy {
  title: string;
  description: string;
}

export interface StaticLocalePack {
  homeHero: {
    titlePrefix: string;
    titleAccent: string;
    titleMid: string;
    titleFocus: string;
    withoutSharedMemory: string;
    bullets: [string, string, string];
    summary: string;
    summaryRecordTypes: string[];
    ctaEvaluateWithAgent: string;
    ctaEvaluateCompact: string;
    ctaViewGuarantees: string;
    ctaInstall: string;
    /** Sticky home banner: second action → /meet (creator meetings). */
    ctaMeetCreator: string;
    ctaMeetCreatorCompact: string;
    ctaOfficeHours: string;
    ctaOfficeHoursSubtext: string;
    subcopy: string;
    curiosityGap: string;
    /** Hero micro-label below primary CTAs (displayed uppercase in UI) */
    audienceTagline: string;
    /** Compact hero reinforcing paragraph -- outcome line */
    heroReinforcement: string;
    /** Second hero paragraph -- mechanism/how line */
    heroReinforcementSecondary: string;
  };
  siteSections: {
    intro: string;
    personalOs: string;
    beforeAfter: string;
    who?: string;
    demo?: string;
    recordTypes?: string;
    guarantees: string;
    evaluate?: string;
    /** Home slide before footer; accordion + FAQ link */
    commonQuestions?: string;
    /** Home FAQ block heading */
    frequentlyAskedQuestions?: string;
    inspect: string;
    architecture: string;
    useCases: string;
    interfaces: string;
    learnMore: string;
    resources: string;
  };
  memory: {
    vendors: string;
    representativeProviders: string;
    platform: string;
    retrievalRag: string;
    files: string;
    database: string;
    deterministic: string;
    platformShort: string;
    ragShort: string;
    filesShort: string;
    databaseShort: string;
    deterministicShort: string;
    onThisPage: string;
    showFewer: string;
    showAllGuarantees: (count: number) => string;
  };
  foundations: {
    title: string;
    onThisPage: string;
    privacyFirst: string;
    deterministic: string;
    immutable: string;
    crossPlatform: string;
  };
  seo: {
    home: SeoRouteCopy;
    docs: SeoRouteCopy;
    install: SeoRouteCopy;
    foundations: SeoRouteCopy;
    memoryGuarantees: SeoRouteCopy;
  };
  /** Homepage sections below the hero (see `home_body_registry.ts`). */
  homeBody: HomeBodyPack;
}

const EN_PACK: StaticLocalePack = {
  homeHero: {
    titlePrefix: "Your agents forget.",
    titleAccent: "Neotoma",
    titleMid: "makes them",
    titleFocus: "remember.",
    withoutSharedMemory: "Without shared memory across your AI tools:",
    bullets: [
      "Context drifts between Claude, Cursor, ChatGPT, and everything else.",
      "Decisions vanish when the session ends.",
      "You become the human sync layer — re-prompting what the agent should already know.",
    ],
    summary:
      "Neotoma stores your {record} as versioned, auditable state — so every agent works from truth.",
    summaryRecordTypes: [
      "contacts",
      "tasks",
      "decisions",
      "conversations",
      "notes",
      "preferences",
      "transactions",
      "meeting notes",
      "companies",
      "health data",
    ],
    ctaEvaluateWithAgent: "Ask your agent to evaluate",
    ctaEvaluateCompact: "Evaluate",
    ctaViewGuarantees: "View guarantees",
    ctaInstall: "Install in 5 minutes",
    ctaMeetCreator: "Meet the creator",
    ctaMeetCreatorCompact: "Meet",
    ctaOfficeHours: "Talk to the founder",
    ctaOfficeHoursSubtext:
      "Building a multi-agent stack? Office hours for developers who want to talk architecture.",
    subcopy:
      "State integrity, not retrieval quality. Versioned, diffable, replayable state across Claude, Cursor, ChatGPT, and everything else.",
    curiosityGap:
      "Most memory tools help agents retrieve information. None of them can prove it hasn\u2019t been silently corrupted.",
    audienceTagline: "Durable memory for agents that persists across sessions and tools",
    heroReinforcement:
      "Your agents pick up where they left off and coordinate across Claude, Cursor, ChatGPT, and everything else. No re-explaining, no lost context, no conflicting answers.",
    heroReinforcementSecondary:
      "Git for agentic knowledge \u2014 every fact is versioned and accumulates over months, so corrections stick, history is preserved, and nothing silently drifts.",
  },
  siteSections: {
    intro: "Intro",
    personalOs: "Proof",
    beforeAfter: "Before / After",
    who: "Who",
    demo: "Demo",
    recordTypes: "Record types",
    guarantees: "Guarantees",
    evaluate: "Evaluate",
    commonQuestions: "Common questions",
    frequentlyAskedQuestions: "Frequently asked questions",
    inspect: "Inspect",
    architecture: "Architecture",
    useCases: "Use cases",
    interfaces: "Interfaces",
    learnMore: "Learn more",
    resources: "Resources",
  },
  memory: {
    vendors: "Vendors",
    representativeProviders: "Representative providers for each memory approach",
    platform: "Platform",
    retrievalRag: "Retrieval / RAG",
    files: "Files",
    database: "Database",
    deterministic: "Deterministic",
    platformShort: "Plat.",
    ragShort: "RAG",
    filesShort: "Files",
    databaseShort: "DB",
    deterministicShort: "Det.",
    onThisPage: "On this page",
    showFewer: "Show fewer",
    showAllGuarantees: (count) => `Show all ${count} guarantees`,
  },
  foundations: {
    title: "Foundations",
    onThisPage: "On this page",
    privacyFirst: "Privacy-first",
    deterministic: "Deterministic",
    immutable: "Immutable and verifiable",
    crossPlatform: "Cross-platform",
  },
  seo: {
    home: {
      title: "Your agents forget. Neotoma makes them remember.",
      description:
        "Stop being the human sync layer. Deterministic, versioned state for multi-agent builders and operators running Claude, Cursor, ChatGPT, and MCP-connected tools. Replay changes, trace provenance, and prove your agents aren\u2019t operating on bad state.",
    },
    docs: {
      title: "Neotoma Documentation | Setup, API, MCP, CLI References",
      description:
        "Documentation for Neotoma: setup, architecture, API references, and operational guides.",
    },
    install: {
      title: "Install | Neotoma",
      description:
        "Install Neotoma in 5 minutes. Agent-assisted and manual install, Docker setup, API server startup, and MCP configuration.",
    },
    foundations: {
      title: "Foundations | Neotoma",
      description:
        "Neotoma's architectural foundations: privacy-first local data with no cloud sync, and cross-platform memory across all AI tools via MCP.",
    },
    memoryGuarantees: {
      title: "Memory Guarantees | Neotoma",
      description:
        "Memory properties that determine reliability under production load: deterministic state evolution, versioned history, replayable timeline, auditable change log, schema constraints, and more.",
    },
  },
  homeBody: HOME_BODY_EN,
};

type LocalePackOverrides = Omit<StaticLocalePack, "memory"> & {
  memory: Omit<StaticLocalePack["memory"], "showAllGuarantees" | "showFewer"> & {
    showFewer: string;
    showAllGuaranteesTemplate: string;
  };
};

const LOCALE_PACKS: Record<string, LocalePackOverrides> = {
  es: {
    homeHero: {
      titlePrefix: "Tus agentes olvidan.",
      titleAccent: "Neotoma",
      titleMid: "los hace",
      titleFocus: "recordar.",
      withoutSharedMemory: "Sin memoria compartida entre tus herramientas de IA:",
      bullets: [
        "El contexto se pierde entre Claude, Cursor, ChatGPT y todo lo demás.",
        "Las decisiones desaparecen cuando termina la sesión.",
        "Tú te conviertes en la capa de sincronización humana — repitiendo lo que el agente ya debería saber.",
      ],
      summary: "Neotoma almacena tus {record} como estado versionado y auditable — para que cada agente trabaje con la verdad.",
      summaryRecordTypes: ["contactos", "tareas", "decisiones", "conversaciones", "notas", "preferencias", "transacciones", "notas de reunión", "empresas", "datos de salud"],
      ctaEvaluateWithAgent: "Pide a tu agente que evalúe",
      ctaEvaluateCompact: "Evaluar",
      ctaViewGuarantees: "Ver garantías",
      ctaInstall: "Instalar en 5 minutos",
      ctaMeetCreator: "Conocer al creador",
      ctaMeetCreatorCompact: "Creador",
      ctaOfficeHours: "Habla con el fundador",
      ctaOfficeHoursSubtext: "¿Construyendo un stack multi-agente? Horario de oficina para desarrolladores que quieran hablar de arquitectura.",
      subcopy: "Neotoma es git para lo que tus agentes saben. Estado versionado, comparable y reproducible entre Claude, Cursor, ChatGPT y todo lo demás. Deja de ser la capa de sincronización humana.",
      curiosityGap: "La mayoría de las herramientas de memoria ayudan a los agentes a recuperar información. Ninguna puede demostrar que no ha sido corrompida silenciosamente.",
      audienceTagline: "Memoria durable para agentes que persiste entre sesiones y herramientas",
      heroReinforcement: "Tus agentes retoman donde lo dejaron y se coordinan entre Claude, Cursor, ChatGPT y todo lo demás. Sin re-explicar, sin contexto perdido, sin respuestas contradictorias.",
      heroReinforcementSecondary: "Git para conocimiento agéntico — cada dato tiene versión y se acumula con el tiempo, las correcciones persisten, el historial se preserva y nada se desvía silenciosamente.",
    },
    siteSections: { intro: "Introducción", personalOs: "Prueba", beforeAfter: "Antes / Después", who: "Quién", demo: "Demo", recordTypes: "Tipos de registro", guarantees: "Garantías", evaluate: "Evaluar", commonQuestions: "Preguntas frecuentes", frequentlyAskedQuestions: "Preguntas frecuentes", inspect: "Inspeccionar", architecture: "Arquitectura", useCases: "Casos de uso", interfaces: "Interfaces", learnMore: "Saber más", resources: "Recursos" },
    memory: { vendors: "Proveedores", representativeProviders: "Proveedores representativos para cada enfoque de memoria", platform: "Plataforma", retrievalRag: "Recuperación / RAG", files: "Archivos", database: "Base de datos", deterministic: "Determinista", platformShort: "Plat.", ragShort: "RAG", filesShort: "Archivos", databaseShort: "BD", deterministicShort: "Det.", onThisPage: "En esta página", showFewer: "Mostrar menos", showAllGuaranteesTemplate: "Mostrar las {count} garantías" },
    foundations: { title: "Fundamentos", onThisPage: "En esta página", privacyFirst: "Privacidad primero", deterministic: "Determinista", immutable: "Inmutable y verificable", crossPlatform: "Multiplataforma" },
    seo: {
      home: { title: "Tus agentes olvidan. Neotoma los hace recordar.", description: "Deja de ser la capa de sincronización humana. Estado determinista y versionado para constructores y operadores multi-agente que usan Claude, Cursor, ChatGPT y herramientas conectadas por MCP." },
      docs: { title: "Documentación de Neotoma | Configuración, API, MCP, CLI", description: "Documentación de Neotoma: configuración, arquitectura, referencias de API y guías operativas." },
      install: { title: "Instalar | Neotoma", description: "Instala Neotoma en 5 minutos. Instalación asistida por agente y manual, configuración Docker, inicio del servidor API y configuración MCP." },
      foundations: { title: "Fundamentos | Neotoma", description: "Fundamentos arquitectónicos de Neotoma: datos locales con privacidad primero sin sincronización en la nube, y memoria multiplataforma para todas las herramientas de IA vía MCP." },
      memoryGuarantees: { title: "Garantías de memoria | Neotoma", description: "Propiedades de memoria que determinan la fiabilidad bajo carga de producción: evolución de estado determinista, historial versionado, línea temporal reproducible, registro de cambios auditable y restricciones de esquema." },
    },
  },
  ca: {
    homeHero: {
      titlePrefix: "Els teus agents obliden.",
      titleAccent: "Neotoma",
      titleMid: "els fa",
      titleFocus: "recordar.",
      withoutSharedMemory: "Sense memòria compartida entre les teves eines d'IA:",
      bullets: [
        "El context es perd entre Claude, Cursor, ChatGPT i tot el reste.",
        "Les decisions desapareixen quan acaba la sessió.",
        "Tu et converteixes en la capa de sincronització humana — repetint el que l'agent ja hauria de saber.",
      ],
      summary: "Neotoma emmagatzema els teus {record} com a estat versionat i auditable — perquè cada agent treballi amb la veritat.",
      summaryRecordTypes: ["contactes", "tasques", "decisions", "converses", "notes", "preferències", "transaccions", "notes de reunió", "empreses", "dades de salut"],
      ctaEvaluateWithAgent: "Demana al teu agent que avaluï",
      ctaEvaluateCompact: "Avaluar",
      ctaViewGuarantees: "Veure garanties",
      ctaInstall: "Instal·lar en 5 minuts",
      ctaMeetCreator: "Conèixer el creador",
      ctaMeetCreatorCompact: "Creador",
      ctaOfficeHours: "Parla amb el fundador",
      ctaOfficeHoursSubtext: "Construint un stack multi-agent? Hores d'oficina per a desenvolupadors que vulguin parlar d'arquitectura.",
      subcopy: "Neotoma és git per al que els teus agents saben. Estat versionat, comparable i reproduïble entre Claude, Cursor, ChatGPT i tot el reste. Deixa de ser la capa de sincronització humana.",
      curiosityGap: "La majoria de les eines de memòria ajuden els agents a recuperar informació. Cap pot demostrar que no ha estat corrompuda silenciosament.",
      audienceTagline: "Memòria durable per a agents que persisteix entre sessions i eines",
      heroReinforcement: "Els teus agents reprenen on ho van deixar i es coordinen entre Claude, Cursor, ChatGPT i tot el reste. Sense re-explicar, sense context perdut, sense respostes contradictòries.",
      heroReinforcementSecondary: "Git per al coneixement agèntic — cada dada té versió i s'acumula amb el temps, les correccions persisteixen, l'historial es preserva i res no es desvia silenciosament.",
    },
    siteSections: { intro: "Introducció", personalOs: "Prova", beforeAfter: "Abans / Després", who: "Qui", demo: "Demo", recordTypes: "Tipus de registre", guarantees: "Garanties", evaluate: "Avaluar", commonQuestions: "Preguntes freqüents", frequentlyAskedQuestions: "Preguntes freqüents", inspect: "Inspeccionar", architecture: "Arquitectura", useCases: "Casos d'ús", interfaces: "Interfícies", learnMore: "Saber-ne més", resources: "Recursos" },
    memory: { vendors: "Proveïdors", representativeProviders: "Proveïdors representatius per a cada enfocament de memòria", platform: "Plataforma", retrievalRag: "Recuperació / RAG", files: "Fitxers", database: "Base de dades", deterministic: "Determinista", platformShort: "Plat.", ragShort: "RAG", filesShort: "Fitxers", databaseShort: "BD", deterministicShort: "Det.", onThisPage: "En aquesta pàgina", showFewer: "Mostrar menys", showAllGuaranteesTemplate: "Mostrar les {count} garanties" },
    foundations: { title: "Fonaments", onThisPage: "En aquesta pàgina", privacyFirst: "Privacitat primer", deterministic: "Determinista", immutable: "Immutable i verificable", crossPlatform: "Multiplataforma" },
    seo: {
      home: { title: "Els teus agents obliden. Neotoma els fa recordar.", description: "Deixa de ser la capa de sincronització humana. Estat determinista i versionat per a constructors i operadors multi-agent que usen Claude, Cursor, ChatGPT i eines connectades per MCP." },
      docs: { title: "Documentació de Neotoma | Configuració, API, MCP, CLI", description: "Documentació de Neotoma: configuració, arquitectura, referències d'API i guies operatives." },
      install: { title: "Instal·lar | Neotoma", description: "Instal·la Neotoma en 5 minuts. Instal·lació assistida per agent i manual, configuració Docker, inici del servidor API i configuració MCP." },
      foundations: { title: "Fonaments | Neotoma", description: "Fonaments arquitectònics de Neotoma: dades locals amb privacitat primer sense sincronització al núvol, i memòria multiplataforma per a totes les eines d'IA via MCP." },
      memoryGuarantees: { title: "Garanties de memòria | Neotoma", description: "Propietats de memòria que determinen la fiabilitat sota càrrega de producció: evolució d'estat determinista, historial versionat, línia temporal reproduïble, registre de canvis auditable i restriccions d'esquema." },
    },
  },
  zh: {
    homeHero: {
      titlePrefix: "你的代理会遗忘。",
      titleAccent: "Neotoma",
      titleMid: "让它们",
      titleFocus: "记住。",
      withoutSharedMemory: "没有跨 AI 工具的共享记忆：",
      bullets: [
        "上下文在 Claude、Cursor、ChatGPT 和其他工具之间漂移。",
        "会话结束后决策就消失了。",
        "你变成了人工同步层——重复告诉代理它本应已知的内容。",
      ],
      summary: "Neotoma 将你的{record}存储为版本化、可审计的状态——让每个代理都基于事实运行。",
      summaryRecordTypes: ["联系人", "任务", "决策", "对话", "笔记", "偏好", "交易", "会议记录", "公司", "健康数据"],
      ctaEvaluateWithAgent: "让你的代理来评估",
      ctaEvaluateCompact: "评估",
      ctaViewGuarantees: "查看保证",
      ctaInstall: "5 分钟安装",
      ctaMeetCreator: "认识创始人",
      ctaMeetCreatorCompact: "创始人",
      ctaOfficeHours: "与创始人交流",
      ctaOfficeHoursSubtext: "正在构建多代理技术栈？为想讨论架构的开发者准备的办公时间。",
      subcopy: "Neotoma 是你的代理知识的 git。跨 Claude、Cursor、ChatGPT 和其他工具的版本化、可比较、可重放的状态。不再做人工同步层。",
      curiosityGap: "大多数记忆工具帮助代理检索信息。没有一个能证明信息没有被悄悄篡改。",
      audienceTagline: "跨会话和工具持久化的代理持久记忆",
      heroReinforcement: "你的代理从中断处继续，并在 Claude、Cursor、ChatGPT 和其他工具之间协调。无需重新解释，没有丢失的上下文，没有矛盾的回答。",
      heroReinforcementSecondary: "代理知识的 Git——每个事实都有版本并随时间积累，修正会持久化，历史被保留，没有任何东西会悄悄偏移。",
    },
    siteSections: { intro: "简介", personalOs: "证明", beforeAfter: "前后对比", who: "用户", demo: "演示", recordTypes: "记录类型", guarantees: "保证", evaluate: "评估", commonQuestions: "常见问题", frequentlyAskedQuestions: "常见问题", inspect: "检查", architecture: "架构", useCases: "使用场景", interfaces: "接口", learnMore: "了解更多", resources: "资源" },
    memory: { vendors: "供应商", representativeProviders: "每种记忆方式的代表性供应商", platform: "平台", retrievalRag: "检索 / RAG", files: "文件", database: "数据库", deterministic: "确定性", platformShort: "平台", ragShort: "RAG", filesShort: "文件", databaseShort: "数据库", deterministicShort: "确定", onThisPage: "本页内容", showFewer: "显示更少", showAllGuaranteesTemplate: "显示全部 {count} 项保证" },
    foundations: { title: "基础", onThisPage: "本页内容", privacyFirst: "隐私优先", deterministic: "确定性", immutable: "不可变且可验证", crossPlatform: "跨平台" },
    seo: {
      home: { title: "你的代理会遗忘。Neotoma 让它们记住。", description: "不再做人工同步层。为运行 Claude、Cursor、ChatGPT 和 MCP 连接工具的多代理构建者和运营者提供确定性、版本化状态。" },
      docs: { title: "Neotoma 文档 | 设置、API、MCP、CLI 参考", description: "Neotoma 文档：设置、架构、API 参考和操作指南。" },
      install: { title: "安装 | Neotoma", description: "5 分钟安装 Neotoma。支持代理辅助和手动安装、Docker 设置、API 服务器启动和 MCP 配置。" },
      foundations: { title: "基础 | Neotoma", description: "Neotoma 的架构基础：隐私优先的本地数据（无云同步），以及通过 MCP 实现的跨平台记忆。" },
      memoryGuarantees: { title: "记忆保证 | Neotoma", description: "决定生产负载下可靠性的记忆属性：确定性状态演化、版本化历史、可重放时间线、可审计变更日志和模式约束。" },
    },
  },
  hi: {
    homeHero: {
      titlePrefix: "आपके एजेंट भूल जाते हैं।",
      titleAccent: "Neotoma",
      titleMid: "उन्हें",
      titleFocus: "याद कराता है।",
      withoutSharedMemory: "आपके AI टूल्स के बीच साझा मेमोरी के बिना:",
      bullets: [
        "Claude, Cursor, ChatGPT और बाकी सब के बीच संदर्भ भटक जाता है।",
        "सत्र समाप्त होने पर निर्णय गायब हो जाते हैं।",
        "आप मानव सिंक लेयर बन जाते हैं — जो एजेंट को पहले से पता होना चाहिए वह दोबारा बताते हैं।",
      ],
      summary: "Neotoma आपके {record} को संस्करणित, ऑडिट योग्य स्थिति के रूप में संग्रहीत करता है — ताकि हर एजेंट सत्य पर काम करे।",
      summaryRecordTypes: ["संपर्क", "कार्य", "निर्णय", "वार्तालाप", "नोट्स", "प्राथमिकताएं", "लेनदेन", "बैठक नोट्स", "कंपनियां", "स्वास्थ्य डेटा"],
      ctaEvaluateWithAgent: "अपने एजेंट से मूल्यांकन कराएं",
      ctaEvaluateCompact: "मूल्यांकन",
      ctaViewGuarantees: "गारंटी देखें",
      ctaInstall: "5 मिनट में इंस्टॉल करें",
      ctaMeetCreator: "निर्माता से मिलें",
      ctaMeetCreatorCompact: "निर्माता",
      ctaOfficeHours: "संस्थापक से बात करें",
      ctaOfficeHoursSubtext: "मल्टी-एजेंट स्टैक बना रहे हैं? आर्किटेक्चर पर बात करने वाले डेवलपर्स के लिए ऑफिस आवर्स।",
      subcopy: "Neotoma आपके एजेंट्स के ज्ञान का git है। Claude, Cursor, ChatGPT और बाकी सब में संस्करणित, तुलनीय, पुनरावर्तनीय स्थिति। मानव सिंक लेयर बनना बंद करें।",
      curiosityGap: "अधिकांश मेमोरी टूल एजेंट्स को जानकारी पुनर्प्राप्त करने में मदद करते हैं। कोई भी यह साबित नहीं कर सकता कि इसे चुपचाप दूषित नहीं किया गया है।",
      audienceTagline: "सत्रों और टूल्स में बनी रहने वाली टिकाऊ एजेंट मेमोरी",
      heroReinforcement: "आपके एजेंट वहीं से शुरू करते हैं जहां उन्होंने छोड़ा था और Claude, Cursor, ChatGPT और बाकी सब में समन्वय करते हैं। कोई दोबारा समझाना नहीं, कोई खोया संदर्भ नहीं, कोई विरोधाभासी उत्तर नहीं।",
      heroReinforcementSecondary: "एजेंटिक ज्ञान का Git — हर तथ्य संस्करणित है और महीनों में जमा होता है, सुधार टिकते हैं, इतिहास संरक्षित रहता है, और कुछ भी चुपचाप नहीं भटकता।",
    },
    siteSections: { intro: "परिचय", personalOs: "प्रमाण", beforeAfter: "पहले / बाद", who: "कौन", demo: "डेमो", recordTypes: "रिकॉर्ड प्रकार", guarantees: "गारंटी", evaluate: "मूल्यांकन", commonQuestions: "सामान्य प्रश्न", frequentlyAskedQuestions: "अक्सर पूछे जाने वाले प्रश्न", inspect: "निरीक्षण", architecture: "आर्किटेक्चर", useCases: "उपयोग के मामले", interfaces: "इंटरफेस", learnMore: "और जानें", resources: "संसाधन" },
    memory: { vendors: "विक्रेता", representativeProviders: "प्रत्येक मेमोरी दृष्टिकोण के प्रतिनिधि प्रदाता", platform: "प्लेटफ़ॉर्म", retrievalRag: "रिट्रीवल / RAG", files: "फ़ाइलें", database: "डेटाबेस", deterministic: "नियतात्मक", platformShort: "प्लेट.", ragShort: "RAG", filesShort: "फ़ाइलें", databaseShort: "DB", deterministicShort: "नियत.", onThisPage: "इस पृष्ठ पर", showFewer: "कम दिखाएं", showAllGuaranteesTemplate: "सभी {count} गारंटी दिखाएं" },
    foundations: { title: "आधार", onThisPage: "इस पृष्ठ पर", privacyFirst: "गोपनीयता-प्रथम", deterministic: "नियतात्मक", immutable: "अपरिवर्तनीय और सत्यापन योग्य", crossPlatform: "क्रॉस-प्लेटफ़ॉर्म" },
    seo: {
      home: { title: "आपके एजेंट भूल जाते हैं। Neotoma उन्हें याद कराता है।", description: "मानव सिंक लेयर बनना बंद करें। Claude, Cursor, ChatGPT, और MCP-कनेक्टेड टूल्स चलाने वाले मल्टी-एजेंट बिल्डर्स और ऑपरेटर्स के लिए नियतात्मक, संस्करणित स्थिति।" },
      docs: { title: "Neotoma दस्तावेज़ | सेटअप, API, MCP, CLI संदर्भ", description: "Neotoma दस्तावेज़: सेटअप, आर्किटेक्चर, API संदर्भ और परिचालन गाइड।" },
      install: { title: "इंस्टॉल | Neotoma", description: "5 मिनट में Neotoma इंस्टॉल करें। एजेंट-सहायता और मैनुअल इंस्टॉल, Docker सेटअप, API सर्वर स्टार्टअप और MCP कॉन्फ़िगरेशन।" },
      foundations: { title: "आधार | Neotoma", description: "Neotoma के आर्किटेक्चरल आधार: बिना क्लाउड सिंक के गोपनीयता-प्रथम स्थानीय डेटा, और MCP के माध्यम से सभी AI टूल्स में क्रॉस-प्लेटफ़ॉर्म मेमोरी।" },
      memoryGuarantees: { title: "मेमोरी गारंटी | Neotoma", description: "उत्पादन भार के तहत विश्वसनीयता निर्धारित करने वाली मेमोरी गुण: नियतात्मक स्थिति विकास, संस्करणित इतिहास, पुनरावर्तनीय समयरेखा, ऑडिट योग्य परिवर्तन लॉग और स्कीमा बाधाएं।" },
    },
  },
  ar: {
    homeHero: {
      titlePrefix: "وكلاؤك ينسون.",
      titleAccent: "Neotoma",
      titleMid: "يجعلهم",
      titleFocus: "يتذكرون.",
      withoutSharedMemory: "بدون ذاكرة مشتركة عبر أدوات الذكاء الاصطناعي:",
      bullets: [
        "السياق يتبدد بين Claude وCursor وChatGPT وكل شيء آخر.",
        "القرارات تختفي عند انتهاء الجلسة.",
        "أنت تصبح طبقة المزامنة البشرية — تعيد شرح ما يجب أن يعرفه الوكيل بالفعل.",
      ],
      summary: "يخزن Neotoma سجلات {record} كحالة مُصدَّرة وقابلة للتدقيق — ليعمل كل وكيل انطلاقاً من الحقيقة.",
      summaryRecordTypes: ["جهات الاتصال", "المهام", "القرارات", "المحادثات", "الملاحظات", "التفضيلات", "المعاملات", "ملاحظات الاجتماعات", "الشركات", "البيانات الصحية"],
      ctaEvaluateWithAgent: "اطلب من وكيلك التقييم",
      ctaEvaluateCompact: "تقييم",
      ctaViewGuarantees: "عرض الضمانات",
      ctaInstall: "التثبيت في 5 دقائق",
      ctaMeetCreator: "تعرّف على المبتكر",
      ctaMeetCreatorCompact: "المبتكر",
      ctaOfficeHours: "تحدث مع المؤسس",
      ctaOfficeHoursSubtext: "هل تبني مكدس متعدد الوكلاء؟ ساعات مكتبية للمطورين الذين يريدون مناقشة الهندسة المعمارية.",
      subcopy: "Neotoma هو git لما يعرفه وكلاؤك. حالة مُصدَّرة وقابلة للمقارنة وإعادة التشغيل عبر Claude وCursor وChatGPT وكل شيء آخر. توقف عن كونك طبقة المزامنة البشرية.",
      curiosityGap: "معظم أدوات الذاكرة تساعد الوكلاء على استرجاع المعلومات. لا يمكن لأي منها إثبات أنها لم تُفسد بصمت.",
      audienceTagline: "ذاكرة دائمة للوكلاء تستمر عبر الجلسات والأدوات",
      heroReinforcement: "يستأنف وكلاؤك من حيث توقفوا وينسقون عبر Claude وCursor وChatGPT وكل شيء آخر. بلا إعادة شرح، بلا سياق مفقود، بلا إجابات متناقضة.",
      heroReinforcementSecondary: "Git للمعرفة الوكيلية — كل حقيقة مُصدَّرة وتتراكم عبر الأشهر، التصحيحات تثبت، التاريخ يُحفظ، ولا شيء ينحرف بصمت.",
    },
    siteSections: { intro: "مقدمة", personalOs: "إثبات", beforeAfter: "قبل / بعد", who: "من", demo: "عرض", recordTypes: "أنواع السجلات", guarantees: "الضمانات", evaluate: "تقييم", commonQuestions: "أسئلة شائعة", frequentlyAskedQuestions: "الأسئلة المتكررة", inspect: "فحص", architecture: "البنية", useCases: "حالات الاستخدام", interfaces: "الواجهات", learnMore: "اعرف المزيد", resources: "الموارد" },
    memory: { vendors: "الموردون", representativeProviders: "مزودون ممثلون لكل نهج ذاكرة", platform: "المنصة", retrievalRag: "الاسترجاع / RAG", files: "الملفات", database: "قاعدة البيانات", deterministic: "حتمي", platformShort: "منصة", ragShort: "RAG", filesShort: "ملفات", databaseShort: "ق.ب", deterministicShort: "حتمي", onThisPage: "في هذه الصفحة", showFewer: "عرض أقل", showAllGuaranteesTemplate: "عرض جميع الضمانات ({count})" },
    foundations: { title: "الأساسيات", onThisPage: "في هذه الصفحة", privacyFirst: "الخصوصية أولاً", deterministic: "حتمي", immutable: "غير قابل للتغيير وقابل للتحقق", crossPlatform: "متعدد المنصات" },
    seo: {
      home: { title: "وكلاؤك ينسون. Neotoma يجعلهم يتذكرون.", description: "توقف عن كونك طبقة المزامنة البشرية. حالة حتمية ومُصدَّرة لبناة ومشغلي الوكلاء المتعددين الذين يستخدمون Claude وCursor وChatGPT وأدوات MCP." },
      docs: { title: "وثائق Neotoma | الإعداد وAPI وMCP وCLI", description: "وثائق Neotoma: الإعداد والبنية ومراجع API والأدلة التشغيلية." },
      install: { title: "تثبيت | Neotoma", description: "ثبت Neotoma في 5 دقائق. تثبيت بمساعدة الوكيل ويدوي، إعداد Docker، تشغيل خادم API وتكوين MCP." },
      foundations: { title: "الأساسيات | Neotoma", description: "الأساسيات المعمارية لـ Neotoma: بيانات محلية بالخصوصية أولاً بدون مزامنة سحابية، وذاكرة متعددة المنصات عبر MCP." },
      memoryGuarantees: { title: "ضمانات الذاكرة | Neotoma", description: "خصائص الذاكرة التي تحدد الموثوقية تحت حمل الإنتاج: تطور حالة حتمي، تاريخ مُصدَّر، خط زمني قابل لإعادة التشغيل، سجل تغييرات قابل للتدقيق وقيود المخطط." },
    },
  },
  fr: {
    homeHero: {
      titlePrefix: "Vos agents oublient.",
      titleAccent: "Neotoma",
      titleMid: "leur fait",
      titleFocus: "se souvenir.",
      withoutSharedMemory: "Sans mémoire partagée entre vos outils d'IA :",
      bullets: [
        "Le contexte dérive entre Claude, Cursor, ChatGPT et tout le reste.",
        "Les décisions disparaissent quand la session se termine.",
        "Vous devenez la couche de synchronisation humaine — répétant ce que l'agent devrait déjà savoir.",
      ],
      summary: "Neotoma stocke vos {record} comme état versionné et auditable — pour que chaque agent travaille à partir de la vérité.",
      summaryRecordTypes: ["contacts", "tâches", "décisions", "conversations", "notes", "préférences", "transactions", "notes de réunion", "entreprises", "données de santé"],
      ctaEvaluateWithAgent: "Demandez à votre agent d'évaluer",
      ctaEvaluateCompact: "Évaluer",
      ctaViewGuarantees: "Voir les garanties",
      ctaInstall: "Installer en 5 minutes",
      ctaMeetCreator: "Rencontrer le créateur",
      ctaMeetCreatorCompact: "Créateur",
      ctaOfficeHours: "Parlez au fondateur",
      ctaOfficeHoursSubtext: "Vous construisez une stack multi-agent ? Heures de bureau pour les développeurs qui veulent parler architecture.",
      subcopy: "Neotoma est le git de ce que vos agents savent. État versionné, comparable et rejouable entre Claude, Cursor, ChatGPT et tout le reste. Cessez d'être la couche de synchronisation humaine.",
      curiosityGap: "La plupart des outils de mémoire aident les agents à récupérer des informations. Aucun ne peut prouver qu'elles n'ont pas été silencieusement corrompues.",
      audienceTagline: "Mémoire durable pour les agents qui persiste entre sessions et outils",
      heroReinforcement: "Vos agents reprennent là où ils se sont arrêtés et se coordonnent entre Claude, Cursor, ChatGPT et tout le reste. Sans ré-expliquer, sans contexte perdu, sans réponses contradictoires.",
      heroReinforcementSecondary: "Git pour la connaissance agentique — chaque fait est versionné et s'accumule au fil des mois, les corrections persistent, l'historique est préservé et rien ne dérive silencieusement.",
    },
    siteSections: { intro: "Introduction", personalOs: "Preuve", beforeAfter: "Avant / Après", who: "Qui", demo: "Démo", recordTypes: "Types d'enregistrement", guarantees: "Garanties", evaluate: "Évaluer", commonQuestions: "Questions fréquentes", frequentlyAskedQuestions: "Questions fréquemment posées", inspect: "Inspecter", architecture: "Architecture", useCases: "Cas d'utilisation", interfaces: "Interfaces", learnMore: "En savoir plus", resources: "Ressources" },
    memory: { vendors: "Fournisseurs", representativeProviders: "Fournisseurs représentatifs pour chaque approche mémoire", platform: "Plateforme", retrievalRag: "Récupération / RAG", files: "Fichiers", database: "Base de données", deterministic: "Déterministe", platformShort: "Plat.", ragShort: "RAG", filesShort: "Fichiers", databaseShort: "BD", deterministicShort: "Dét.", onThisPage: "Sur cette page", showFewer: "Afficher moins", showAllGuaranteesTemplate: "Afficher les {count} garanties" },
    foundations: { title: "Fondations", onThisPage: "Sur cette page", privacyFirst: "Confidentialité d'abord", deterministic: "Déterministe", immutable: "Immuable et vérifiable", crossPlatform: "Multiplateforme" },
    seo: {
      home: { title: "Vos agents oublient. Neotoma leur fait se souvenir.", description: "Cessez d'être la couche de synchronisation humaine. État déterministe et versionné pour les constructeurs et opérateurs multi-agents utilisant Claude, Cursor, ChatGPT et les outils connectés MCP." },
      docs: { title: "Documentation Neotoma | Configuration, API, MCP, CLI", description: "Documentation Neotoma : configuration, architecture, références API et guides opérationnels." },
      install: { title: "Installer | Neotoma", description: "Installez Neotoma en 5 minutes. Installation assistée par agent et manuelle, configuration Docker, démarrage du serveur API et configuration MCP." },
      foundations: { title: "Fondations | Neotoma", description: "Fondations architecturales de Neotoma : données locales confidentialité d'abord sans synchronisation cloud, et mémoire multiplateforme via MCP." },
      memoryGuarantees: { title: "Garanties mémoire | Neotoma", description: "Propriétés mémoire déterminant la fiabilité en production : évolution d'état déterministe, historique versionné, chronologie rejouable, journal de modifications auditable et contraintes de schéma." },
    },
  },
  pt: {
    homeHero: {
      titlePrefix: "Seus agentes esquecem.",
      titleAccent: "Neotoma",
      titleMid: "os faz",
      titleFocus: "lembrar.",
      withoutSharedMemory: "Sem memória compartilhada entre suas ferramentas de IA:",
      bullets: [
        "O contexto se perde entre Claude, Cursor, ChatGPT e todo o resto.",
        "Decisões desaparecem quando a sessão termina.",
        "Você se torna a camada de sincronização humana — repetindo o que o agente já deveria saber.",
      ],
      summary: "Neotoma armazena seus {record} como estado versionado e auditável — para que cada agente trabalhe com a verdade.",
      summaryRecordTypes: ["contatos", "tarefas", "decisões", "conversas", "notas", "preferências", "transações", "notas de reunião", "empresas", "dados de saúde"],
      ctaEvaluateWithAgent: "Peça ao seu agente para avaliar",
      ctaEvaluateCompact: "Avaliar",
      ctaViewGuarantees: "Ver garantias",
      ctaInstall: "Instalar em 5 minutos",
      ctaMeetCreator: "Conhecer o criador",
      ctaMeetCreatorCompact: "Criador",
      ctaOfficeHours: "Fale com o fundador",
      ctaOfficeHoursSubtext: "Construindo um stack multi-agente? Horário de atendimento para desenvolvedores que querem falar sobre arquitetura.",
      subcopy: "Neotoma é o git do que seus agentes sabem. Estado versionado, comparável e reproduzível entre Claude, Cursor, ChatGPT e todo o resto. Pare de ser a camada de sincronização humana.",
      curiosityGap: "A maioria das ferramentas de memória ajuda agentes a recuperar informações. Nenhuma consegue provar que elas não foram silenciosamente corrompidas.",
      audienceTagline: "Memória durável para agentes que persiste entre sessões e ferramentas",
      heroReinforcement: "Seus agentes retomam de onde pararam e se coordenam entre Claude, Cursor, ChatGPT e todo o resto. Sem re-explicar, sem contexto perdido, sem respostas contraditórias.",
      heroReinforcementSecondary: "Git para conhecimento agêntico — cada fato é versionado e se acumula ao longo dos meses, correções persistem, o histórico é preservado e nada se desvia silenciosamente.",
    },
    siteSections: { intro: "Introdução", personalOs: "Prova", beforeAfter: "Antes / Depois", who: "Quem", demo: "Demo", recordTypes: "Tipos de registro", guarantees: "Garantias", evaluate: "Avaliar", commonQuestions: "Perguntas frequentes", frequentlyAskedQuestions: "Perguntas frequentes", inspect: "Inspecionar", architecture: "Arquitetura", useCases: "Casos de uso", interfaces: "Interfaces", learnMore: "Saiba mais", resources: "Recursos" },
    memory: { vendors: "Fornecedores", representativeProviders: "Fornecedores representativos para cada abordagem de memória", platform: "Plataforma", retrievalRag: "Recuperação / RAG", files: "Arquivos", database: "Banco de dados", deterministic: "Determinístico", platformShort: "Plat.", ragShort: "RAG", filesShort: "Arquivos", databaseShort: "BD", deterministicShort: "Det.", onThisPage: "Nesta página", showFewer: "Mostrar menos", showAllGuaranteesTemplate: "Mostrar todas as {count} garantias" },
    foundations: { title: "Fundamentos", onThisPage: "Nesta página", privacyFirst: "Privacidade primeiro", deterministic: "Determinístico", immutable: "Imutável e verificável", crossPlatform: "Multiplataforma" },
    seo: {
      home: { title: "Seus agentes esquecem. Neotoma os faz lembrar.", description: "Pare de ser a camada de sincronização humana. Estado determinístico e versionado para construtores e operadores multi-agente que usam Claude, Cursor, ChatGPT e ferramentas conectadas por MCP." },
      docs: { title: "Documentação Neotoma | Configuração, API, MCP, CLI", description: "Documentação do Neotoma: configuração, arquitetura, referências de API e guias operacionais." },
      install: { title: "Instalar | Neotoma", description: "Instale o Neotoma em 5 minutos. Instalação assistida por agente e manual, configuração Docker, inicialização do servidor API e configuração MCP." },
      foundations: { title: "Fundamentos | Neotoma", description: "Fundamentos arquitetônicos do Neotoma: dados locais com privacidade primeiro sem sincronização na nuvem, e memória multiplataforma via MCP." },
      memoryGuarantees: { title: "Garantias de memória | Neotoma", description: "Propriedades de memória que determinam a confiabilidade sob carga de produção: evolução de estado determinística, histórico versionado, linha do tempo reproduzível, log de alterações auditável e restrições de esquema." },
    },
  },
  ru: {
    homeHero: {
      titlePrefix: "Ваши агенты забывают.",
      titleAccent: "Neotoma",
      titleMid: "заставляет их",
      titleFocus: "помнить.",
      withoutSharedMemory: "Без общей памяти между вашими ИИ-инструментами:",
      bullets: [
        "Контекст теряется между Claude, Cursor, ChatGPT и всем остальным.",
        "Решения исчезают, когда сессия заканчивается.",
        "Вы становитесь человеческим слоем синхронизации — повторяя то, что агент уже должен знать.",
      ],
      summary: "Neotoma хранит ваши {record} как версионированное, аудируемое состояние — чтобы каждый агент работал с истиной.",
      summaryRecordTypes: ["контакты", "задачи", "решения", "разговоры", "заметки", "настройки", "транзакции", "заметки с встреч", "компании", "данные о здоровье"],
      ctaEvaluateWithAgent: "Попросите агента оценить",
      ctaEvaluateCompact: "Оценить",
      ctaViewGuarantees: "Посмотреть гарантии",
      ctaInstall: "Установить за 5 минут",
      ctaMeetCreator: "Познакомиться с создателем",
      ctaMeetCreatorCompact: "Создатель",
      ctaOfficeHours: "Поговорите с основателем",
      ctaOfficeHoursSubtext: "Строите мультиагентный стек? Часы приёма для разработчиков, которые хотят обсудить архитектуру.",
      subcopy: "Neotoma — это git для знаний ваших агентов. Версионированное, сравниваемое, воспроизводимое состояние между Claude, Cursor, ChatGPT и всем остальным. Перестаньте быть человеческим слоем синхронизации.",
      curiosityGap: "Большинство инструментов памяти помогают агентам извлекать информацию. Ни один не может доказать, что она не была незаметно повреждена.",
      audienceTagline: "Долговременная память для агентов, сохраняющаяся между сессиями и инструментами",
      heroReinforcement: "Ваши агенты продолжают с того места, где остановились, и координируются между Claude, Cursor, ChatGPT и всем остальным. Без повторных объяснений, без потерянного контекста, без противоречивых ответов.",
      heroReinforcementSecondary: "Git для агентных знаний — каждый факт версионирован и накапливается месяцами, исправления сохраняются, история хранится, и ничто не отклоняется незаметно.",
    },
    siteSections: { intro: "Введение", personalOs: "Доказательство", beforeAfter: "До / После", who: "Кто", demo: "Демо", recordTypes: "Типы записей", guarantees: "Гарантии", evaluate: "Оценить", commonQuestions: "Частые вопросы", frequentlyAskedQuestions: "Часто задаваемые вопросы", inspect: "Инспектировать", architecture: "Архитектура", useCases: "Примеры использования", interfaces: "Интерфейсы", learnMore: "Узнать больше", resources: "Ресурсы" },
    memory: { vendors: "Поставщики", representativeProviders: "Репрезентативные поставщики для каждого подхода к памяти", platform: "Платформа", retrievalRag: "Извлечение / RAG", files: "Файлы", database: "База данных", deterministic: "Детерминированная", platformShort: "Плат.", ragShort: "RAG", filesShort: "Файлы", databaseShort: "БД", deterministicShort: "Дет.", onThisPage: "На этой странице", showFewer: "Показать меньше", showAllGuaranteesTemplate: "Показать все {count} гарантий" },
    foundations: { title: "Основы", onThisPage: "На этой странице", privacyFirst: "Конфиденциальность прежде всего", deterministic: "Детерминированность", immutable: "Неизменяемое и проверяемое", crossPlatform: "Кроссплатформенность" },
    seo: {
      home: { title: "Ваши агенты забывают. Neotoma заставляет их помнить.", description: "Перестаньте быть человеческим слоем синхронизации. Детерминированное, версионированное состояние для мультиагентных разработчиков и операторов, использующих Claude, Cursor, ChatGPT и MCP-инструменты." },
      docs: { title: "Документация Neotoma | Настройка, API, MCP, CLI", description: "Документация Neotoma: настройка, архитектура, справка по API и операционные руководства." },
      install: { title: "Установка | Neotoma", description: "Установите Neotoma за 5 минут. Установка с помощью агента и вручную, настройка Docker, запуск API-сервера и конфигурация MCP." },
      foundations: { title: "Основы | Neotoma", description: "Архитектурные основы Neotoma: локальные данные с приоритетом конфиденциальности без облачной синхронизации и кроссплатформенная память через MCP." },
      memoryGuarantees: { title: "Гарантии памяти | Neotoma", description: "Свойства памяти, определяющие надёжность при производственной нагрузке: детерминированная эволюция состояния, версионированная история, воспроизводимая временная шкала, аудируемый журнал изменений и ограничения схемы." },
    },
  },
  bn: {
    homeHero: {
      titlePrefix: "আপনার এজেন্টরা ভুলে যায়।",
      titleAccent: "Neotoma",
      titleMid: "তাদের",
      titleFocus: "মনে করায়।",
      withoutSharedMemory: "আপনার AI টুলগুলোর মধ্যে শেয়ার্ড মেমোরি ছাড়া:",
      bullets: [
        "Claude, Cursor, ChatGPT এবং বাকি সবের মধ্যে প্রসঙ্গ হারিয়ে যায়।",
        "সেশন শেষ হলে সিদ্ধান্তগুলো অদৃশ্য হয়ে যায়।",
        "আপনি মানব সিঙ্ক লেয়ার হয়ে যান — এজেন্টের যা জানা উচিত তা আবার বলেন।",
      ],
      summary: "Neotoma আপনার {record} সংস্করণযুক্ত, নিরীক্ষাযোগ্য অবস্থা হিসেবে সংরক্ষণ করে — যাতে প্রতিটি এজেন্ট সত্যের ভিত্তিতে কাজ করে।",
      summaryRecordTypes: ["পরিচিতি", "কাজ", "সিদ্ধান্ত", "কথোপকথন", "নোট", "পছন্দ", "লেনদেন", "মিটিং নোট", "কোম্পানি", "স্বাস্থ্য ডেটা"],
      ctaEvaluateWithAgent: "আপনার এজেন্টকে মূল্যায়ন করতে বলুন",
      ctaEvaluateCompact: "মূল্যায়ন",
      ctaViewGuarantees: "গ্যারান্টি দেখুন",
      ctaInstall: "৫ মিনিটে ইনস্টল করুন",
      ctaMeetCreator: "স্রষ্টার সাথে দেখা করুন",
      ctaMeetCreatorCompact: "স্রষ্টা",
      ctaOfficeHours: "প্রতিষ্ঠাতার সাথে কথা বলুন",
      ctaOfficeHoursSubtext: "মাল্টি-এজেন্ট স্ট্যাক তৈরি করছেন? আর্কিটেকচার নিয়ে কথা বলতে চান এমন ডেভেলপারদের জন্য অফিস আওয়ার্স।",
      subcopy: "Neotoma হলো আপনার এজেন্টদের জ্ঞানের git। Claude, Cursor, ChatGPT এবং বাকি সবের মধ্যে সংস্করণযুক্ত, তুলনাযোগ্য, পুনরায় চালানোর যোগ্য অবস্থা। মানব সিঙ্ক লেয়ার হওয়া বন্ধ করুন।",
      curiosityGap: "বেশিরভাগ মেমোরি টুল এজেন্টদের তথ্য পুনরুদ্ধার করতে সাহায্য করে। কোনোটিই প্রমাণ করতে পারে না যে এটি নীরবে দূষিত হয়নি।",
      audienceTagline: "সেশন এবং টুল জুড়ে স্থায়ী এজেন্ট মেমোরি",
      heroReinforcement: "আপনার এজেন্টরা যেখানে থেমেছিল সেখান থেকে শুরু করে এবং Claude, Cursor, ChatGPT এবং বাকি সবের মধ্যে সমন্বয় করে। পুনরায় ব্যাখ্যা নেই, হারানো প্রসঙ্গ নেই, বিরোধপূর্ণ উত্তর নেই।",
      heroReinforcementSecondary: "এজেন্টিক জ্ঞানের Git — প্রতিটি তথ্য সংস্করণযুক্ত এবং মাসের পর মাস জমা হয়, সংশোধন স্থায়ী হয়, ইতিহাস সংরক্ষিত থাকে, এবং কিছুই নীরবে বিচ্যুত হয় না।",
    },
    siteSections: { intro: "ভূমিকা", personalOs: "প্রমাণ", beforeAfter: "আগে / পরে", who: "কে", demo: "ডেমো", recordTypes: "রেকর্ড প্রকার", guarantees: "গ্যারান্টি", evaluate: "মূল্যায়ন", commonQuestions: "সাধারণ প্রশ্ন", frequentlyAskedQuestions: "প্রায়শই জিজ্ঞাসিত প্রশ্ন", inspect: "পরিদর্শন", architecture: "আর্কিটেকচার", useCases: "ব্যবহারের ক্ষেত্র", interfaces: "ইন্টারফেস", learnMore: "আরও জানুন", resources: "সম্পদ" },
    memory: { vendors: "বিক্রেতা", representativeProviders: "প্রতিটি মেমোরি পদ্ধতির প্রতিনিধি প্রদানকারী", platform: "প্ল্যাটফর্ম", retrievalRag: "পুনরুদ্ধার / RAG", files: "ফাইল", database: "ডেটাবেস", deterministic: "নির্ণায়ক", platformShort: "প্ল্যাট.", ragShort: "RAG", filesShort: "ফাইল", databaseShort: "DB", deterministicShort: "নির্ণা.", onThisPage: "এই পৃষ্ঠায়", showFewer: "কম দেখুন", showAllGuaranteesTemplate: "সমস্ত {count}টি গ্যারান্টি দেখুন" },
    foundations: { title: "ভিত্তি", onThisPage: "এই পৃষ্ঠায়", privacyFirst: "গোপনীয়তা-প্রথম", deterministic: "নির্ণায়ক", immutable: "অপরিবর্তনীয় ও যাচাইযোগ্য", crossPlatform: "ক্রস-প্ল্যাটফর্ম" },
    seo: {
      home: { title: "আপনার এজেন্টরা ভুলে যায়। Neotoma তাদের মনে করায়।", description: "মানব সিঙ্ক লেয়ার হওয়া বন্ধ করুন। Claude, Cursor, ChatGPT এবং MCP-সংযুক্ত টুল ব্যবহারকারী মাল্টি-এজেন্ট নির্মাতা ও পরিচালকদের জন্য নির্ণায়ক, সংস্করণযুক্ত অবস্থা।" },
      docs: { title: "Neotoma ডকুমেন্টেশন | সেটআপ, API, MCP, CLI রেফারেন্স", description: "Neotoma ডকুমেন্টেশন: সেটআপ, আর্কিটেকচার, API রেফারেন্স এবং পরিচালন নির্দেশিকা।" },
      install: { title: "ইনস্টল | Neotoma", description: "৫ মিনিটে Neotoma ইনস্টল করুন। এজেন্ট-সহায়তা ও ম্যানুয়াল ইনস্টল, Docker সেটআপ, API সার্ভার স্টার্টআপ এবং MCP কনফিগারেশন।" },
      foundations: { title: "ভিত্তি | Neotoma", description: "Neotoma-এর আর্কিটেকচারাল ভিত্তি: ক্লাউড সিঙ্ক ছাড়া গোপনীয়তা-প্রথম স্থানীয় ডেটা, এবং MCP-এর মাধ্যমে সমস্ত AI টুলে ক্রস-প্ল্যাটফর্ম মেমোরি।" },
      memoryGuarantees: { title: "মেমোরি গ্যারান্টি | Neotoma", description: "উৎপাদন লোডের অধীনে নির্ভরযোগ্যতা নির্ধারণকারী মেমোরি বৈশিষ্ট্য: নির্ণায়ক অবস্থা বিবর্তন, সংস্করণযুক্ত ইতিহাস, পুনরায় চালানোর যোগ্য টাইমলাইন, নিরীক্ষাযোগ্য পরিবর্তন লগ এবং স্কিমা সীমাবদ্ধতা।" },
    },
  },
  ur: {
    homeHero: {
      titlePrefix: "آپ کے ایجنٹ بھول جاتے ہیں۔",
      titleAccent: "Neotoma",
      titleMid: "انہیں",
      titleFocus: "یاد کراتا ہے۔",
      withoutSharedMemory: "آپ کے AI ٹولز میں مشترکہ میموری کے بغیر:",
      bullets: [
        "Claude، Cursor، ChatGPT اور باقی سب کے درمیان سیاق و سباق بھٹک جاتا ہے۔",
        "سیشن ختم ہونے پر فیصلے غائب ہو جاتے ہیں۔",
        "آپ انسانی مطابقت پذیری کی تہہ بن جاتے ہیں — جو ایجنٹ کو پہلے سے معلوم ہونا چاہیے وہ دوبارہ بتاتے ہیں۔",
      ],
      summary: "Neotoma آپ کے {record} کو ورژن شدہ، قابل آڈٹ حالت کے طور پر محفوظ کرتا ہے — تاکہ ہر ایجنٹ حقیقت پر کام کرے۔",
      summaryRecordTypes: ["رابطے", "کام", "فیصلے", "بات چیت", "نوٹس", "ترجیحات", "لین دین", "میٹنگ نوٹس", "کمپنیاں", "صحت کا ڈیٹا"],
      ctaEvaluateWithAgent: "اپنے ایجنٹ سے جائزہ لینے کو کہیں",
      ctaEvaluateCompact: "جائزہ",
      ctaViewGuarantees: "ضمانتیں دیکھیں",
      ctaInstall: "5 منٹ میں انسٹال کریں",
      ctaMeetCreator: "تخلیق کار سے ملیں",
      ctaMeetCreatorCompact: "تخلیق کار",
      ctaOfficeHours: "بانی سے بات کریں",
      ctaOfficeHoursSubtext: "ملٹی ایجنٹ اسٹیک بنا رہے ہیں؟ آرکیٹیکچر پر بات کرنے والے ڈیولپرز کے لیے آفس اوقات۔",
      subcopy: "Neotoma آپ کے ایجنٹوں کے علم کا git ہے۔ Claude، Cursor، ChatGPT اور باقی سب میں ورژن شدہ، قابل موازنہ، دوبارہ چلانے کے قابل حالت۔ انسانی مطابقت پذیری کی تہہ بننا بند کریں۔",
      curiosityGap: "زیادہ تر میموری ٹولز ایجنٹوں کو معلومات بازیافت کرنے میں مدد کرتے ہیں۔ کوئی بھی ثابت نہیں کر سکتا کہ یہ خاموشی سے خراب نہیں ہوئی۔",
      audienceTagline: "سیشنز اور ٹولز میں برقرار رہنے والی پائیدار ایجنٹ میموری",
      heroReinforcement: "آپ کے ایجنٹ وہیں سے شروع کرتے ہیں جہاں انہوں نے چھوڑا تھا اور Claude، Cursor، ChatGPT اور باقی سب میں ہم آہنگی کرتے ہیں۔ دوبارہ سمجھانا نہیں، کھویا ہوا سیاق و سباق نہیں، متضاد جوابات نہیں۔",
      heroReinforcementSecondary: "ایجنٹ علم کا Git — ہر حقیقت ورژن شدہ ہے اور مہینوں میں جمع ہوتی ہے، اصلاحات قائم رہتی ہیں، تاریخ محفوظ رہتی ہے، اور کچھ بھی خاموشی سے نہیں بھٹکتا۔",
    },
    siteSections: { intro: "تعارف", personalOs: "ثبوت", beforeAfter: "پہلے / بعد", who: "کون", demo: "ڈیمو", recordTypes: "ریکارڈ کی اقسام", guarantees: "ضمانتیں", evaluate: "جائزہ", commonQuestions: "عام سوالات", frequentlyAskedQuestions: "اکثر پوچھے جانے والے سوالات", inspect: "معائنہ", architecture: "آرکیٹیکچر", useCases: "استعمال کے معاملات", interfaces: "انٹرفیسز", learnMore: "مزید جانیں", resources: "وسائل" },
    memory: { vendors: "فراہم کنندگان", representativeProviders: "ہر میموری نقطہ نظر کے نمائندہ فراہم کنندگان", platform: "پلیٹ فارم", retrievalRag: "بازیافت / RAG", files: "فائلیں", database: "ڈیٹا بیس", deterministic: "فیصلہ کن", platformShort: "پلیٹ.", ragShort: "RAG", filesShort: "فائلیں", databaseShort: "DB", deterministicShort: "فیص.", onThisPage: "اس صفحے پر", showFewer: "کم دکھائیں", showAllGuaranteesTemplate: "تمام {count} ضمانتیں دکھائیں" },
    foundations: { title: "بنیادیں", onThisPage: "اس صفحے پر", privacyFirst: "رازداری اول", deterministic: "فیصلہ کن", immutable: "ناقابلِ تبدیل اور قابلِ تصدیق", crossPlatform: "کراس پلیٹ فارم" },
    seo: {
      home: { title: "آپ کے ایجنٹ بھول جاتے ہیں۔ Neotoma انہیں یاد کراتا ہے۔", description: "انسانی مطابقت پذیری کی تہہ بننا بند کریں۔ Claude، Cursor، ChatGPT اور MCP سے جڑے ٹولز استعمال کرنے والے ملٹی ایجنٹ بنانے والوں اور آپریٹرز کے لیے فیصلہ کن، ورژن شدہ حالت۔" },
      docs: { title: "Neotoma دستاویزات | سیٹ اپ، API، MCP، CLI حوالہ", description: "Neotoma دستاویزات: سیٹ اپ، آرکیٹیکچر، API حوالہ اور آپریشنل گائیڈز۔" },
      install: { title: "انسٹال | Neotoma", description: "5 منٹ میں Neotoma انسٹال کریں۔ ایجنٹ کی مدد سے اور دستی انسٹال، Docker سیٹ اپ، API سرور اسٹارٹ اپ اور MCP کنفیگریشن۔" },
      foundations: { title: "بنیادیں | Neotoma", description: "Neotoma کی آرکیٹیکچرل بنیادیں: کلاؤڈ سنک کے بغیر رازداری اول مقامی ڈیٹا، اور MCP کے ذریعے تمام AI ٹولز میں کراس پلیٹ فارم میموری۔" },
      memoryGuarantees: { title: "میموری ضمانتیں | Neotoma", description: "پیداواری بوجھ کے تحت قابل اعتمادی طے کرنے والی میموری خصوصیات: فیصلہ کن حالت ارتقاء، ورژن شدہ تاریخ، دوبارہ چلانے کے قابل ٹائم لائن، قابل آڈٹ تبدیلی لاگ اور اسکیما پابندیاں۔" },
    },
  },
  id: {
    homeHero: {
      titlePrefix: "Agen Anda lupa.",
      titleAccent: "Neotoma",
      titleMid: "membuat mereka",
      titleFocus: "mengingat.",
      withoutSharedMemory: "Tanpa memori bersama di seluruh alat AI Anda:",
      bullets: [
        "Konteks bergeser antara Claude, Cursor, ChatGPT, dan yang lainnya.",
        "Keputusan menghilang saat sesi berakhir.",
        "Anda menjadi lapisan sinkronisasi manusia — mengulangi apa yang seharusnya sudah diketahui agen.",
      ],
      summary: "Neotoma menyimpan {record} Anda sebagai status berversi dan dapat diaudit — sehingga setiap agen bekerja dari kebenaran.",
      summaryRecordTypes: ["kontak", "tugas", "keputusan", "percakapan", "catatan", "preferensi", "transaksi", "catatan rapat", "perusahaan", "data kesehatan"],
      ctaEvaluateWithAgent: "Minta agen Anda untuk mengevaluasi",
      ctaEvaluateCompact: "Evaluasi",
      ctaViewGuarantees: "Lihat jaminan",
      ctaInstall: "Instal dalam 5 menit",
      ctaMeetCreator: "Temui pembuatnya",
      ctaMeetCreatorCompact: "Pembuat",
      ctaOfficeHours: "Bicara dengan pendiri",
      ctaOfficeHoursSubtext: "Membangun stack multi-agen? Jam kantor untuk pengembang yang ingin membahas arsitektur.",
      subcopy: "Neotoma adalah git untuk apa yang diketahui agen Anda. Status berversi, dapat dibandingkan, dan dapat diputar ulang di seluruh Claude, Cursor, ChatGPT, dan yang lainnya. Berhentilah menjadi lapisan sinkronisasi manusia.",
      curiosityGap: "Sebagian besar alat memori membantu agen mengambil informasi. Tidak ada yang bisa membuktikan bahwa informasi tersebut belum dirusak secara diam-diam.",
      audienceTagline: "Memori tahan lama untuk agen yang bertahan di seluruh sesi dan alat",
      heroReinforcement: "Agen Anda melanjutkan dari tempat mereka berhenti dan berkoordinasi di seluruh Claude, Cursor, ChatGPT, dan yang lainnya. Tanpa menjelaskan ulang, tanpa konteks yang hilang, tanpa jawaban yang bertentangan.",
      heroReinforcementSecondary: "Git untuk pengetahuan agentic — setiap fakta berversi dan terakumulasi selama berbulan-bulan, koreksi bertahan, riwayat dipertahankan, dan tidak ada yang bergeser secara diam-diam.",
    },
    siteSections: { intro: "Pendahuluan", personalOs: "Bukti", beforeAfter: "Sebelum / Sesudah", who: "Siapa", demo: "Demo", recordTypes: "Jenis rekaman", guarantees: "Jaminan", evaluate: "Evaluasi", commonQuestions: "Pertanyaan umum", frequentlyAskedQuestions: "Pertanyaan yang sering diajukan", inspect: "Inspeksi", architecture: "Arsitektur", useCases: "Kasus penggunaan", interfaces: "Antarmuka", learnMore: "Pelajari lebih lanjut", resources: "Sumber daya" },
    memory: { vendors: "Vendor", representativeProviders: "Penyedia representatif untuk setiap pendekatan memori", platform: "Platform", retrievalRag: "Pengambilan / RAG", files: "File", database: "Database", deterministic: "Deterministik", platformShort: "Plat.", ragShort: "RAG", filesShort: "File", databaseShort: "DB", deterministicShort: "Det.", onThisPage: "Di halaman ini", showFewer: "Tampilkan kurang", showAllGuaranteesTemplate: "Tampilkan semua {count} jaminan" },
    foundations: { title: "Fondasi", onThisPage: "Di halaman ini", privacyFirst: "Privasi utama", deterministic: "Deterministik", immutable: "Tidak dapat diubah dan dapat diverifikasi", crossPlatform: "Lintas platform" },
    seo: {
      home: { title: "Agen Anda lupa. Neotoma membuat mereka mengingat.", description: "Berhentilah menjadi lapisan sinkronisasi manusia. Status deterministik dan berversi untuk pembangun dan operator multi-agen yang menggunakan Claude, Cursor, ChatGPT, dan alat yang terhubung MCP." },
      docs: { title: "Dokumentasi Neotoma | Pengaturan, API, MCP, CLI", description: "Dokumentasi Neotoma: pengaturan, arsitektur, referensi API, dan panduan operasional." },
      install: { title: "Instal | Neotoma", description: "Instal Neotoma dalam 5 menit. Instalasi berbantuan agen dan manual, pengaturan Docker, startup server API, dan konfigurasi MCP." },
      foundations: { title: "Fondasi | Neotoma", description: "Fondasi arsitektur Neotoma: data lokal dengan privasi utama tanpa sinkronisasi cloud, dan memori lintas platform melalui MCP." },
      memoryGuarantees: { title: "Jaminan Memori | Neotoma", description: "Properti memori yang menentukan keandalan di bawah beban produksi: evolusi status deterministik, riwayat berversi, timeline yang dapat diputar ulang, log perubahan yang dapat diaudit, dan batasan skema." },
    },
  },
  de: {
    homeHero: {
      titlePrefix: "Ihre Agenten vergessen.",
      titleAccent: "Neotoma",
      titleMid: "lässt sie sich",
      titleFocus: "erinnern.",
      withoutSharedMemory: "Ohne gemeinsamen Speicher zwischen Ihren KI-Tools:",
      bullets: [
        "Der Kontext driftet zwischen Claude, Cursor, ChatGPT und allem anderen.",
        "Entscheidungen verschwinden, wenn die Sitzung endet.",
        "Sie werden zur menschlichen Synchronisierungsschicht — und wiederholen, was der Agent bereits wissen sollte.",
      ],
      summary: "Neotoma speichert Ihre {record} als versionierten, auditierbaren Zustand — damit jeder Agent mit der Wahrheit arbeitet.",
      summaryRecordTypes: ["Kontakte", "Aufgaben", "Entscheidungen", "Gespräche", "Notizen", "Einstellungen", "Transaktionen", "Meeting-Notizen", "Unternehmen", "Gesundheitsdaten"],
      ctaEvaluateWithAgent: "Bitten Sie Ihren Agenten zu bewerten",
      ctaEvaluateCompact: "Bewerten",
      ctaViewGuarantees: "Garantien ansehen",
      ctaInstall: "In 5 Minuten installieren",
      ctaMeetCreator: "Den Entwickler treffen",
      ctaMeetCreatorCompact: "Entwickler",
      ctaOfficeHours: "Mit dem Gründer sprechen",
      ctaOfficeHoursSubtext: "Bauen Sie einen Multi-Agent-Stack? Sprechstunde für Entwickler, die über Architektur sprechen möchten.",
      subcopy: "Neotoma ist Git für das Wissen Ihrer Agenten. Versionierter, vergleichbarer, wiederholbarer Zustand zwischen Claude, Cursor, ChatGPT und allem anderen. Hören Sie auf, die menschliche Synchronisierungsschicht zu sein.",
      curiosityGap: "Die meisten Speicher-Tools helfen Agenten, Informationen abzurufen. Keines kann beweisen, dass sie nicht stillschweigend verfälscht wurden.",
      audienceTagline: "Langlebiger Speicher für Agenten, der über Sitzungen und Tools hinweg besteht",
      heroReinforcement: "Ihre Agenten machen dort weiter, wo sie aufgehört haben, und koordinieren sich zwischen Claude, Cursor, ChatGPT und allem anderen. Kein erneutes Erklären, kein verlorener Kontext, keine widersprüchlichen Antworten.",
      heroReinforcementSecondary: "Git für agentisches Wissen — jedes Faktum ist versioniert und akkumuliert über Monate, Korrekturen bleiben bestehen, die Historie wird bewahrt und nichts driftet stillschweigend ab.",
    },
    siteSections: { intro: "Einführung", personalOs: "Beweis", beforeAfter: "Vorher / Nachher", who: "Wer", demo: "Demo", recordTypes: "Datensatztypen", guarantees: "Garantien", evaluate: "Bewerten", commonQuestions: "Häufige Fragen", frequentlyAskedQuestions: "Häufig gestellte Fragen", inspect: "Inspizieren", architecture: "Architektur", useCases: "Anwendungsfälle", interfaces: "Schnittstellen", learnMore: "Mehr erfahren", resources: "Ressourcen" },
    memory: { vendors: "Anbieter", representativeProviders: "Repräsentative Anbieter für jeden Speicheransatz", platform: "Plattform", retrievalRag: "Abruf / RAG", files: "Dateien", database: "Datenbank", deterministic: "Deterministisch", platformShort: "Plat.", ragShort: "RAG", filesShort: "Dateien", databaseShort: "DB", deterministicShort: "Det.", onThisPage: "Auf dieser Seite", showFewer: "Weniger anzeigen", showAllGuaranteesTemplate: "Alle {count} Garantien anzeigen" },
    foundations: { title: "Grundlagen", onThisPage: "Auf dieser Seite", privacyFirst: "Datenschutz zuerst", deterministic: "Deterministisch", immutable: "Unveränderlich und verifizierbar", crossPlatform: "Plattformübergreifend" },
    seo: {
      home: { title: "Ihre Agenten vergessen. Neotoma lässt sie sich erinnern.", description: "Hören Sie auf, die menschliche Synchronisierungsschicht zu sein. Deterministischer, versionierter Zustand für Multi-Agent-Entwickler und -Operatoren, die Claude, Cursor, ChatGPT und MCP-verbundene Tools nutzen." },
      docs: { title: "Neotoma Dokumentation | Einrichtung, API, MCP, CLI-Referenz", description: "Neotoma-Dokumentation: Einrichtung, Architektur, API-Referenzen und Betriebsanleitungen." },
      install: { title: "Installieren | Neotoma", description: "Installieren Sie Neotoma in 5 Minuten. Agentenunterstützte und manuelle Installation, Docker-Setup, API-Server-Start und MCP-Konfiguration." },
      foundations: { title: "Grundlagen | Neotoma", description: "Architektonische Grundlagen von Neotoma: lokale Daten mit Datenschutz zuerst ohne Cloud-Synchronisierung und plattformübergreifender Speicher über MCP." },
      memoryGuarantees: { title: "Speichergarantien | Neotoma", description: "Speichereigenschaften, die die Zuverlässigkeit unter Produktionslast bestimmen: deterministische Zustandsentwicklung, versionierte Historie, wiederspielbare Zeitlinie, auditierbares Änderungsprotokoll und Schema-Beschränkungen." },
    },
  },
};

function buildPack(locale: SupportedLocale): StaticLocalePack {
  if (locale === "en") return EN_PACK;
  const data = LOCALE_PACKS[locale];
  if (!data) return EN_PACK;
  return {
    homeHero: data.homeHero,
    siteSections: data.siteSections,
    memory: {
      ...data.memory,
      showFewer: data.memory.showFewer,
      showAllGuarantees: (count) => data.memory.showAllGuaranteesTemplate.replace("{count}", String(count)),
    },
    foundations: data.foundations,
    seo: data.seo,
    homeBody: getHomeBodyPack(locale),
  };
}

const STATIC_LOCALE_PACKS: Record<SupportedLocale, StaticLocalePack> = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, buildPack(locale)])
) as Record<SupportedLocale, StaticLocalePack>;

export function getStaticLocalePack(locale: SupportedLocale): StaticLocalePack {
  return STATIC_LOCALE_PACKS[locale] ?? EN_PACK;
}
