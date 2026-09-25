import { Suspense } from "react";
import { api } from "@/lib/api";
import { BannerBox } from "@/modules/catalog/BannerBox";
import { FixtureList } from "@/modules/catalog/FixtureList";

export const dynamic = "force-dynamic";

export default function LivePage() {
  return (
    <>
      <BannerBox />
      <div className="topbar">
        <div className="dates">
          <span className="active">Live</span>
        </div>
      </div>
      <Suspense fallback={<div className="empty">Loading live matches…</div>}>
        <LiveFixtures />
      </Suspense>
    </>
  );
}

async function LiveFixtures() {
  const fixtures = await api.fixtures({ status: "live" }).catch(() => []);
  return <FixtureList fixtures={fixtures} />;
}
