export function formatRelativeTime(date: Date): string {
  if (typeof Intl === 'undefined' || typeof Intl.RelativeTimeFormat === 'undefined') {
    return date.toLocaleString();
  }

  const now = Date.now();
  const diffMs = date.getTime() - now;
  const minuteMs = 60 * 1000;

  if (Math.abs(diffMs) < minuteMs) {
    return diffMs <= 0 ? '< 1 minute ago' : 'in < 1 minute';
  }

  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'minutes'],
    [24, 'hours'],
    [7, 'days'],
    [4.34524, 'weeks'],
    [12, 'months'],
    [Number.POSITIVE_INFINITY, 'years'],
  ];

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let duration = diffMs / 1000;

  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) {
      return rtf.format(Math.round(duration), unit);
    }
    duration /= amount;
  }

  return rtf.format(Math.round(duration), 'years');
}


