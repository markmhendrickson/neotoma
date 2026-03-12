import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/config";

export interface LocaleDictionary {
  languageName: string;
  docs: string;
  search: string;
  quickStart: string;
  install: string;
  architecture: string;
  allDocumentation: string;
  developerPreview: string;
  home: string;
  themeSystem: string;
  themeDark: string;
  themeLight: string;
  pageNotFound: string;
  notFoundDescription: string;
  goHome: string;
  docsIntro: string;
  categoryGettingStarted: string;
  categoryReference: string;
  categoryAgentBehavior: string;
  categoryUseCases: string;
  categoryIntegrationGuides: string;
  categoryExternal: string;
  viewAll: string;
}

const en: LocaleDictionary = {
  languageName: "English",
  docs: "Docs",
  search: "Search",
  quickStart: "Quick start",
  install: "Install",
  architecture: "Architecture",
  allDocumentation: "Documentation",
  developerPreview: "Developer preview",
  home: "Home",
  themeSystem: "System",
  themeDark: "Dark",
  themeLight: "Light",
  pageNotFound: "Page Not Found",
  notFoundDescription: "The page you're looking for doesn't exist or has been moved.",
  goHome: "Go home",
  docsIntro:
    "All Neotoma documentation organized by category. Start with getting started if you are new, or jump to the reference section for API, MCP, and CLI details.",
  categoryGettingStarted: "Getting started",
  categoryReference: "Reference",
  categoryAgentBehavior: "Agent behavior",
  categoryUseCases: "Use cases",
  categoryIntegrationGuides: "Integrations",
  categoryExternal: "External",
  viewAll: "View all",
};

const sharedTranslations: Partial<LocaleDictionary> = {
  docs: "Docs",
  allDocumentation: "Documentation",
};

const dictionaries: Record<SupportedLocale, LocaleDictionary> = {
  en,
  es: { ...en, ...sharedTranslations, languageName: "Español", quickStart: "Inicio rápido", install: "Instalar", architecture: "Arquitectura", developerPreview: "Vista previa para desarrolladores", home: "Inicio", pageNotFound: "Página no encontrada", goHome: "Ir al inicio" },
  ca: { ...en, ...sharedTranslations, languageName: "Català", quickStart: "Inici ràpid", install: "Instal·lar", architecture: "Arquitectura", developerPreview: "Vista prèvia per a desenvolupadors", home: "Inici", pageNotFound: "Pàgina no trobada", goHome: "Ves a l'inici" },
  zh: { ...en, ...sharedTranslations, languageName: "中文", quickStart: "快速开始", install: "安装", architecture: "架构", developerPreview: "开发者预览", home: "首页", pageNotFound: "页面未找到", goHome: "返回首页" },
  hi: { ...en, ...sharedTranslations, languageName: "हिंदी", quickStart: "त्वरित शुरुआत", install: "इंस्टॉल", architecture: "आर्किटेक्चर", developerPreview: "डेवलपर प्रीव्यू", home: "होम", pageNotFound: "पेज नहीं मिला", goHome: "होम पर जाएं" },
  ar: { ...en, ...sharedTranslations, languageName: "العربية", quickStart: "البدء السريع", install: "تثبيت", architecture: "البنية", developerPreview: "معاينة المطور", home: "الرئيسية", pageNotFound: "الصفحة غير موجودة", goHome: "العودة للرئيسية" },
  fr: { ...en, ...sharedTranslations, languageName: "Français", quickStart: "Démarrage rapide", install: "Installer", architecture: "Architecture", developerPreview: "Aperçu développeur", home: "Accueil", pageNotFound: "Page introuvable", goHome: "Retour à l'accueil" },
  pt: { ...en, ...sharedTranslations, languageName: "Português", quickStart: "Início rápido", install: "Instalar", architecture: "Arquitetura", developerPreview: "Prévia para desenvolvedores", home: "Início", pageNotFound: "Página não encontrada", goHome: "Ir para início" },
  ru: { ...en, ...sharedTranslations, languageName: "Русский", quickStart: "Быстрый старт", install: "Установка", architecture: "Архитектура", developerPreview: "Предпросмотр для разработчиков", home: "Главная", pageNotFound: "Страница не найдена", goHome: "На главную" },
  bn: { ...en, ...sharedTranslations, languageName: "বাংলা", quickStart: "দ্রুত শুরু", install: "ইনস্টল", architecture: "আর্কিটেকচার", developerPreview: "ডেভেলপার প্রিভিউ", home: "হোম", pageNotFound: "পৃষ্ঠা পাওয়া যায়নি", goHome: "হোমে যান" },
  ur: { ...en, ...sharedTranslations, languageName: "اردو", quickStart: "فوری آغاز", install: "انسٹال", architecture: "آرکیٹیکچر", developerPreview: "ڈیولپر پیش نظارہ", home: "ہوم", pageNotFound: "صفحہ نہیں ملا", goHome: "ہوم پر جائیں" },
  id: { ...en, ...sharedTranslations, languageName: "Bahasa Indonesia", quickStart: "Mulai cepat", install: "Instal", architecture: "Arsitektur", developerPreview: "Pratinjau pengembang", home: "Beranda", pageNotFound: "Halaman tidak ditemukan", goHome: "Ke beranda" },
  de: { ...en, ...sharedTranslations, languageName: "Deutsch", quickStart: "Schnellstart", install: "Installieren", architecture: "Architektur", developerPreview: "Entwickler-Vorschau", home: "Startseite", pageNotFound: "Seite nicht gefunden", goHome: "Zur Startseite" },
};

export function getDictionary(locale: SupportedLocale): LocaleDictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
