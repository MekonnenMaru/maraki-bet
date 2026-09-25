"use client";

import { Suspense } from "react";
import ShopsPage from "./ShopsPageClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="empty">Loading shops…</div>}>
      <ShopsPage />
    </Suspense>
  );
}
