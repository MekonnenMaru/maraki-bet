import { statusFromId, type ClockDto, type FixtureCardDto, type ParticipantDto } from "@maraki/shared";
import type { Fixture, Participant, Sport, Tournament } from "@prisma/client";
import type { OddsPapiClock, OddsPapiFixture, OddsPapiParticipants, OddsPapiScore } from "../oddspapi/types.js";

export type FixtureWithRelations = Fixture & {
  sport: Sport;
  tournament: Tournament;
  home: Participant | null;
  away: Participant | null;
};

export function mapParticipantDto(row: Participant | null): ParticipantDto | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    abbr: row.abbr,
  };
}

export function toFixtureCard(row: FixtureWithRelations): FixtureCardDto {
  return {
    id: row.id,
    sportId: row.sportId,
    sportName: row.sport.name,
    tournamentId: row.tournamentId,
    tournamentName: row.tournament.name,
    categoryName: row.tournament.categoryName,
    seasonName: row.seasonName,
    home: mapParticipantDto(row.home),
    away: mapParticipantDto(row.away),
    startTime: row.startTime.toISOString(),
    status: statusFromId(row.statusId),
    statusId: row.statusId,
    venueName: row.venueName,
    score:
      row.homeScore != null && row.awayScore != null
        ? { home: row.homeScore, away: row.awayScore }
        : null,
    clock: (row.clockJson as ClockDto | null) ?? null,
    mainMarket: null,
    doubleChance: null,
    extraMarkets: 0,
  };
}

export function extractScores(scores?: Record<string, OddsPapiScore> | null) {
  const rows = Object.values(scores ?? {});
  const result = rows.find((row) => row.period === "result") ?? rows[0];
  return {
    homeScore: result?.participant1Score ?? null,
    awayScore: result?.participant2Score ?? null,
    scoresJson: rows.map((row) => ({
      period: row.period,
      home: row.participant1Score,
      away: row.participant2Score,
    })),
  };
}

export function extractClock(clock?: OddsPapiClock | null): ClockDto | null {
  if (!clock) return null;
  return {
    currentPeriod: clock.currentPeriod ?? null,
    currentTime: clock.currentTime ?? null,
    remainingTime: clock.remainingTime ?? clock.remainingTimeInPeriod ?? null,
    stopped: clock.stopped ?? null,
  };
}

export function participantsFromFixture(participants: OddsPapiParticipants) {
  return [
    {
      id: participants.participant1Id,
      name: participants.participant1Name ?? `Team ${participants.participant1Id}`,
      shortName: participants.participant1ShortName ?? null,
      abbr: participants.participant1Abbr ?? null,
    },
    {
      id: participants.participant2Id,
      name: participants.participant2Name ?? `Team ${participants.participant2Id}`,
      shortName: participants.participant2ShortName ?? null,
      abbr: participants.participant2Abbr ?? null,
    },
  ];
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    || "unknown";
}

export function startTimeFromEpoch(epochSeconds: number) {
  // Absolute UTC instant from OddsPapi epoch/ISO — do not apply EAT here.
  return new Date(epochSeconds * 1000);
}

export function isTrackedSport(fixture: OddsPapiFixture, sportIds: number[]) {
  return sportIds.includes(fixture.sport.sportId);
}
