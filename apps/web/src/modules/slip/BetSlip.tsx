"use client";

import { useMemo, useState } from "react";
import type { BetReceiptDto } from "@maraki/shared";
import { BONUS_MIN_LEGS, formatOdd, slipTotals } from "@maraki/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/modules/identity/AuthProvider";
import { useLiveQuote } from "@/modules/odds/LiveOddsProvider";
import { CouponCard } from "./CouponCard";
import { useSlip } from "./SlipProvider";

function money(value: number) {
  return value.toFixed(2);
}

function SlipPickRow({
  fixtureId,
  label,
  selection,
  marketName,
  outcomeId,
  playerId,
  fallbackPrice,
  onRemove,
}: {
  fixtureId: string;
  label: string;
  selection: string;
  marketName: string;
  outcomeId: number;
  playerId: number;
  fallbackPrice: number;
  onRemove: () => void;
}) {
  const live = useLiveQuote(fixtureId, outcomeId, playerId);
  const price = live && live.housePrice > 0 ? live.housePrice : fallbackPrice;
  return (
    <div className="slip-pick">
      <div className="slip-pick-top">
        <strong>{label.replace("  -  ", " vs ")}</strong>
        <button type="button" className="slip-remove" onClick={onRemove} aria-label="Remove">
          ×
        </button>
      </div>
      <div className="slip-pick-line">
        <span className="slip-label">Game Type</span>
        <span className="slip-dot" aria-hidden />
        <span className="slip-value">{marketName}</span>
      </div>
      <div className="slip-pick-line slip-pick-bottom">
        <div className="slip-pick-main">
          <span className="slip-label">Your Pick</span>
          <span className="slip-dot" aria-hidden />
          <span className="slip-pick-name">{selection}</span>
        </div>
        <b className="slip-odd">{formatOdd(price)}</b>
      </div>
    </div>
  );
}

export function BetSlip() {
  const { active, setActive, picks, counts, removePick, clearSlip } = useSlip();
  const { session, openAuth, setWallet } = useAuth();
  const [stake, setStake] = useState("20");
  const [acceptChanges, setAcceptChanges] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<BetReceiptDto | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [loadCode, setLoadCode] = useState("");
  const [offline, setOffline] = useState(true);
  const [checked, setChecked] = useState<BetReceiptDto | null>(null);
  const [checkError, setCheckError] = useState("");
  const [checking, setChecking] = useState(false);

  const stakeValue = Number(stake) || 0;
  const totals = useMemo(
    () => slipTotals(picks.map((pick) => (pick.quote.housePrice > 0 ? pick.quote.housePrice : 1)), stakeValue),
    [picks, stakeValue],
  );
  const remaining = Math.max(0, BONUS_MIN_LEGS - picks.length);
  const winTax = 0;

  async function lookupCoupon(code: string) {
    setChecking(true);
    setCheckError("");
    try {
      setChecked(await api.checkCoupon(code));
    } catch (err) {
      setChecked(null);
      setCheckError(err instanceof Error ? err.message : "Coupon not found");
    } finally {
      setChecking(false);
    }
  }

  return (
    <aside className="slip">
      <div className="slip-panel">
        <div className="slip-tabs" role="tablist">
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              role="tab"
              aria-selected={active === index}
              className={active === index ? "active" : ""}
              type="button"
              onClick={() => setActive(index)}
            >
              Slip {index + 1}
              {counts[index] > 0 ? <span className="slip-count">{counts[index]}</span> : null}
            </button>
          ))}
        </div>

        <div className="slip-card">
          {picks.length === 0 ? (
            <>
              <div className="slip-empty">
                Your slip is still empty
                <span>Make Your First Pick to Start Playing.</span>
              </div>
              <div className="slip-load">
                <div className="slip-load-head">
                  <span>
                    Load Coupon:
                    <i className="slip-info" title="Enter a coupon number to look it up">
                      i
                    </i>
                  </span>
                  <label className="slip-offline">
                    Offline
                    <button
                      type="button"
                      className={`slip-switch${offline ? " on" : ""}`}
                      aria-pressed={offline}
                      onClick={() => setOffline((value) => !value)}
                    >
                      <span />
                    </button>
                  </label>
                </div>
                <div className="slip-load-row">
                  <input
                    placeholder="Coupon number ..."
                    value={loadCode}
                    onChange={(event) => setLoadCode(event.target.value)}
                  />
                  <button
                    type="button"
                    className="slip-load-btn"
                    disabled={checking || !loadCode.trim()}
                    onClick={() => void lookupCoupon(loadCode)}
                  >
                    {checking ? "..." : "LOAD"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="slip-picks">
                {picks.map((pick) => (
                  <SlipPickRow
                    key={`${pick.fixtureId}-${pick.quote.outcomeId}`}
                    fixtureId={pick.fixtureId}
                    label={pick.label}
                    selection={pick.selection}
                    marketName={pick.marketName}
                    outcomeId={pick.quote.outcomeId}
                    playerId={pick.quote.playerId}
                    fallbackPrice={pick.quote.housePrice}
                    onRemove={() => removePick(pick.fixtureId, pick.quote.outcomeId)}
                  />
                ))}
              </div>

              <div className="slip-combined">
                <span>ODD</span>
                <b>{formatOdd(totals.combined)}</b>
              </div>

              {remaining > 0 ? (
                <p className="slip-bonus-hint">
                  Select {remaining} more {remaining === 1 ? "match" : "matches"} and get a 2% win bonus
                </p>
              ) : (
                <p className="slip-bonus-hint">2% win bonus applied</p>
              )}

              <label className="slip-stake">
                Stake
                <input value={stake} onChange={(event) => setStake(event.target.value)} inputMode="decimal" />
              </label>

              <dl className="slip-totals">
                <div>
                  <dt>Stake</dt>
                  <dd>{money(stakeValue)}</dd>
                </div>
                <div>
                  <dt>VAT</dt>
                  <dd>{money(totals.vat)}</dd>
                </div>
                <div>
                  <dt>NetStake</dt>
                  <dd>{money(totals.netStake)}</dd>
                </div>
                <div>
                  <dt>Win</dt>
                  <dd>{money(totals.win)}</dd>
                </div>
                <div>
                  <dt>
                    <span className="slip-gift" aria-hidden>
                      🎁
                    </span>{" "}
                    Bonus
                  </dt>
                  <dd>{money(totals.bonus)}</dd>
                </div>
                <div>
                  <dt>WINTAX</dt>
                  <dd>{money(winTax)}</dd>
                </div>
                <div className="possible">
                  <dt>Possible Win</dt>
                  <dd>{money(totals.possibleWin)}</dd>
                </div>
              </dl>

              <label className="slip-accept">
                <input
                  type="checkbox"
                  checked={acceptChanges}
                  onChange={(event) => setAcceptChanges(event.target.checked)}
                />
                Accept All Odd Changes
              </label>

              {error && <p className="auth-error">{error}</p>}

              <div className="slip-actions">
                <button type="button" className="slip-clear" onClick={clearSlip}>
                  CLEAR SLIP
                </button>
                <button
                  type="button"
                  className="slip-place"
                  disabled={busy || stakeValue < 1}
                  onClick={async () => {
                    if (!session) {
                      openAuth("login");
                      return;
                    }
                    setBusy(true);
                    setError("");
                    try {
                      const booked = await api.placeBet({
                        stake: stakeValue,
                        acceptChanges,
                        selections: picks.map((pick) => ({
                          fixtureId: pick.fixtureId,
                          marketId: pick.quote.marketId,
                          outcomeId: pick.quote.outcomeId,
                          playerId: pick.quote.playerId,
                          marketName: pick.marketName,
                          selection: pick.selection,
                          fixtureLabel: pick.label,
                          placedOdds: pick.quote.housePrice,
                        })),
                      });
                      setReceipt(booked);
                      clearSlip();
                      const wallet = await api.wallet();
                      setWallet(wallet);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not place bet");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "PLACING..." : "PLACE BET"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="coupon">
        <h3>Check Coupon</h3>
        <div className="coupon-stack">
          <input
            placeholder="Coupon number..."
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value)}
          />
          <button
            type="button"
            disabled={checking || !couponCode.trim()}
            onClick={() => void lookupCoupon(couponCode)}
          >
            {checking ? "..." : "CHECK"}
          </button>
        </div>
        {checkError && <p className="auth-error">{checkError}</p>}
        {checked && <CouponCard bet={checked} />}
      </div>

      {receipt && (
        <div className="auth-overlay" onClick={() => setReceipt(null)}>
          <div className="receipt-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="receipt-close" onClick={() => setReceipt(null)}>
              ×
            </button>
            <h2>Congratulations! Your bet is booked.</h2>
            <div className="receipt-grid">
              <dl>
                <div>
                  <dt>Total Odd</dt>
                  <dd>{receipt.combinedOdds}</dd>
                </div>
                <div>
                  <dt>Stake</dt>
                  <dd>{receipt.stake}</dd>
                </div>
                <div>
                  <dt>Net Stake</dt>
                  <dd>{receipt.netStake}</dd>
                </div>
                <div>
                  <dt>Win</dt>
                  <dd>{receipt.possibleWin}</dd>
                </div>
                <div>
                  <dt>Bonus</dt>
                  <dd>{receipt.bonus}</dd>
                </div>
                <div>
                  <dt>Net Payout</dt>
                  <dd>{receipt.possibleWin}</dd>
                </div>
              </dl>
              <div className="receipt-code">
                <b>{receipt.couponCode}</b>
                <p>Please keep this coupon number.</p>
              </div>
            </div>
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Market</th>
                  <th>Your Pick</th>
                  <th>Odd</th>
                </tr>
              </thead>
              <tbody>
                {receipt.selections.map((item) => (
                  <tr key={`${item.fixtureLabel}-${item.selection}`}>
                    <td>{item.fixtureLabel}</td>
                    <td>{item.marketName}</td>
                    <td>{item.selection}</td>
                    <td>{item.placedOdds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </aside>
  );
}
