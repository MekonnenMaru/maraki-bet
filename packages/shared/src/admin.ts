import type { BetReceiptDto } from "./betting";
import type { UserRole, WalletDto } from "./identity";

export type AdminPageDto<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  phone: string | null;
  role: UserRole;
  status: string;
  createdAt: string;
  bets: number;
  wallet: WalletDto;
};

export type AdminBetRow = BetReceiptDto & {
  username: string;
  userId: string;
};

export type AdminDashboardDto = {
  currency: string;
  from: string;
  to: string;
  snapshot: {
    totalUsers: number;
    activePlayers: number;
    activeAgents: number;
    openBets: number;
    liveMatches: number;
    activeSports: number;
    activeTournaments: number;
    upcomingFixtures: number;
    activeMarkets: number;
    lastSuccessfulSyncAt: string | null;
    syncHealthy: boolean;
  };
  period: {
    totalBets: number;
    volume: string;
    revenue: string;
    deposits: string;
    withdrawals: string;
  };
  recentBets: AdminBetRow[];
  recentLedger: AdminLedgerRow[];
  liveBets: AdminBetRow[];
};

export type AdminLedgerRow = {
  id: string;
  userId: string;
  username: string;
  type: string;
  amount: string;
  balanceAfter: string;
  ref: string | null;
  note: string | null;
  createdAt: string;
};

export type AdminFixtureRow = {
  id: string;
  sportName: string;
  tournamentName: string;
  home: string;
  away: string;
  startTime: string;
  statusId: number;
  statusName: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type AdminSettingsDto = {
  currency: string;
  sourceBookmaker: string;
  houseMargin: number;
  sportIds: number[];
  lastCatalogSyncAt: string | null;
  lastOddsSyncAt: string | null;
  pollEnabled: boolean;
  providerWsEnabled: boolean;
  minStake: number;
  maxStake: number;
  oddsTolerance: number;
  vatInclusive: number;
  bonusMinLegs: number;
  bonusRate: number;
};

export type AdminSportRow = {
  id: number;
  provider: string;
  name: string;
  slug: string;
  enabled: boolean;
  visible: boolean;
  displayOrder: number;
  fixtureCount: number;
  tournamentCount: number;
  seasonCount: number;
  marketCount: number;
  lastSyncedAt: string | null;
};

export type AdminTournamentRow = {
  id: number;
  provider: string;
  sportId: number;
  sportName: string;
  name: string;
  slug: string;
  categoryName: string | null;
  enabled: boolean;
  visible: boolean;
  displayOrder: number;
  fixtureCount: number;
  seasonCount: number;
  lastSyncedAt: string | null;
};

export type AdminSeasonRow = {
  seasonId: number;
  seasonName: string;
  sportId: number;
  sportName: string;
  tournamentId: number;
  tournamentName: string;
  fixtureCount: number;
};

export type AdminFixtureAdminRow = AdminFixtureRow & {
  sportId: number;
  tournamentId: number;
  seasonId: number | null;
  seasonName: string | null;
  providerStatus: string | null;
  manualStatusOverride: string | null;
  visible: boolean;
  bettingEnabled: boolean;
  lastSyncedAt: string | null;
};

export type AdminMarketRow = {
  id: number;
  provider: string;
  sportId: number;
  sportName: string;
  name: string;
  nameShort: string | null;
  marketType: string;
  period: string | null;
  enabled: boolean;
  visible: boolean;
  bettingEnabled: boolean;
  displayOrder: number;
  outcomeCount: number;
  lastSyncedAt: string | null;
};

export type AdminOddsRow = {
  fixtureId: string;
  marketId: number;
  marketName: string;
  outcomeId: number;
  outcomeName: string;
  sourceOdds: number;
  finalOdds: number;
  active: boolean;
  updatedAt: string | null;
};

export type AdminSyncStatusDto = {
  masterEnabled: boolean;
  automaticEnabled: boolean;
  scheduleType: string;
  intervalValue: number;
  intervalUnit: string;
  timezone: string;
  retryEnabled: boolean;
  maxRetries: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  schedulerRunning: boolean;
  provider: {
    connected: boolean;
    lastRequestAt: string | null;
    requestsThisProcess: number;
    apiKeyMasked: string;
    baseUrl: string;
    lastError: string | null;
  };
  runningJob: AdminSyncJobRow | null;
  health: {
    apiConnection: string;
    scheduler: string;
    lastSync: string;
    recentFailures: number;
  };
};

export type AdminOddsPapiLanguage = {
  a2: string;
  name: string;
};

export type AdminOddsPapiSubscription = {
  subscriptionId: string;
  currency: string | null;
  price: number | null;
  validFrom: string | null;
  validUntil: string | null;
  autoRenew: boolean;
  isActive: boolean;
  bookmakers: Record<string, { hasLiveOdds: boolean; hasPlayerProps: boolean }>;
  sportIds: number[];
  websocketAccess: number | null;
  requestLimit: number | null;
  rateLimit: number | null;
  requestCount: number | null;
  lastRequest: string | null;
};

export type AdminOddsPapiAccountDto = {
  apiKeyMasked: string;
  createdAt: string | null;
  languageCode: string | null;
  languageName: string | null;
  currentSubscriptionId: string | null;
  subscriptions: AdminOddsPapiSubscription[];
};

export type AdminOddsPapiRefreshKeyDto = {
  apiKey: string;
  apiKeyMasked: string;
  updatedInProcess: boolean;
  note: string;
};

export type AdminSyncProgressLogEntry = {
  at: string;
  level: "info" | "ok" | "warn" | "error";
  cmd: string;
  detail: string;
};

export type AdminSyncJobRow = {
  id: string;
  type: string;
  trigger: string;
  scope: string;
  scopeId: string | null;
  status: string;
  resources: unknown;
  progressPct: number;
  currentStep: string | null;
  progressMessage: string | null;
  progressLog: AdminSyncProgressLogEntry[];
  pauseRequested: boolean;
  cancelRequested: boolean;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage: string | null;
  result: unknown;
  startedBy: string | null;
};

export type OrgPermissionMap = Record<string, boolean>;

export const AGENT_PERMISSION_KEYS = [
  "shops.view",
  "shops.manage",
  "sales.view",
  "sales.manage",
  "reports.view",
  "wallet.credit",
] as const;

export const SHOP_PERMISSION_KEYS = [
  "sales.view",
  "sales.manage",
  "bets.accept",
  "cash.operate",
  "reports.view",
] as const;

export const SALE_PERMISSION_KEYS = [
  "bets.accept",
  "bets.void",
  "cash.deposit",
  "cash.withdraw",
  "reports.view",
] as const;

export type AdminAgentRow = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  code: string | null;
  phone: string | null;
  status: string;
  shopCount: number;
  saleCount: number;
  permissions: OrgPermissionMap;
  notes: string | null;
  wallet: WalletDto;
  createdAt: string;
};

export type AdminShopRow = {
  id: string;
  agentId: string;
  agentName: string;
  agentCode: string | null;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  saleCount: number;
  permissions: OrgPermissionMap;
  notes: string | null;
  createdAt: string;
};

export type AdminSaleRow = {
  id: string;
  shopId: string;
  shopName: string;
  agentId: string;
  agentName: string;
  userId: string;
  username: string;
  label: string;
  code: string | null;
  status: string;
  permissions: OrgPermissionMap;
  notes: string | null;
  wallet: WalletDto;
  createdAt: string;
};
