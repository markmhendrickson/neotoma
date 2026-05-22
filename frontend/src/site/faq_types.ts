/** FAQ entries keyed by stable `sectionId` for `/faq#...` anchors across locales. */

export interface FaqItem {
  sectionId: string;
  question: string;
  answer: string;
  detail?: string;
  link?: { href: string; label: string };
}
