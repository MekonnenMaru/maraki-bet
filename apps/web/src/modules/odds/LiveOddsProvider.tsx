"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OutcomeQuoteDto, ServerMessage } from "@maraki/shared";

type QuoteMap = Record<string, OutcomeQuoteDto>;

const LiveOddsContext = createContext<Record<string, QuoteMap>>({});

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

export function LiveOddsProvider({
  fixtureIds,
  children,
}: {
  fixtureIds: string[];
  children: React.ReactNode;
}) {
  const [odds, setOdds] = useState<Record<string, QuoteMap>>({});

  useEffect(() => {
    if (fixtureIds.length === 0) return;
    const socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "subscribe",
          rooms: ["all", ...fixtureIds.map((id) => `fixture:${id}`)],
        }),
      );
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type !== "odds") return;
      setOdds((current) => {
        const next = { ...current, [message.fixtureId]: { ...current[message.fixtureId] } };
        for (const quote of message.quotes) {
          next[message.fixtureId][`${quote.outcomeId}:${quote.playerId}`] = quote;
        }
        return next;
      });
    };
    return () => socket.close();
  }, [fixtureIds.join(",")]);

  return <LiveOddsContext.Provider value={odds}>{children}</LiveOddsContext.Provider>;
}

export function useLiveQuote(fixtureId: string, outcomeId: number, playerId: number) {
  const odds = useContext(LiveOddsContext);
  return odds[fixtureId]?.[`${outcomeId}:${playerId}`];
}

export function useGroupedFixtures<T extends { tournamentId: number; tournamentName: string; categoryName: string | null }>(
  fixtures: T[],
) {
  return useMemo(() => {
    const groups = new Map<number, { title: string; items: T[] }>();
    for (const fixture of fixtures) {
      const current = groups.get(fixture.tournamentId) ?? {
        title: fixture.categoryName ? `${fixture.categoryName} - ${fixture.tournamentName}` : fixture.tournamentName,
        items: [],
      };
      current.items.push(fixture);
      groups.set(fixture.tournamentId, current);
    }
    return [...groups.values()];
  }, [fixtures]);
}
