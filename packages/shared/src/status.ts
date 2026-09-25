export const FIXTURE_STATUS = {
  0: "pregame",
  1: "live",
  2: "finished",
  3: "cancelled",
} as const;

export type FixtureStatus = (typeof FIXTURE_STATUS)[keyof typeof FIXTURE_STATUS];

export function statusFromId(statusId: number): FixtureStatus {
  return FIXTURE_STATUS[statusId as keyof typeof FIXTURE_STATUS] ?? "pregame";
}

export function statusIdFromSlug(status: string): number | undefined {
  const entry = Object.entries(FIXTURE_STATUS).find(([, slug]) => slug === status);
  return entry ? Number(entry[0]) : undefined;
}
