export const VAT_INCLUSIVE = 0.15;
export const BONUS_MIN_LEGS = 6;
export const BONUS_RATE = 0.02;

export function slipTotals(odds: number[], stake: number) {
  const combined = odds.reduce((product, price) => product * price, 1);
  const vat = stake * (VAT_INCLUSIVE / (1 + VAT_INCLUSIVE));
  const netStake = stake - vat;
  const win = netStake * combined;
  const bonus = odds.length >= BONUS_MIN_LEGS ? win * BONUS_RATE : 0;
  return {
    combined,
    vat: round2(vat),
    netStake: round2(netStake),
    win: round2(win),
    bonus: round2(bonus),
    possibleWin: round2(win + bonus),
  };
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatOdd(value: number) {
  return value.toFixed(2);
}
