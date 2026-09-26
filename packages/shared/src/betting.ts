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
  /** PLACED = live bet; BOOKED = unpaid shop ticket */
  kind?: "PLACED" | "BOOKED";
  /** ONLINE = wallet; CASH = shop desk */
  channel?: "ONLINE" | "CASH";
  stake: string;
  vat: string;
  netStake: string;
  combinedOdds: string;
  bonus: string;
  possibleWin: string;
  payout: string;
  settledAt: string | null;
  createdAt: string;
  expiresAt?: string | null;
  selections: Array<{
    fixtureId?: string;
    marketId?: number;
    outcomeId?: number;
    playerId?: number;
    fixtureLabel: string;
    marketName: string;
    selection: string;
    placedOdds: string;
    status: string;
    startTime?: string | null;
  }>;
};

export type SelectionResult = "PENDING" | "WON" | "LOST" | "VOID";
export type BetResult = "ACCEPTED" | "WON" | "LOST" | "VOID";
export type BookingStatus = "BOOKED" | "PLACED" | "EXPIRED" | "CANCELLED";
export type TestSettleOutcome = "WON" | "LOST" | "VOID";
