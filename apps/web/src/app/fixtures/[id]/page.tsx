import { api } from "@/lib/api";
import { formatEatDateTime } from "@maraki/shared";
import { OddsButton } from "@/modules/odds/OddsButton";
import { LiveOddsProvider } from "@/modules/odds/LiveOddsProvider";

export const dynamic = "force-dynamic";

export default async function FixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = await api.fixture(id);
  const label = `${fixture.home?.name ?? "Home"} - ${fixture.away?.name ?? "Away"}`;

  return (
    <LiveOddsProvider fixtureIds={[fixture.id]}>
      <div className="detail">
        <section className="scoreboard">
          <div>
            <div className="time">
              {fixture.categoryName ? `${fixture.categoryName} - ` : ""}
              {fixture.tournamentName}
            </div>
            <h1>{label}</h1>
            <div className="time">
              {fixture.status === "live" ? "Live" : formatEatDateTime(fixture.startTime)}
            </div>
          </div>
          <div className="score">{fixture.score ? `${fixture.score.home} - ${fixture.score.away}` : "vs"}</div>
        </section>
        <div className="markets">
          {fixture.markets.length === 0 && <div className="empty">No priced markets for this fixture yet.</div>}
          {fixture.markets.map((market) => (
            <section key={market.marketId} className="market">
              <h3>
                {market.name}
                {market.handicap != null && market.handicap !== 0 ? ` (${market.handicap})` : ""}
              </h3>
              <div className="odds-row">
                {market.outcomes.map((quote) => (
                  <OddsButton key={`${quote.outcomeId}:${quote.playerId}`} fixtureId={fixture.id} quote={quote} label={label} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </LiveOddsProvider>
  );
}
