"use client";

import type { OutcomeQuoteDto } from "@maraki/shared";
import { useLiveQuote } from "./LiveOddsProvider";
import { useSlip } from "@/modules/slip/SlipProvider";

export function OddsButton({
  fixtureId,
  quote,
  label,
  compact = false,
  line = false,
  selectionLabel,
  marketName,
  className,
}: {
  fixtureId: string;
  quote?: OutcomeQuoteDto;
  label: string;
  compact?: boolean;
  line?: boolean;
  selectionLabel?: string;
  marketName?: string;
  className?: string;
}) {
  const live = useLiveQuote(fixtureId, quote?.outcomeId ?? 0, quote?.playerId ?? 0) ?? quote;
  const { addPick, isPicked } = useSlip();
  const price = live && live.housePrice > 0 ? live.housePrice.toFixed(2) : "-";
  const disabled = !live?.active;
  const selected = Boolean(live && isPicked(fixtureId, live.outcomeId));
  const name = selectionLabel ?? live?.name ?? "-";

  return (
    <button
      className={`${line ? "mkt-odd" : compact ? "cell" : "odd"}${disabled || price === "-" ? " empty" : ""}${selected ? " on" : ""}${className ? ` ${className}` : ""}`}
      type="button"
      disabled={disabled || price === "-"}
      onClick={() => {
        if (!live) return;
        addPick({
          fixtureId,
          label,
          selection: name,
          marketName: marketName ?? (compact ? "1X2" : live.name),
          quote: live,
        });
      }}
    >
      {line ? <span>{name}</span> : !compact ? <small>{name}</small> : null}
      <b>{price}</b>
    </button>
  );
}
