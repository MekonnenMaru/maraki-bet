"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FixtureCardDto, OutcomeQuoteDto } from "@maraki/shared";
import { formatEatDate, formatEatTime } from "@maraki/shared";
import { OddsButton } from "@/modules/odds/OddsButton";
import { LiveOddsProvider, useGroupedFixtures } from "@/modules/odds/LiveOddsProvider";
import { useSlip } from "@/modules/slip/SlipProvider";
import { useBoardFilters } from "./BoardFiltersProvider";
import { FixtureExpand } from "./FixtureExpand";

function quoteByNames(outcomes: OutcomeQuoteDto[] | undefined, names: string[]) {
  return names.map((name) => {
    const wanted = name.toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
    return outcomes?.find((item) => {
      const got = item.name.toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
      if (got === wanted) return true;
      if (wanted === "1X") return got === "X1";
      if (wanted === "X2") return got === "2X";
      if (wanted === "12") return got === "21";
      return false;
    });
  });
}

function kickoff(value: string) {
  return {
    date: formatEatDate(value),
    time: formatEatTime(value),
  };
}

function isExpiredPregame(fixture: FixtureCardDto, nowMs = Date.now()) {
  if (fixture.status === "live") return false;
  return new Date(fixture.startTime).getTime() <= nowMs;
}

/** Upcoming/live fixtures that have main-market odds — hide empty/unpriced rows. */
function isBoardVisible(fixture: FixtureCardDto, nowMs = Date.now()) {
  if (fixture.status === "finished" || fixture.status === "cancelled") return false;
  if (isExpiredPregame(fixture, nowMs)) return false;
  if (!fixture.mainMarket?.outcomes?.length) return false;
  const priced = fixture.mainMarket.outcomes.some((outcome) => outcome.active && outcome.housePrice > 1);
  return priced;
}

function FixtureGroups({ fixtures }: { fixtures: FixtureCardDto[] }) {
  const { query, matchId, picks } = useSlip();
  const { selectedIds } = useBoardFilters();
  const [openId, setOpenId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = fixtures.filter((fixture) => {
    if (!isBoardVisible(fixture, nowMs)) return false;
    if (selectedIds.size > 0 && !selectedIds.has(fixture.tournamentId)) return false;
    const haystack = `${fixture.home?.name ?? ""} ${fixture.away?.name ?? ""} ${fixture.tournamentName}`.toLowerCase();
    const matchesQuery = haystack.includes(query.trim().toLowerCase());
    const matchesId = !matchId.trim() || fixture.id.toLowerCase().includes(matchId.trim().toLowerCase());
    return matchesQuery && matchesId;
  });
  const groups = useGroupedFixtures(filtered).filter((group) => group.items.length > 0);

  if (filtered.length === 0) {
    return (
      <div className="empty">
        {selectedIds.size > 0 ? "No priced matches for the selected leagues." : "No priced matches in this window."}
      </div>
    );
  }

  return (
    <div className="board">
      {groups.map((group) => (
        <section key={group.title} className="league">
          <div className="league-head">
            <b>
              {group.title} [{group.items.length}]
            </b>
            <span>1</span>
            <span>X</span>
            <span>2</span>
            <span className="dc">1X</span>
            <span className="dc">X2</span>
            <span className="dc">12</span>
            <span>+</span>
          </div>
          {group.items.map((fixture) => {
            const [one, draw, two] = quoteByNames(fixture.mainMarket?.outcomes, ["1", "X", "2"]);
            const [oneX, xTwo, oneTwo] = quoteByNames(fixture.doubleChance?.outcomes, ["1X", "X2", "12"]);
            const label = `${fixture.home?.name ?? "Home"}  -  ${fixture.away?.name ?? "Away"}`;
            const when = kickoff(fixture.startTime);
            const extra = Math.max(fixture.extraMarkets, 0);
            const boardOutcomeIds = new Set(
              [one, draw, two, oneX, xTwo, oneTwo]
                .filter((quote): quote is OutcomeQuoteDto => Boolean(quote))
                .map((quote) => quote.outcomeId),
            );
            const slipPick = picks.find((pick) => pick.fixtureId === fixture.id);
            const moreSelected = Boolean(slipPick && !boardOutcomeIds.has(slipPick.quote.outcomeId));
            return (
              <div key={fixture.id} className={openId === fixture.id ? "row-wrap open" : "row-wrap"}>
                <article className="row">
                  <Link href={`/fixtures/${fixture.id}`} className="match">
                    <span className="kick">
                      {fixture.status === "live" && <span className="live-dot" />}
                      <small>{when.date}</small>
                      <time>{when.time}</time>
                    </span>
                    <strong>{label}</strong>
                  </Link>
                  <OddsButton compact fixtureId={fixture.id} quote={one} label={label} marketName="Full Time Result" />
                  <OddsButton compact fixtureId={fixture.id} quote={draw} label={label} marketName="Full Time Result" />
                  <OddsButton compact fixtureId={fixture.id} quote={two} label={label} marketName="Full Time Result" />
                  <OddsButton
                    compact
                    className="dc"
                    fixtureId={fixture.id}
                    quote={oneX}
                    label={label}
                    marketName="Double Chance"
                    selectionLabel="1X"
                  />
                  <OddsButton
                    compact
                    className="dc"
                    fixtureId={fixture.id}
                    quote={xTwo}
                    label={label}
                    marketName="Double Chance"
                    selectionLabel="X2"
                  />
                  <OddsButton
                    compact
                    className="dc"
                    fixtureId={fixture.id}
                    quote={oneTwo}
                    label={label}
                    marketName="Double Chance"
                    selectionLabel="12"
                  />
                  <button
                    type="button"
                    className={moreSelected ? "more on" : "more"}
                    title={moreSelected ? `Selected: ${slipPick?.selection}` : undefined}
                    onClick={() => setOpenId((current) => (current === fixture.id ? null : fixture.id))}
                  >
                    +{extra}
                  </button>
                </article>
                {openId === fixture.id && <FixtureExpand fixtureId={fixture.id} label={label} />}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function FixtureList({ fixtures: initial }: { fixtures: FixtureCardDto[] }) {
  const visible = initial.filter((fixture) => isBoardVisible(fixture));
  const [fixtures, setFixtures] = useState(visible);

  useEffect(() => {
    setFixtures(initial.filter((fixture) => isBoardVisible(fixture)));
  }, [initial]);

  return (
    <LiveOddsProvider fixtureIds={fixtures.map((fixture) => fixture.id)}>
      <FixtureGroups fixtures={fixtures} />
    </LiveOddsProvider>
  );
}
