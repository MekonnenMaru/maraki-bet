import type { ClockDto, FixtureCardDto, OutcomeQuoteDto } from "./contracts.js";

export type ClientMessage =
  | { type: "subscribe"; rooms: string[] }
  | { type: "unsubscribe"; rooms: string[] }
  | { type: "ping" };

export type ServerMessage =
  | { type: "hello"; rooms: string[] }
  | { type: "pong" }
  | {
      type: "odds";
      fixtureId: string;
      quotes: OutcomeQuoteDto[];
    }
  | {
      type: "fixture";
      fixture: FixtureCardDto;
    }
  | {
      type: "score";
      fixtureId: string;
      score: { home: number; away: number } | null;
      clock: ClockDto | null;
    };
