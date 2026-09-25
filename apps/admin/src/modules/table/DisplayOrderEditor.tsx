"use client";

import { useEffect, useState } from "react";

export function DisplayOrderEditor({
  value,
  busy,
  onSave,
}: {
  value: number;
  busy?: boolean;
  onSave: (order: number) => Promise<void> | void;
}) {
  const [order, setOrder] = useState(String(value));

  useEffect(() => {
    setOrder(String(value));
  }, [value]);

  const parsed = Number(order);
  const dirty = Number.isFinite(parsed) && parsed !== value;

  return (
    <div className="drawer-action-row display-order-row">
      <label>
        Display order
        <input
          type="number"
          inputMode="numeric"
          value={order}
          disabled={busy}
          onChange={(event) => setOrder(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy || !dirty || !Number.isInteger(parsed)}
        onClick={() => void onSave(parsed)}
      >
        {busy ? "Saving…" : "Save order"}
      </button>
    </div>
  );
}
