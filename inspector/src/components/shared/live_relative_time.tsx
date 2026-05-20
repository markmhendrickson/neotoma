import { useEffect, useState } from "react";
import { absoluteDateTime, relativeTime, relativeTimeRefreshMs } from "@/lib/humanize";

type LiveRelativeTimeProps = {
  iso: string | null | undefined;
  className?: string;
  /**
   * Native tooltip. Default: absolute date/time when `iso` is valid.
   * Pass `false` to omit (e.g. when a parent already sets `title`).
   */
  title?: string | false;
};

/**
 * Renders {@link relativeTime} and reschedules updates so labels advance without a full page refresh.
 */
export function LiveRelativeTime({ iso, className, title }: LiveRelativeTimeProps) {
  const [label, setLabel] = useState(() => (iso ? relativeTime(iso) : ""));

  useEffect(() => {
    if (!iso) {
      setLabel("");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      setLabel(relativeTime(iso));
      const ms = relativeTimeRefreshMs(iso);
      if (ms > 0) {
        timer = setTimeout(tick, ms);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [iso]);

  const tip =
    title === false ? undefined : title !== undefined ? title : iso ? absoluteDateTime(iso) : undefined;

  return (
    <span className={className} title={tip}>
      {label}
    </span>
  );
}
