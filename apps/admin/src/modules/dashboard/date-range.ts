import { APP_UTC_OFFSET, eatInputValue, eatYmd, shiftEatYmd } from "@maraki/shared";

export function addisInputValue(date: Date) {
  return eatInputValue(date);
}

export function addisYmd(date = new Date()) {
  return eatYmd(date);
}

export function shiftYmd(ymd: string, days: number) {
  return shiftEatYmd(ymd, days);
}

export function toIsoRange(fromInput: string, toInput: string) {
  return {
    from: new Date(`${fromInput}:00${APP_UTC_OFFSET}`).toISOString(),
    to: new Date(`${toInput}:00${APP_UTC_OFFSET}`).toISOString(),
  };
}

export function todayInputs() {
  const ymd = eatYmd();
  return { from: `${ymd}T00:00`, to: `${ymd}T23:59` };
}

export function yesterdayInputs() {
  const ymd = shiftEatYmd(eatYmd(), -1);
  return { from: `${ymd}T00:00`, to: `${ymd}T23:59` };
}

export function last7Inputs() {
  const end = eatYmd();
  const start = shiftEatYmd(end, -6);
  return { from: `${start}T00:00`, to: `${end}T23:59` };
}

export function monthInputs() {
  const end = eatYmd();
  return { from: `${end.slice(0, 8)}01T00:00`, to: `${end}T23:59` };
}
