import { Suspense } from "react";
import { api } from "@/lib/api";
import { DateBar } from "@/modules/catalog/DateBar";
import { FixtureList } from "@/modules/catalog/FixtureList";

export const dynamic = "force-dynamic";

export default async function SportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  return (
    <>
      <DateBar />
      <Suspense
        key={`${slug}-${query.window ?? "all"}`}
        fallback={<div className="empty">Loading matches…</div>}
      >
        <SportFixtures slug={slug} window={query.window} />
      </Suspense>
    </>
  );
}

async function SportFixtures({ slug, window = "all" }: { slug: string; window?: string }) {
  const fixtures = await api.fixtures({ sport: slug, window }).catch(() => []);
  return <FixtureList fixtures={fixtures} />;
}
