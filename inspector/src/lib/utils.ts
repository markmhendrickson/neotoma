import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Calendar date (YYYY-MM-DD, UTC). Default for inspector date display. */
export function formatDate(date: string | undefined | null): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toISOString().slice(0, 10);
  } catch {
    return date;
  }
}

/** Alias for {@link formatDate}. */
export const formatDateYmd = formatDate;

/** Locale date and time (e.g. for timeline rows where time-of-day matters). */
export function formatDateTime(date: string | undefined | null): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return date;
  }
}

export function truncateId(id: string | null | undefined, len = 8): string {
  if (id == null || id === "") return "—";
  const s = String(id);
  if (s.length <= len) return s;
  return s.slice(0, len) + "…";
}
