export type PlaceBetSelection = {
  fixtureId: string;
  marketId: number;
  outcomeId: number;
  playerId: number;
  marketName: string;
  selection: string;
  fixtureLabel: string;
  placedOdds: number;
};

export type BetReceiptDto = {
  id: string;
  couponCode: string;
  type: string;
  status: string;
  stake: string;
  vat: string;
  netStake: string;
  combinedOdds: string;
  bonus: string;
  possibleWin: string;
  payout: string;
  settledAt: string | null;
  createdAt: string;
  selections: Array<{
    fixtureLabel: string;
    marketName: string;
    selection: string;
    placedOdds: string;
    status: string;
  }>;
};

export type SelectionResult = "PENDING" | "WON" | "LOST" | "VOID";
export type BetResult = "ACCEPTED" | "WON" | "LOST" | "VOID";
export type TestSettleOutcome = "WON" | "LOST" | "VOID";
