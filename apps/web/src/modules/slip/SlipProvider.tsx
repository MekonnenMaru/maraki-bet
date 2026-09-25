"use client";

import { createContext, useContext, useMemo, useState } from "react";
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
  isPicked: (fixtureId: string, outcomeId: number) => boolean;
  query: string;
  setQuery: (value: string) => void;
  matchId: string;
  setMatchId: (value: string) => void;
};

const SlipContext = createContext<SlipContextValue | null>(null);

export function SlipProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const [slips, setSlips] = useState<SlipPick[][]>([[], [], []]);
  const [query, setQuery] = useState("");
  const [matchId, setMatchId] = useState("");

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
    };
  }, [active, query, matchId, slips]);

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip() {
  const value = useContext(SlipContext);
  if (!value) throw new Error("useSlip must be used inside SlipProvider");
  return value;
}
