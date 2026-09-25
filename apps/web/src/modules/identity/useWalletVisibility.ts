"use client";

import { useEffect, useState } from "react";

const KEY = "maraki_wallet_visible";

export function useWalletVisibility() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(globalThis.localStorage.getItem(KEY) === "1");
  }, []);

  return {
    visible,
    toggle() {
      setVisible((current) => {
        const next = !current;
        globalThis.localStorage.setItem(KEY, next ? "1" : "0");
        return next;
      });
    },
  };
}
