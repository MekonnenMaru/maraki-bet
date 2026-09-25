import { eatDayBounds, eatYmd } from "@maraki/shared";

export function dashboardRange(fromRaw?: string, toRaw?: string) {
  const fallback = eatDayBounds(eatYmd(new Date()));
  const from = parseInstant(fromRaw) ?? fallback.from;
  const to = parseInstant(toRaw) ?? fallback.to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fallback;
  }
  if (from > to) {
    return { from: to, to: from };
  }
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    return { from, to: new Date(from.getTime() + maxMs) };
  }
  return { from, to };
}

function parseInstant(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
