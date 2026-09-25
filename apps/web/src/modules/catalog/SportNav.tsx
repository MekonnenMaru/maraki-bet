"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { SportDto, TournamentDto } from "@maraki/shared";
import { eatYmd, shiftEatYmd } from "@maraki/shared";
import { loadNavCatalog } from "@/lib/api";
import { useBoardFilters } from "./BoardFiltersProvider";
import { boardHref } from "./board-href";
import { SportIcon } from "./SportIcon";
import { BOARD_SPORTS, TOP_OFFERS } from "./sports";
import { useSlip } from "@/modules/slip/SlipProvider";

function groupCountries(tournaments: TournamentDto[]) {
  const groups = new Map<string, TournamentDto[]>();
  for (const tournament of tournaments) {
    const country = tournament.categoryName ?? "Other";
    const list = groups.get(country) ?? [];
    list.push(tournament);
    groups.set(country, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function normLeagueName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchesTopOffer(tournamentName: string, offerName: string) {
  return normLeagueName(tournamentName) === normLeagueName(offerName);
}

function SportNavInner() {
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setMatchId } = useSlip();
  const { selectedIds, toggleTournament, toggleTournaments, clearSelection } = useBoardFilters();
  const [sports, setSports] = useState<SportDto[]>([]);
  const [tournaments, setTournaments] = useState<TournamentDto[]>([]);
  const [openOffer, setOpenOffer] = useState(true);
  const [openSoccer, setOpenSoccer] = useState(true);
  const [openCountries, setOpenCountries] = useState<Set<string>>(() => new Set());
  const [openTime, setOpenTime] = useState(false);
  const [sportQuery, setSportQuery] = useState("");

  const windowId = searchParams.get("window") ?? "all";
  const todayIso = eatYmd();
  const tomorrowIso = shiftEatYmd(todayIso, 1);
  const todayOn = windowId === "today" || windowId === todayIso;
  const tomorrowOn = windowId === "tomorrow" || windowId === tomorrowIso;
  const allOn = windowId === "all" || !windowId;

  useEffect(() => {
    let cancelled = false;
    void loadNavCatalog("soccer").then((catalog) => {
      if (cancelled) return;
      setSports(catalog.sports);
      setTournaments(catalog.tournaments);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOpenSoccer(true);
    setOpenOffer(true);
  }, [path]);

  useEffect(() => {
    if (selectedIds.size === 0 || tournaments.length === 0) return;
    setOpenCountries((current) => {
      const merged = new Set(current);
      let changed = false;
      for (const tournament of tournaments) {
        if (!selectedIds.has(tournament.id)) continue;
        const country = tournament.categoryName ?? "Other";
        if (!merged.has(country)) {
          merged.add(country);
          changed = true;
        }
      }
      return changed ? merged : current;
    });
  }, [selectedIds, tournaments]);

  const known = new Set(sports.map((sport) => sport.slug));
  const catalog = Array.isArray(tournaments) ? tournaments : [];
  const q = sportQuery.trim().toLowerCase();
  const countries = useMemo(() => groupCountries(catalog), [catalog]);
  const visibleSports = BOARD_SPORTS.filter((sport) => !q || sport.name.toLowerCase().includes(q));
  const visibleCountries = countries
    .map(([country, items]) => {
      const leagues = items.filter(
        (item) => !q || country.toLowerCase().includes(q) || item.name.toLowerCase().includes(q),
      );
      return [country, leagues] as const;
    })
    .filter(([, items]) => items.length > 0);
  const offers = useMemo(
    () =>
      TOP_OFFERS.map((name) => {
        const matches = catalog.filter((item) => matchesTopOffer(item.name, name));
        return { name, matches };
      }).filter((offer) => offer.matches.length > 0),
    [catalog],
  );

  // URL keeps only date window (+ sport path). League multi-select lives in client state.
  const params = new URLSearchParams();
  if (windowId) params.set("window", windowId);
  const boardPath = path.startsWith("/sports/") ? path : "/";
  const homeHref = (next: Record<string, string | undefined>) => boardHref(boardPath, params, next);
  const sportHref = (slug: string, next: Record<string, string | undefined> = {}) =>
    boardHref(`/sports/${slug}`, params, next);

  function expandFor(matches: TournamentDto[]) {
    if (matches.length === 0) return;
    setOpenSoccer(true);
    setOpenCountries((current) => {
      const merged = new Set(current);
      for (const tournament of matches) merged.add(tournament.categoryName ?? "Other");
      return merged;
    });
    if (!path.startsWith("/sports/soccer")) {
      router.push(sportHref("soccer", { window: windowId || "all" }));
    }
  }

  function toggleCountry(leagues: TournamentDto[]) {
    const ids = leagues.map((item) => item.id);
    const someSelected = ids.some((id) => selectedIds.has(id));
    toggleTournaments(ids, someSelected ? "remove" : "add");
    if (!someSelected) expandFor(leagues);
  }

  function countryState(leagues: TournamentDto[]) {
    const ids = leagues.map((item) => item.id);
    const checked = ids.filter((id) => selectedIds.has(id)).length;
    if (checked === 0) return false;
    if (checked === ids.length) return true;
    return "mixed" as const;
  }

  function offerState(matches: TournamentDto[]) {
    const ids = matches.map((item) => item.id);
    const checked = ids.filter((id) => selectedIds.has(id)).length;
    if (checked === 0) return false;
    if (checked === ids.length) return true;
    return "mixed" as const;
  }

  function toggleOffer(matches: TournamentDto[]) {
    const ids = matches.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    toggleTournaments(ids, allSelected ? "remove" : "add");
    if (!allSelected) expandFor(matches);
  }

  function onToggleTournament(id: number) {
    const adding = !selectedIds.has(id);
    toggleTournament(id);
    const tournament = catalog.find((item) => item.id === id);
    if (adding && tournament) expandFor([tournament]);
  }

  return (
    <aside className="side">
      <div className="side-tools">
        <div className="match-row">
          <input
            className="match-id"
            value={sportQuery}
            onChange={(event) => {
              setSportQuery(event.target.value);
              setMatchId(event.target.value);
            }}
            placeholder="Search"
          />
          <button type="button" onClick={() => setOpenSoccer(true)}>
            Search
          </button>
        </div>
        <div className="day-btns">
          <Link href={homeHref({ window: "all" })} className={allOn ? "on" : ""}>
            All
          </Link>
          <Link href={homeHref({ window: "today" })} className={todayOn ? "on" : ""}>
            Today
          </Link>
          <Link href={homeHref({ window: "tomorrow" })} className={tomorrowOn ? "on" : ""}>
            Tomorrow
          </Link>
        </div>
        <div className="identify">
          <button type="button" onClick={() => setOpenTime((value) => !value)}>
            Filter By Time
            <span>{openTime ? "▴" : "▾"}</span>
          </button>
          {openTime && (
            <div className="identify-menu">
              {[
                { id: "1h", label: "Next 1 hour" },
                { id: "3h", label: "Next 3 hours" },
                { id: "12h", label: "Next 12 hours" },
              ].map((item) => (
                <Link key={item.id} href={homeHref({ window: item.id })}>
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        <label className="select-date">
          Select Date
          <input
            type="date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(windowId) ? windowId : ""}
            onChange={(event) => {
              if (event.target.value) {
                globalThis.location.href = homeHref({ window: event.target.value });
              }
            }}
          />
        </label>
      </div>

      <button className="side-toggle" type="button" onClick={() => setOpenOffer((value) => !value)}>
        Top Offer
        <span>{openOffer ? "▴" : "▾"}</span>
      </button>
      {openOffer && (
        <div className="offer-list">
          {offers.map((offer) => {
            const state = offerState(offer.matches);
            return (
              <label key={offer.name} className={`nav-check${state ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={state === true}
                  ref={(el) => {
                    if (el) el.indeterminate = state === "mixed";
                  }}
                  onChange={() => toggleOffer(offer.matches)}
                />
                <span>
                  {offer.name}
                  {offer.matches.length > 1 ? (
                    <small className="offer-count"> ({offer.matches.length})</small>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <Link
        href={boardHref("/", new URLSearchParams(windowId ? `window=${windowId}` : ""), {})}
        className={`sport-all${path === "/" && selectedIds.size === 0 ? " active" : ""}`}
        onClick={() => clearSelection()}
      >
        <span className="dot" />
        All Leagues
      </Link>

      <nav className="sport-list">
        {visibleSports.map((sport) => {
          const active = path === `/sports/${sport.slug}`;
          const isSoccer = sport.slug === "soccer";
          return (
            <div key={sport.slug}>
              <div className="sport-row">
                {isSoccer ? (
                  <button type="button" className="chev" onClick={() => setOpenSoccer((value) => !value)}>
                    {openSoccer ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="chev ghost">▸</span>
                )}
                <Link
                  href={sportHref(sport.slug, { window: windowId || "all" })}
                  className={`sport-link${active ? " active" : ""}${!known.has(sport.slug) ? " dim" : ""}`}
                >
                  <SportIcon name={sport.name} />
                  {sport.name}
                </Link>
              </div>
              {isSoccer && openSoccer && (
                <div className="country-list">
                  {visibleCountries.map(([country, items]) => {
                    const expanded = openCountries.has(country);
                    const state = countryState(items);
                    return (
                      <div key={country}>
                        <div className="country-row">
                          <label className={`nav-check country-check${state ? " on" : ""}`}>
                            <input
                              type="checkbox"
                              checked={state === true}
                              ref={(el) => {
                                if (el) el.indeterminate = state === "mixed";
                              }}
                              onChange={() => toggleCountry(items)}
                            />
                            <span>{country}</span>
                          </label>
                          <button
                            type="button"
                            className="country-expand"
                            onClick={() =>
                              setOpenCountries((current) => {
                                const next = new Set(current);
                                if (next.has(country)) next.delete(country);
                                else next.add(country);
                                return next;
                              })
                            }
                          >
                            {expanded ? "−" : "+"}
                          </button>
                        </div>
                        {expanded &&
                          items.map((item) => {
                            const checked = selectedIds.has(item.id);
                            return (
                              <label key={item.id} className={`nav-check league-check${checked ? " on" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => onToggleTournament(item.id)}
                                />
                                <span>{item.name}</span>
                              </label>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export function SportNav() {
  return (
    <Suspense fallback={<aside className="side" />}>
      <SportNavInner />
    </Suspense>
  );
}
