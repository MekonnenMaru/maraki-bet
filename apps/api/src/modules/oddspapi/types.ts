export type OddsPapiLanguage = {
  a2: string;
  name: string;
};

export type OddsPapiAccountSubscription = {
  subscription_id: string;
  currency?: string | null;
  price?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  auto_renew?: boolean;
  is_active?: boolean;
  created_at?: string | null;
  bookmakers?: Record<string, { has_live_odds?: boolean; has_player_props?: boolean }>;
  sport_ids?: number[];
  websocket_access?: number | null;
  request_limit?: number | null;
  rate_limit?: number | null;
  request_count?: number | null;
  last_request?: string | null;
};

export type OddsPapiAccount = {
  api_key?: string;
  created_at?: string | null;
  language_code?: string | null;
  language_name?: string | null;
  current_subscription_id?: string | null;
  subscriptions?: OddsPapiAccountSubscription[];
};

export type OddsPapiSport = {
  sportId: number;
  slug?: string;
  sportSlug?: string;
  sportName: string;
};

export type OddsPapiTournament = {
  tournamentId: number;
  sportId: number;
  tournamentSlug?: string;
  categorySlug?: string | null;
  tournamentName: string;
  categoryName?: string | null;
  upcomingFixtures?: number;
  liveFixtures?: number;
  futureFixtures?: number;
};

export type OddsPapiBookmaker = {
  slug: string;
  bookmakerName: string;
  active: boolean;
  websocketPregame?: boolean | null;
  websocketLive?: boolean | null;
};

export type OddsPapiMarketOutcome = {
  outcomeId: number;
  outcomeName?: string | null;
};

export type OddsPapiMarket = {
  marketId: number;
  sportId?: number | null;
  marketType?: string | null;
  period?: string | null;
  marketLength?: number | null;
  playerProp?: boolean | null;
  handicap?: number | null;
  marketName?: string | null;
  marketNameShort?: string | null;
  outcomes?: OddsPapiMarketOutcome[];
};

export type OddsPapiParticipants = {
  participant1Id: number;
  participant1Name?: string | null;
  participant1ShortName?: string | null;
  participant1Abbr?: string | null;
  participant2Id: number;
  participant2Name?: string | null;
  participant2ShortName?: string | null;
  participant2Abbr?: string | null;
};

export type OddsPapiScore = {
  period: string;
  participant1Score: number;
  participant2Score: number;
  updatedAt?: string;
};

export type OddsPapiClock = {
  currentPeriod?: string | null;
  currentTime?: string | null;
  remainingTime?: string | null;
  remainingTimeInPeriod?: string | null;
  stopped?: boolean | null;
};

export type OddsPapiQuote = {
  bookmaker: string;
  outcomeId: number;
  playerId: number;
  price: number;
  active: boolean;
  marketActive?: boolean | null;
  mainLine?: boolean | null;
  marketId: number;
  changedAt: number;
  limit?: number | null;
};

export type OddsMap = Record<string, OddsPapiQuote>;
export type OddsByBookmaker = Record<string, OddsMap>;

export type OddsPapiBookmakerMeta = {
  bookmaker: string;
  hasOdds: boolean;
  staleOdds: boolean;
  suspended: boolean;
  participantsRotated: boolean;
};

export type OddsPapiFixture = {
  fixtureId: string;
  status: {
    live: boolean;
    statusId: number;
    statusName: string;
  };
  sport: {
    sportId: number;
    sportName: string;
    slug?: string;
  };
  tournament: {
    tournamentId: number;
    tournamentName: string;
    tournamentSlug?: string;
    categoryName?: string | null;
    categorySlug?: string | null;
  };
  season?: {
    seasonId?: number | null;
    seasonName?: string | null;
  } | null;
  venue?: {
    venueName?: string | null;
  } | null;
  startTime: number;
  participants: OddsPapiParticipants;
  scores?: Record<string, OddsPapiScore> | null;
  clock?: OddsPapiClock | null;
  hasOdds?: boolean;
  odds?: OddsByBookmaker;
  bookmakers?: Record<string, OddsPapiBookmakerMeta>;
};

export type OddsPapiWsEnvelope = {
  channel?: string;
  type?: string;
  payload?: unknown;
  ts?: number;
  entryId?: string;
  serverEpoch?: string;
  lastSeenId?: Record<string, string>;
  access?: { live?: boolean; pregame?: boolean };
  message?: string;
  reason?: string;
};

export type V4Price = {
  active?: boolean;
  price?: number;
  changedAt?: string;
  mainLine?: boolean;
  limit?: number | null;
  playerName?: string | null;
};

export type V4BookmakerOdds = Record<
  string,
  {
    bookmakerIsActive?: boolean;
    suspended?: boolean;
    markets?: Record<
      string,
      {
        marketActive?: boolean;
        outcomes?: Record<string, { players?: Record<string, V4Price> }>;
      }
    >;
  }
>;

export type V4Fixture = {
  fixtureId: string;
  participant1Id: number;
  participant2Id: number;
  sportId: number;
  tournamentId: number;
  seasonId?: number | null;
  statusId: number;
  hasOdds?: boolean;
  /** Scheduled kickoff — OddsPapi returns UTC ISO 8601 (or epoch). */
  startTime: string | number;
  /** Actual kickoff when it differs from scheduled (also UTC). */
  trueStartTime?: string | number | null;
  statusName?: string;
  participant1Name?: string | null;
  participant1ShortName?: string | null;
  participant1Abbr?: string | null;
  participant2Name?: string | null;
  participant2ShortName?: string | null;
  participant2Abbr?: string | null;
  sportName?: string;
  tournamentSlug?: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  tournamentName?: string;
  bookmakerOdds?: V4BookmakerOdds;
};
