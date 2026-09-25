import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import type { CatalogService } from "./catalog.service.js";
import type { OddsService } from "../odds/odds.service.js";

export function catalogRoutes(catalog: CatalogService, odds: OddsService) {
  const router = Router();

  router.get(
    "/sports",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.json({ data: await catalog.listSports() });
    }),
  );

  router.get(
    "/sports/:sport/tournaments",
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.json({ data: await catalog.listTournaments(req.params.sport) });
    }),
  );

  router.get(
    "/fixtures",
    asyncHandler(async (req, res) => {
      const status = stringQuery(req.query.status);
      const isLive = status === "live" || stringQuery(req.query.window) === "live";
      // Board lists fixtures that already have Redis odds so later kickoffs
      // (e.g. PL in October) are not dropped behind early unpriced matches.
      const fixtureIds = isLive ? undefined : await odds.listPricedFixtureIds();
      const cards = await catalog.listFixtures({
        sport: stringQuery(req.query.sport),
        tournamentId: req.query.tournamentId ? Number(req.query.tournamentId) : undefined,
        tournamentIds: parseIdList(req.query.tournamentIds),
        status,
        window: stringQuery(req.query.window),
        from: stringQuery(req.query.from),
        to: stringQuery(req.query.to),
        fixtureIds,
      });
      const attached = await odds.attachMainMarkets(cards);
      const now = Date.now();
      const visible = attached.filter((card) => {
        if (card.status === "finished" || card.status === "cancelled") return false;
        if (isLive || card.status === "live") return true;
        if (new Date(card.startTime).getTime() <= now) return false;
        return hasPricedMainMarket(card);
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ data: visible });
    }),
  );

  router.get(
    "/fixtures/:id",
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ data: await odds.getFixtureDetail(req.params.id) });
    }),
  );

  return router;
}

function stringQuery(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseIdList(value: unknown) {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value.join(",") : "";
  if (!raw.trim()) return undefined;
  const ids = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
  return ids.length > 0 ? ids : undefined;
}

function hasPricedMainMarket(card: { mainMarket: { outcomes: Array<{ active: boolean; housePrice: number }> } | null }) {
  return Boolean(
    card.mainMarket?.outcomes?.some((outcome) => outcome.active && outcome.housePrice > 1),
  );
}
