import { statusIdFromSlug, eatDayBounds, eatYmd, shiftEatYmd, type FixtureCardDto, type SportDto, type TournamentDto } from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";
import { toFixtureCard, type FixtureWithRelations } from "./catalog.mapper.js";
import type { CatalogRepo } from "./catalog.repo.js";

export class CatalogService {
  constructor(private readonly repo: CatalogRepo) {}

  async listSports(): Promise<SportDto[]> {
    const rows = await this.repo.listSports();
    return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
  }

  async listTournaments(sportKey: string): Promise<TournamentDto[]> {
    const sport = await this.repo.getSport(sportKey);
    if (!sport) throw new HttpError(404, "Sport not found");
    const rows = await this.repo.listTournaments(sport.id);
    return rows.map((row) => ({
      id: row.id,
      sportId: row.sportId,
      slug: row.slug,
      name: row.name,
      categoryName: row.categoryName,
    }));
  }

  async listFixtures(query: {
    sport?: string;
    tournamentId?: number;
    tournamentIds?: number[];
    status?: string;
    window?: string;
    from?: string;
    to?: string;
    fixtureIds?: string[];
  }) {
    let sportId: number | undefined;
    if (query.sport) {
      const sport = await this.repo.getSport(query.sport);
      if (!sport) throw new HttpError(404, "Sport not found");
      sportId = sport.id;
    }

    const isLive = query.status === "live" || query.window === "live";
    const range = resolveWindow(query.window, query.from, query.to, { upcomingOnly: !isLive && !query.status });
    const rows = await this.repo.listFixtures({
      sportId,
      tournamentId: query.tournamentId,
      tournamentIds: query.tournamentIds,
      statusId: query.status ? statusIdFromSlug(query.status) : undefined,
      upcomingOnly: !isLive && !query.status,
      liveOnly: isLive,
      boardVisibleOnly: true,
      fixtureIds: query.fixtureIds,
      from: range.from,
      to: range.to,
    });
    return rows.map((row) => toFixtureCard(row));
  }

  async getFixture(id: string): Promise<FixtureCardDto> {
    const row = await this.repo.getFixture(id);
    if (!row) throw new HttpError(404, "Fixture not found");
    return toFixtureCard(row);
  }

  async getFixtureRow(id: string): Promise<FixtureWithRelations> {
    const row = await this.repo.getFixture(id);
    if (!row) throw new HttpError(404, "Fixture not found");
    return row;
  }
}

function resolveWindow(
  window?: string,
  from?: string,
  to?: string,
  options: { upcomingOnly?: boolean } = {},
) {
  if (from || to) {
    const parsedFrom = from ? new Date(from) : undefined;
    const now = new Date();
    return {
      from: options.upcomingOnly && parsedFrom && parsedFrom < now ? now : parsedFrom,
      to: to ? new Date(to) : undefined,
    };
  }

  const now = new Date();
  if (window === "live") return {};
  if (window === "1h") return { from: now, to: addHours(now, 1) };
  if (window === "3h") return { from: now, to: addHours(now, 3) };
  if (window === "12h") return { from: now, to: addHours(now, 12) };
  if (window === "tomorrow") {
    const bounds = eatDayBounds(shiftEatYmd(eatYmd(now), 1));
    return bounds;
  }
  if (window === "all" || !window) {
    // From now onward — no upper bound; board shows every available upcoming fixture.
    return { from: now };
  }
  if (window === "today") {
    return { from: now, to: eatDayBounds(eatYmd(now)).to };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(window)) {
    const bounds = eatDayBounds(window);
    if (options.upcomingOnly && bounds.from < now && bounds.to > now) {
      return { from: now, to: bounds.to };
    }
    if (options.upcomingOnly && bounds.to <= now) {
      return { from: now, to: now };
    }
    return bounds;
  }
  return options.upcomingOnly ? { from: now } : {};
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
