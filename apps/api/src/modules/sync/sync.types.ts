export const SYNC_RESOURCES = [
  "sports",
  "tournaments",
  "seasons",
  "fixtures",
  "teams",
  "markets",
  "outcomes",
  "odds",
  "scores",
] as const;

export type SyncResource = (typeof SYNC_RESOURCES)[number];

export type SyncScope = "EVERYTHING" | "SPORT" | "TOURNAMENT" | "FIXTURE";

export type SyncTrigger = "AUTOMATIC" | "MANUAL" | "SYSTEM";

export type SyncJobStatus = "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

export type IntervalUnit = "SECONDS" | "MINUTES" | "HOURS" | "DAYS" | "WEEKS";

export type ScheduleType = "INTERVAL" | "DAILY" | "WEEKLY" | "CUSTOM";

export type SyncStartInput = {
  trigger: SyncTrigger;
  scope?: SyncScope;
  scopeId?: string;
  resources?: SyncResource[];
  force?: boolean;
  startedBy?: string;
  allowWhenMasterOff?: boolean;
};

export type SyncResourceCounts = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type SyncJobResult = {
  resources: Partial<Record<SyncResource, SyncResourceCounts>>;
  fixturesSynced: number;
  oddsPriced: number;
  settled: number;
  providerConnected: boolean;
};

export const DEFAULT_RESOURCES: SyncResource[] = [
  "sports",
  "tournaments",
  "fixtures",
  "teams",
  "markets",
  "outcomes",
  "odds",
  "scores",
];
