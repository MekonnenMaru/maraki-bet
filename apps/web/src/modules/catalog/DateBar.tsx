"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { eatUpcomingWeekChips, eatYmd } from "@maraki/shared";
import { BannerBox } from "./BannerBox";
import { boardHref } from "./board-href";
import { SearchBox } from "./SearchBox";

function DateBarInner() {
  const path = usePathname();
  const searchParams = useSearchParams();
  const [chips] = useState(() => eatUpcomingWeekChips());
  const todayIso = eatYmd();
  const current = searchParams.get("window") ?? "all";
  const search = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  return (
    <>
      <BannerBox />
      <div className="topbar">
        <div className="dates">
          {chips.map((item) => {
            const active =
              current === item.id ||
              (current === "today" && item.id === todayIso) ||
              (current === "all" && item.id === "all");
            return (
              <Link
                key={item.id}
                href={boardHref(path, search, { window: item.id })}
                className={active ? "active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <SearchBox />
      </div>
    </>
  );
}

export function DateBar() {
  return (
    <Suspense fallback={<BannerBox />}>
      <DateBarInner />
    </Suspense>
  );
}
