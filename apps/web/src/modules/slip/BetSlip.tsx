"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BetReceiptDto, OutcomeQuoteDto } from "@maraki/shared";
import { BONUS_MIN_LEGS, formatOdd, slipTotals } from "@maraki/shared";
import { useNotify } from "@maraki/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/modules/identity/AuthProvider";
import { useLiveQuote } from "@/modules/odds/LiveOddsProvider";
import { CouponCard } from "./CouponCard";
import { useSlip, type SlipPick } from "./SlipProvider";

function receiptToPicks(receipt: BetReceiptDto): SlipPick[] {
  return receipt.selections.flatMap((item) => {
    if (
      item.fixtureId == null ||
      item.marketId == null ||
      item.outcomeId == null ||
      item.playerId == null
    ) {
      return [];
    }
    const price = Number(item.placedOdds) || 1;
    const quote: OutcomeQuoteDto = {
      outcomeId: item.outcomeId,
      playerId: item.playerId,
      marketId: item.marketId,
      name: item.selection,
      sourcePrice: price,
      housePrice: price,
      active: true,
      changedAt: Date.now(),
    };
    return [
      {
        fixtureId: item.fixtureId,
        label: item.fixtureLabel,
        selection: item.selection,
        marketName: item.marketName,
        quote,
      },
    ];
  });
}

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
  const [leaving, setLeaving] = useState(false);
  const [oddFlash, setOddFlash] = useState<"up" | "down" | "">("");
  const prevPrice = useRef(price);

  useEffect(() => {
    const prev = prevPrice.current;
    prevPrice.current = price;
    if (prev === price || prev <= 0 || price <= 0) return;
    setOddFlash(price > prev ? "up" : "down");
    const timer = window.setTimeout(() => setOddFlash(""), 700);
    return () => window.clearTimeout(timer);
  }, [price]);

  function requestRemove() {
    if (leaving) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onRemove();
      return;
    }
    setLeaving(true);
  }

  return (
    <div
      className={`slip-pick${leaving ? " is-leaving" : ""}`}
      onAnimationEnd={(event) => {
        if (leaving && event.animationName === "slip-pick-out") onRemove();
      }}
    >
      <div className="slip-pick-top">
        <strong>{label.replace("  -  ", " vs ")}</strong>
        <button type="button" className="slip-remove" onClick={requestRemove} aria-label="Remove">
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
        <b className={`slip-odd${oddFlash ? ` flash-${oddFlash}` : ""}`}>{formatOdd(price)}</b>
      </div>
    </div>
  );
}

export function BetSlip() {
  const { active, setActive, picks, counts, removePick, clearSlip, replacePicks } = useSlip();
  const { session, openAuth, setWallet } = useAuth();
  const notify = useNotify();
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

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
      const coupon = await api.checkCoupon(code);
      setChecked(coupon);
      notify.success("Coupon found", { title: coupon.status });
    } catch (err) {
      setChecked(null);
      const message = err instanceof Error ? err.message : "Coupon not found";
      setCheckError(message);
      notify.error(message);
    } finally {
      setChecking(false);
    }
  }

  async function loadCoupon(code: string) {
    setLoading(true);
    setLoadError("");
    try {
      const coupon = await api.loadCoupon(code);
      const nextPicks = receiptToPicks(coupon);
      if (nextPicks.length === 0) {
        const message = "Coupon has no selectable picks to restore";
        setLoadError(message);
        notify.warn(message);
        return;
      }
      replacePicks(nextPicks);
      setStake(coupon.stake);
      setLoadCode("");
      notify.success("Coupon loaded");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Coupon not found";
      setLoadError(message);
      notify.error(message);
    } finally {
      setLoading(false);
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
                    <i className="slip-info" title="Restore selections from a booked or placed coupon onto this slip">
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
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && loadCode.trim()) void loadCoupon(loadCode);
                    }}
                  />
                  <button
                    type="button"
                    className="slip-load-btn"
                    disabled={loading || !loadCode.trim()}
                    onClick={() => void loadCoupon(loadCode)}
                  >
                    {loading ? "..." : "LOAD"}
                  </button>
                </div>
                {loadError ? <p className="auth-error">{loadError}</p> : null}
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
                <button type="button" className="slip-clear" onClick={() => {
                  clearSlip();
                  notify.info("Slip cleared");
                }}>
                  CLEAR SLIP
                </button>
                <button
                  type="button"
                  className="slip-place"
                  disabled={busy || stakeValue < 1}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    const selections = picks.map((pick) => ({
                      fixtureId: pick.fixtureId,
                      marketId: pick.quote.marketId,
                      outcomeId: pick.quote.outcomeId,
                      playerId: pick.quote.playerId,
                      marketName: pick.marketName,
                      selection: pick.selection,
                      fixtureLabel: pick.label,
                      placedOdds: pick.quote.housePrice,
                    }));
                    try {
                      if (session) {
                        const placed = await api.placeBet({
                          stake: stakeValue,
                          acceptChanges,
                          selections,
                        });
                        setReceipt(placed);
                        clearSlip();
                        const wallet = await api.wallet();
                        setWallet(wallet);
                        notify.success("Bet Placed Successfully!");
                      } else {
                        const booked = await api.bookCoupon({
                          stake: stakeValue,
                          acceptChanges,
                          selections,
                        });
                        setReceipt(booked);
                        notify.success("Coupon Booked Successfully!");
                      }
                    } catch (err) {
                      const message =
                        err instanceof Error
                          ? err.message
                          : session
                            ? "Could not place bet"
                            : "Could not book coupon";
                      setError(message);
                      notify.error(message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy
                    ? session
                      ? "PLACING..."
                      : "BOOKING..."
                    : session
                      ? "PLACE BET"
                      : "BOOK"}
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
        <div className="auth-overlay">
          <div
            className={`receipt-card${receipt.kind === "BOOKED" ? " receipt-booked" : ""}`}
          >
            <button type="button" className="modal-close" onClick={() => setReceipt(null)} aria-label="Close">
              ×
            </button>
            <h2>
              {receipt.kind === "BOOKED" ? "Congrats! Your bet is booked." : "Congratulations! Your bet is placed."}
            </h2>
            <div className="receipt-grid">
              <dl className="receipt-summary">
                <div>
                  <dt>Total Odd</dt>
                  <dd>{receipt.combinedOdds}</dd>
                </div>
                <div>
                  <dt>Stake</dt>
                  <dd>{receipt.stake} ETB</dd>
                </div>
                <div>
                  <dt>NetStake</dt>
                  <dd>{receipt.netStake} ETB</dd>
                </div>
                <div>
                  <dt>Win</dt>
                  <dd>{receipt.possibleWin} ETB</dd>
                </div>
                <div>
                  <dt>Bonus</dt>
                  <dd>{receipt.bonus} ETB</dd>
                </div>
                <div>
                  <dt>Net Pay</dt>
                  <dd>
                    <strong>{receipt.possibleWin} ETB</strong>
                  </dd>
                </div>
              </dl>
              <div className="receipt-code">
                <div className="receipt-code-row">
                  <b>{receipt.couponCode}</b>
                  <button
                    type="button"
                    className="receipt-copy"
                    title="Copy ticket"
                    onClick={() => {
                      void navigator.clipboard.writeText(receipt.couponCode).then(
                        () => notify.success("Copied!"),
                        () => notify.error("Could not copy"),
                      );
                    }}
                  >
                    Copy
                  </button>
                </div>
                {receipt.kind === "BOOKED" ? (
                  <>
                    <p>
                      Please find a nearby Maraki shop and deposit using the above ticket number. Thank you.
                    </p>
                    <p className="receipt-warn">
                      Bets after kickoff are invalid. Terms and conditions apply.
                    </p>
                  </>
                ) : (
                  <p>Please keep this coupon number.</p>
                )}
              </div>
            </div>
            <div className="receipt-table-wrap">
              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Match</th>
                    <th>Market</th>
                    <th>Your Pick</th>
                    <th>ODD</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.selections.map((item) => (
                    <tr key={`${item.fixtureLabel}-${item.selection}`}>
                      <td>
                        {item.startTime
                          ? new Date(item.startTime).toLocaleString(undefined, {
                              month: "short",
                              day: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td>{item.fixtureLabel.replace("  -  ", " vs ")}</td>
                      <td>{item.marketName}</td>
                      <td>{item.selection}</td>
                      <td>{item.placedOdds}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {receipt.kind === "BOOKED" && !session ? (
              <div className="receipt-cta">
                <h3>BET ONLINE</h3>
                <p>Create an account to bet online and unlock more bonuses.</p>
                <div className="receipt-cta-actions">
                  <button type="button" className="ghost" onClick={() => openAuth("login")}>
                    LOGIN
                  </button>
                  <button type="button" className="primary" onClick={() => openAuth("register")}>
                    REGISTER
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
