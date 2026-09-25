import type { FixtureStatus } from "./status.js";

export type SportDto = {
  id: number;
  slug: string;
  name: string;
};

export type TournamentDto = {
  id: number;
  sportId: number;
  slug: string;
  name: string;
  categoryName: string | null;
};

export type ParticipantDto = {
  id: number;
  name: string;
  shortName: string | null;
  abbr: string | null;
};

export type ScoreDto = {
  period: string;
  home: number;
  away: number;
};

export type ClockDto = {
  currentPeriod: string | null;
  currentTime: string | null;
  remainingTime: string | null;
  stopped: boolean | null;
};

export type OutcomeQuoteDto = {
  outcomeId: number;
  playerId: number;
  marketId: number;
  name: string;
  sourcePrice: number;
  housePrice: number;
  active: boolean;
  changedAt: number;
};

export type FixtureCardDto = {
  id: string;
  sportId: number;
  sportName: string;
  tournamentId: number;
  tournamentName: string;
  categoryName: string | null;
  seasonName: string | null;
  home: ParticipantDto | null;
  away: ParticipantDto | null;
  startTime: string;
  status: FixtureStatus;
  statusId: number;
  venueName: string | null;
  score: { home: number; away: number } | null;
  clock: ClockDto | null;
  mainMarket: {
    marketId: number;
    name: string;
    marketType: string;
    outcomes: OutcomeQuoteDto[];
  } | null;
  /** Full-time Double Chance (1X / X2 / 12), when available or derived from 1X2. */
  doubleChance: {
    marketId: number;
    name: string;
    marketType: string;
    outcomes: OutcomeQuoteDto[];
  } | null;
  extraMarkets: number;
};

export type MarketOddsDto = {
  marketId: number;
  name: string;
  nameShort: string | null;
  marketType: string;
  period: string | null;
  handicap: number | null;
  playerProp: boolean;
  outcomes: OutcomeQuoteDto[];
};

export type FixtureDetailDto = FixtureCardDto & {
  scores: ScoreDto[];
  markets: MarketOddsDto[];
};

export type MetaDto = {
  sourceBookmaker: string;
  houseMargin: number;
  sportIds: number[];
  providerWsEnabled: boolean;
  lastCatalogSyncAt: string | null;
  lastOddsSyncAt: string | null;
  pollEnabled: boolean;
};
