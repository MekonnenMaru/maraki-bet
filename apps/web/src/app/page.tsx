import { Suspense } from "react";
import { api } from "@/lib/api";
import { DateBar } from "@/modules/catalog/DateBar";
import { FixtureList } from "@/modules/catalog/FixtureList";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <DateBar />
      <Suspense key={params.window ?? "all"} fallback={<div className="empty">Loading matches…</div>}>
        <HomeFixtures window={params.window} />
      </Suspense>
    </>
  );
}

async function HomeFixtures({ window = "all" }: { window?: string }) {
  const fixtures = await api.fixtures({ window }).catch(() => []);
  return <FixtureList fixtures={fixtures} />;
}
