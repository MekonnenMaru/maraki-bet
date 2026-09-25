/**
 * Display timezone for Ethiopian users (UTC+3).
 * Provider/DB instants stay in UTC — never store wall-clock EAT as the source time.
 */
export const APP_TIMEZONE = "Africa/Addis_Ababa";
export const APP_UTC_OFFSET = "+03:00";

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
};

function eatParts(date: Date): DateParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second ?? "00",
    weekday: parts.weekday,
  };
}

/** YYYY-MM-DD in Africa/Addis_Ababa. */
export function eatYmd(date = new Date()) {
  const parts = eatParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftEatYmd(ymd: string, days: number) {
  const date = new Date(`${ymd}T12:00:00${APP_UTC_OFFSET}`);
  date.setTime(date.getTime() + days * 86_400_000);
  return eatYmd(date);
}

/** Inclusive day bounds as absolute UTC instants for an Addis Ababa calendar day. */
export function eatDayBounds(ymd: string) {
  return {
    from: new Date(`${ymd}T00:00:00.000${APP_UTC_OFFSET}`),
    to: new Date(`${ymd}T23:59:59.999${APP_UTC_OFFSET}`),
  };
}

export function formatEatDate(value: string | Date) {
  const parts = eatParts(new Date(value));
  return `${parts.day}.${parts.month}`;
}

export function formatEatTime(value: string | Date) {
  const parts = eatParts(new Date(value));
  return `${parts.hour}:${parts.minute}`;
}

/** Local Ethiopia display from a UTC ISO instant (e.g. 03:00Z → 06:00). */
export function formatEatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

/** Raw UTC instant for admin/debug (never use for player-facing kickoff). */
export function formatUtcDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatEatClock(value: string | Date = new Date()) {
  const parts = eatParts(new Date(value));
  return `${parts.day}/${parts.month}/${parts.year.slice(2)} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function eatWeekdayLong(value: string | Date) {
  return eatParts(new Date(value)).weekday;
}

/** Monday-first week chips in EAT; skips days already finished. */
export function eatUpcomingWeekChips() {
  const today = eatYmd();
  const todayNoon = new Date(`${today}T12:00:00${APP_UTC_OFFSET}`);
  const weekday = eatWeekdayLong(todayNoon);
  const mondayOffset = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(
    weekday,
  );
  const monday = shiftEatYmd(today, -Math.max(mondayOffset, 0));
  const items: Array<{ id: string; label: string }> = [{ id: "all", label: "All" }];
  for (let i = 0; i < 7; i += 1) {
    const id = shiftEatYmd(monday, i);
    if (id < today) continue;
    items.push({ id, label: eatWeekdayLong(`${id}T12:00:00${APP_UTC_OFFSET}`) });
  }
  return items;
}

export function eatInputValue(date = new Date()) {
  const parts = eatParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
