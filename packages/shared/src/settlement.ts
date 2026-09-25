import type { BetResult, SelectionResult } from "./betting";
import { slipTotals } from "./slip-math";

export type SettleableFixture = {
  statusId: number;
  homeScore: number | null;
  awayScore: number | null;
};

export type SettleableMarket = {
  marketType?: string | null;
  name?: string | null;
  handicap?: number | string | null;
};

export function evaluateSelection(
  pick: string,
  marketName: string,
  fixture: SettleableFixture,
  market?: SettleableMarket | null,
): SelectionResult {
  if (fixture.statusId >= 3) return "VOID";
  if (fixture.statusId < 2) return "PENDING";
  if (fixture.homeScore == null || fixture.awayScore == null) return "PENDING";

  const home = fixture.homeScore;
  const away = fixture.awayScore;
  const label = `${market?.marketType ?? ""} ${market?.name ?? marketName}`.toLowerCase();
  const selection = normalizePick(pick);

  if (is1x2(label)) {
    const winner = home > away ? "1" : home < away ? "2" : "x";
    return match1x2(selection) === winner ? "WON" : "LOST";
  }

  if (isDoubleChance(label)) {
    const winner = home > away ? "1" : home < away ? "2" : "x";
    const pickCode = matchDoubleChance(selection);
    if (!pickCode) return "PENDING";
    return pickCode.includes(winner) ? "WON" : "LOST";
  }

  if (isBtts(label)) {
    const both = home > 0 && away > 0;
    if (selection === "yes") return both ? "WON" : "LOST";
    if (selection === "no") return both ? "LOST" : "WON";
    return "PENDING";
  }

  if (isTotals(label, selection)) {
    const line = lineFrom(market, marketName, pick);
    if (line == null) return "PENDING";
    const total = home + away;
    const side = selection.startsWith("under") ? "under" : "over";
    if (total === line) return "VOID";
    return (side === "over" ? total > line : total < line) ? "WON" : "LOST";
  }

  return "PENDING";
}

export function finalizeBet(
  legs: Array<{ status: SelectionResult; odds: number }>,
  stake: number,
): { status: BetResult; payout: number } {
  if (legs.some((leg) => leg.status === "PENDING")) {
    return { status: "ACCEPTED", payout: 0 };
  }
  if (legs.every((leg) => leg.status === "VOID")) {
    return { status: "VOID", payout: stake };
  }
  if (legs.some((leg) => leg.status === "LOST")) {
    return { status: "LOST", payout: 0 };
  }
  const liveOdds = legs.filter((leg) => leg.status === "WON").map((leg) => leg.odds);
  return { status: "WON", payout: slipTotals(liveOdds, stake).possibleWin };
}

function is1x2(label: string) {
  return /1x2|full time result|match winner|match result/.test(label) && !/double/.test(label);
}

function isDoubleChance(label: string) {
  return /double\s*chance|doublechance/.test(label);
}

function isBtts(label: string) {
  return /both teams? to score|btts|bothteamsscore/.test(label);
}

function isTotals(label: string, selection: string) {
  return /over.?under|totals|o\/u/.test(label) || selection.startsWith("over") || selection.startsWith("under");
}

function match1x2(selection: string) {
  if (selection === "1" || selection === "home" || selection.endsWith(" 1")) return "1";
  if (selection === "2" || selection === "away" || selection.endsWith(" 2")) return "2";
  if (selection === "x" || selection === "draw") return "x";
  return selection;
}

function matchDoubleChance(selection: string) {
  const compact = selection.replace(/\s+/g, "").replace("/", "");
  if (compact === "1x" || compact === "x1") return "1x";
  if (compact === "12" || compact === "21") return "12";
  if (compact === "x2" || compact === "2x") return "x2";
  return "";
}

function lineFrom(market: SettleableMarket | null | undefined, marketName: string, pick: string) {
  const raw = market?.handicap;
  const fromMarket = raw == null || raw === "" ? NaN : Number(raw);
  if (Number.isFinite(fromMarket) && fromMarket !== 0) return fromMarket;
  const match = `${marketName} ${pick}`.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function normalizePick(value: string) {
  return value.trim().toLowerCase();
}
