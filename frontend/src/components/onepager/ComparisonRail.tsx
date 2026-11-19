import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ClipboardList, Layers3, Files, History, MessageSquareText, ScanSearch, FileClock, Network } from "lucide-react";
import { useLocale } from "@/i18n/LocaleContext";
import { RECALL_VS_RECORD } from "./onepager_copy";
import { RECALL_VS_RECORD_ES } from "./spanish_comparison_copy";

export const comparisonIcons = [
  [ClipboardList, Layers3],
  [Files, History],
  [MessageSquareText, ScanSearch],
  [FileClock, Network],
] as const;

export function ComparisonRail() {
  const { locale } = useLocale();
  const es = locale === "es";
  const rows = es ? RECALL_VS_RECORD_ES : RECALL_VS_RECORD;
  const railRef = useRef<HTMLOListElement>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  useEffect(
    () => () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    },
    []
  );

  const currentPosition = () => {
    const rail = railRef.current;
    if (!rail) return 0;
    const cards = Array.from(rail.children) as HTMLElement[];
    return cards.reduce(
      (closest, card, index) =>
        Math.abs(card.offsetLeft - rail.offsetLeft - rail.scrollLeft) <
        Math.abs(cards[closest].offsetLeft - rail.offsetLeft - rail.scrollLeft)
          ? index
          : closest,
      0
    );
  };

  const goTo = (index: number) => {
    const rail = railRef.current;
    const card = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !card) return;
    const next = Math.max(0, Math.min(index, rows.length - 1));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const left = card.offsetLeft - rail.offsetLeft;
    if (rail.scrollTo) rail.scrollTo({ left, behavior: reducedMotion ? "instant" : "smooth" });
    else rail.scrollLeft = left;
    setPosition(next);
    setAnnouncement(es ? `Pregunta ${next + 1} de ${rows.length}` : `Question ${next + 1} of ${rows.length}`);
  };

  const onScroll = () => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const next = currentPosition();
      setPosition(next);
      setAnnouncement(es ? `Pregunta ${next + 1} de ${rows.length}` : `Question ${next + 1} of ${rows.length}`);
    }, 120);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.target !== event.currentTarget) return;
    const current = position;
    const target =
      event.key === "ArrowRight"
        ? current + 1
        : event.key === "ArrowLeft"
          ? current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
            ? rows.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    goTo(target);
  };

  return (
    <div className="plan-comparison-mobile">
      <ol
        id="plan-comparison-rail"
        className="plan-comparison-rail"
        ref={railRef}
        role="list"
        aria-label={es ? "Comparar recuerdo y sistema de registro" : "Compare recall and a system of record"}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
      >
        {rows.map((row, index) => {
          const RecallIcon = comparisonIcons[index][0];
          const RecordIcon = comparisonIcons[index][1];
          return (
            <li
              className="plan-comparison-card"
              key={row.question}
              aria-label={es ? `Pregunta ${index + 1} de ${rows.length}: ${row.question}` : `Question ${index + 1} of ${rows.length}: ${row.question}`}
            >
              <h3>{row.question}</h3>
              <div className="plan-comparison-answer">
                <p className="plan-comparison-label">{es ? "Recuerdo" : "Recall"}</p>
                <p className="plan-table-value">
                  <RecallIcon aria-hidden="true" size={22} strokeWidth={1.6} />
                  {row.recall}
                </p>
              </div>
              <div className="plan-comparison-answer">
                <p className="plan-comparison-label">{es ? "Sistema de registro" : "System of record"}</p>
                <p className="plan-table-value">
                  <RecordIcon aria-hidden="true" size={22} strokeWidth={1.6} />
                  {row.record}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <span className="plan-sr" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
