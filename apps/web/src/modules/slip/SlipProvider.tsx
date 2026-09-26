"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OutcomeQuoteDto } from "@maraki/shared";

export type SlipPick = {
  fixtureId: string;
  label: string;
  selection: string;
  marketName: string;
  quote: OutcomeQuoteDto;
};

type SlipContextValue = {
  active: number;
  setActive: (index: number) => void;
  picks: SlipPick[];
  counts: number[];
  addPick: (pick: SlipPick) => void;
  removePick: (fixtureId: string, outcomeId: number) => void;
  clearSlip: () => void;
  replacePicks: (picks: SlipPick[]) => void;
  isPicked: (fixtureId: string, outcomeId: number) => boolean;
  query: string;
  setQuery: (value: string) => void;
  matchId: string;
  setMatchId: (value: string) => void;
};

const SlipContext = createContext<SlipContextValue | null>(null);

const STORAGE_KEY = "maraki_slips_v1";
const EMPTY_SLIPS: SlipPick[][] = [[], [], []];

type StoredSlipState = {
  active: number;
  slips: SlipPick[][];
};

function isQuote(value: unknown): value is OutcomeQuoteDto {
  if (!value || typeof value !== "object") return false;
  const q = value as OutcomeQuoteDto;
  return (
    typeof q.outcomeId === "number" &&
    typeof q.playerId === "number" &&
    typeof q.marketId === "number" &&
    typeof q.housePrice === "number"
  );
}

function isPick(value: unknown): value is SlipPick {
  if (!value || typeof value !== "object") return false;
  const pick = value as SlipPick;
  return (
    typeof pick.fixtureId === "string" &&
    typeof pick.label === "string" &&
    typeof pick.selection === "string" &&
    typeof pick.marketName === "string" &&
    isQuote(pick.quote)
  );
}

function readStored(): StoredSlipState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSlipState>;
    if (!Array.isArray(parsed.slips) || parsed.slips.length !== 3) return null;
    const slips = parsed.slips.map((list) => (Array.isArray(list) ? list.filter(isPick) : []));
    const active = Number.isInteger(parsed.active) ? Math.min(2, Math.max(0, Number(parsed.active))) : 0;
    return { active, slips };
  } catch {
    return null;
  }
}

export function SlipProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const [slips, setSlips] = useState<SlipPick[][]>(EMPTY_SLIPS);
  const [query, setQuery] = useState("");
  const [matchId, setMatchId] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setActive(stored.active);
      setSlips(stored.slips);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: StoredSlipState = { active, slips };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota / private mode */
    }
  }, [active, slips, hydrated]);

  const value = useMemo<SlipContextValue>(() => {
    const picks = slips[active] ?? [];
    return {
      active,
      setActive,
      picks,
      counts: slips.map((list) => list.length),
      query,
      setQuery,
      matchId,
      setMatchId,
      isPicked: (fixtureId, outcomeId) =>
        picks.some((item) => item.fixtureId === fixtureId && item.quote.outcomeId === outcomeId),
      addPick: (pick) => {
        setSlips((current) =>
          current.map((list, index) => {
            if (index !== active) return list;
            const exists = list.some(
              (item) => item.fixtureId === pick.fixtureId && item.quote.outcomeId === pick.quote.outcomeId,
            );
            if (exists) {
              return list.filter(
                (item) => !(item.fixtureId === pick.fixtureId && item.quote.outcomeId === pick.quote.outcomeId),
              );
            }
            return [...list.filter((item) => item.fixtureId !== pick.fixtureId), pick];
          }),
        );
      },
      removePick: (fixtureId, outcomeId) => {
        setSlips((current) =>
          current.map((list, index) =>
            index === active ? list.filter((item) => !(item.fixtureId === fixtureId && item.quote.outcomeId === outcomeId)) : list,
          ),
        );
      },
      clearSlip: () => {
        setSlips((current) => current.map((list, index) => (index === active ? [] : list)));
      },
      replacePicks: (next) => {
        setSlips((current) => current.map((list, index) => (index === active ? next : list)));
      },
    };
  }, [active, query, matchId, slips]);

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip() {
  const value = useContext(SlipContext);
  if (!value) throw new Error("useSlip must be used inside SlipProvider");
  return value;
}
