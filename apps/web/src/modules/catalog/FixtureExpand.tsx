"use client";

import { useEffect, useMemo, useState } from "react";
import type { FixtureDetailDto, MarketOddsDto, OutcomeQuoteDto } from "@maraki/shared";
import { api } from "@/lib/api";
import { OddsButton } from "@/modules/odds/OddsButton";

const TABS = ["All", "Main Market", "Total", "Combinations", "Half Time", "Handicaps"] as const;

/** These stay open by default; everything else starts collapsed. */
function isDefaultOpen(title: string) {
  const t = title.trim().toLowerCase();
  return t === "1x2" || t === "double chance" || t === "both teams to score" || t === "total";
}

function tabFor(market: MarketOddsDto) {
  const hay = `${market.name} ${market.marketType} ${market.period ?? ""}`.toLowerCase();
  if (/handicap|spread|ah\b/.test(hay)) return "Handicaps";
  if (/half|p1|1st|first half|ht\/|halftime|half.?time/.test(hay)) return "Half Time";
  if (/total|over|under|o\/u|goal/.test(hay) && !/correct score|exact/.test(hay)) return "Total";
  if (/double|both teams|btts|combo|odd.?even|draw no bet|ht\/ft|half.?time.?full/.test(hay)) {
    return "Combinations";
  }
  if (/1x2|match winner|full time|result|moneyline/.test(hay)) return "Main Market";
  return "Main Market";
}

function periodPrefix(period: string | null | undefined) {
  if (!period) return "";
  const p = period.toLowerCase();
  if (p === "p1" || p === "1h" || p === "firsthalf") return "1st Half - ";
  if (p === "p2" || p === "2h" || p === "secondhalf") return "2nd Half - ";
  return "";
}

function marketTitle(market: MarketOddsDto, home?: string | null, away?: string | null) {
  const type = market.marketType.toLowerCase();
  const name = market.name.toLowerCase();
  const prefix = periodPrefix(market.period);
  const homeName = home ?? "Home";
  const awayName = away ?? "Away";

  if (type === "1x2" || /full time result|match result/.test(name)) {
    return prefix ? `${prefix}1X2` : "1x2";
  }
  if (type === "doublechance" || /double chance/.test(name)) {
    return `${prefix}Double chance`;
  }
  if (/both teams? to score|btts|bothteamsscore/.test(`${type} ${name}`)) {
    return `${prefix}Both teams to score`;
  }
  if (type === "totals" || /over under|total/.test(name)) {
    if (/team 1|home/.test(name)) return `${prefix}${homeName} total`;
    if (/team 2|away/.test(name)) return `${prefix}${awayName} total`;
    return `${prefix}Total`.replace(/^\s+/, "") || "Total";
  }
  if (/odd.?even/.test(name)) return `${prefix}Odd/even`;
  if (/half.?time.?full|ht\/ft|halftime\/fulltime/.test(name)) return "Halftime/Fulltime";
  if (/draw no bet|drawnobet/.test(`${type} ${name}`)) return `${prefix}Draw no bet`;
  if (/correct score/.test(name)) return `${prefix}Correct score`;

  const handicap =
    market.handicap != null && Number(market.handicap) !== 0 ? ` ${formatLine(Number(market.handicap))}` : "";
  return `${prefix}${market.name}${handicap}`.trim();
}

function formatLine(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function outcomeLabel(
  market: MarketOddsDto,
  quote: OutcomeQuoteDto,
  home?: string | null,
  away?: string | null,
) {
  const raw = quote.name.trim();
  const name = raw.toUpperCase();
  const type = market.marketType.toLowerCase();
  const marketName = market.name.toLowerCase();
  const homeName = (home ?? "Home").toUpperCase();
  const awayName = (away ?? "Away").toUpperCase();

  if (type === "doublechance" || /double chance/.test(marketName)) {
    const key = name.replace(/\s+/g, "").replace("/", "");
    if (key === "1X" || key === "X1") return `${homeName} OR DRAW`;
    if (key === "X2" || key === "2X") return `DRAW OR ${awayName}`;
    if (key === "12" || key === "21") return `${homeName} OR ${awayName}`;
  }

  if (type === "1x2" || /full time result|match result|first half result/.test(marketName)) {
    if (name === "1" || name === "HOME") return homeName;
    if (name === "2" || name === "AWAY") return awayName;
    if (name === "X" || name === "DRAW") return "DRAW";
  }

  if (type === "totals" || /over|under|total/.test(marketName)) {
    const line =
      market.handicap != null && Number(market.handicap) !== 0
        ? formatLine(Number(market.handicap))
        : raw.match(/(\d+(?:\.\d+)?)/)?.[1];
    if (/^over/i.test(raw)) return line ? `OVER ${line}` : "OVER";
    if (/^under/i.test(raw)) return line ? `UNDER ${line}` : "UNDER";
  }

  if (/both teams|btts/.test(`${type} ${marketName}`)) {
    if (name === "YES" || name === "Y") return "YES";
    if (name === "NO" || name === "N") return "NO";
  }

  if (name === "1" || name === "HOME") return homeName;
  if (name === "2" || name === "AWAY") return awayName;
  if (name === "X" || name === "DRAW") return "DRAW";
  return raw.toUpperCase();
}

function groupMarketsForDisplay(
  markets: MarketOddsDto[],
  home?: string | null,
  away?: string | null,
): Array<{
  key: string;
  title: string;
  marketType: string;
  rows: Array<{ market: MarketOddsDto; quote: OutcomeQuoteDto }>;
}> {
  const groups: Array<{
    key: string;
    title: string;
    marketType: string;
    rows: Array<{ market: MarketOddsDto; quote: OutcomeQuoteDto }>;
  }> = [];

  for (const market of markets) {
    const title = marketTitle(market, home, away);
    const isPlainTotal = title === "Total" || title === "1st Half - Total" || title === "2nd Half - Total";

    const active = market.outcomes.filter((quote) => quote.active && quote.housePrice > 1);
    if (active.length === 0) continue;

    if (isPlainTotal) {
      const existing = groups.find((group) => group.title === title && group.marketType === "totals-block");
      const rows = active.map((quote) => ({ market, quote }));
      if (existing) existing.rows.push(...rows);
      else groups.push({ key: `total:${title}`, title, marketType: "totals-block", rows });
      continue;
    }

    groups.push({
      key: String(market.marketId),
      title,
      marketType: market.marketType,
      rows: active.map((quote) => ({ market, quote })),
    });
  }

  return groups;
}

export function FixtureExpand({ fixtureId, label }: { fixtureId: string; label: string }) {
  const [detail, setDetail] = useState<FixtureDetailDto | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [search, setSearch] = useState("");
  const [error, setError] = useState(false);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(false);
    setOpenKeys(new Set());
    setDefaultsApplied(false);
    setTab("All");
    setSearch("");
    api
      .fixture(fixtureId)
      .then(setDetail)
      .catch(() => setError(true));
  }, [fixtureId]);

  const filteredMarkets = useMemo(() => {
    const list = detail?.markets ?? [];
    const q = search.trim().toLowerCase();
    const homeName = detail?.home?.name;
    const awayName = detail?.away?.name;
    return list.filter((market) => {
      if (tab !== "All" && tabFor(market) !== tab) return false;
      if (!q) return true;
      const hay = `${marketTitle(market, homeName, awayName)} ${market.outcomes.map((item) => item.name).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [detail, tab, search]);

  const home = detail?.home?.name;
  const away = detail?.away?.name;
  const displayGroups = useMemo(
    () => groupMarketsForDisplay(filteredMarkets, home, away),
    [filteredMarkets, home, away],
  );

  useEffect(() => {
    if (displayGroups.length === 0 || defaultsApplied) return;
    setOpenKeys(new Set(displayGroups.filter((group) => isDefaultOpen(group.title)).map((group) => group.key)));
    setDefaultsApplied(true);
  }, [displayGroups, defaultsApplied]);

  // While searching, open every matching group so results are visible.
  useEffect(() => {
    if (!search.trim()) return;
    setOpenKeys(new Set(displayGroups.map((group) => group.key)));
  }, [search, displayGroups]);

  function toggleGroup(key: string) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (error) return <div className="expand-empty">Could not load extra markets.</div>;
  if (!detail) return <div className="expand-empty">Loading markets...</div>;
  if (detail.markets.length === 0) return <div className="expand-empty">No priced markets for this fixture yet.</div>;

  return (
    <div className="expand">
      <div className="expand-bar">
        <div className="expand-tabs">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "on" : ""}
              onClick={() => {
                setTab(item);
                setDefaultsApplied(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="expand-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search market..."
          />
          <span>Search</span>
        </label>
      </div>
      <div className="expand-markets">
        {displayGroups.length === 0 && <div className="expand-empty">No markets in this group.</div>}
        {displayGroups.map((group) => {
          const open = openKeys.has(group.key);
          const cols = group.rows.length % 3 === 0 ? 3 : 2;
          return (
            <section key={group.key} className={`expand-market${open ? " open" : " closed"}`}>
              <button type="button" className="mkt-head" onClick={() => toggleGroup(group.key)}>
                <span>
                  {group.title}
                  <small className="mkt-count"> ({group.rows.length})</small>
                </span>
                <b aria-hidden>{open ? "−" : "+"}</b>
              </button>
              {open && (
                <div className={`mkt-grid cols-${cols}`}>
                  {group.rows.map(({ market, quote }) => (
                    <OddsButton
                      key={`${market.marketId}-${quote.outcomeId}:${quote.playerId}`}
                      line
                      fixtureId={fixtureId}
                      quote={quote}
                      label={label}
                      selectionLabel={outcomeLabel(market, quote, home, away)}
                      marketName={marketTitle(market, home, away)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
