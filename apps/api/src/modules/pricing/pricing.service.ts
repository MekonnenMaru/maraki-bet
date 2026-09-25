import { env } from "../../config/env.js";

export type PricedQuote = {
  outcomeId: number;
  playerId: number;
  marketId: number;
  sourcePrice: number;
  housePrice: number;
  active: boolean;
  changedAt: number;
};

export class PricingService {
  constructor(private readonly margin = env.HOUSE_MARGIN) {}

  price(sourcePrice: number, active: boolean, extra?: { stale?: boolean; marketActive?: boolean | null }) {
    const open = active && extra?.marketActive !== false && extra?.stale !== true && sourcePrice > 1;
    return {
      housePrice: open ? applyMargin(sourcePrice, this.margin) : 0,
      active: open,
    };
  }
}

export function applyMargin(decimal: number, margin: number) {
  if (!Number.isFinite(decimal) || decimal <= 1) return 0;
  return round2(Math.max(1.01, decimal / (1 + margin)));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
