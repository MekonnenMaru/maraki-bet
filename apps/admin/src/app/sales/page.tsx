"use client";

import { Suspense } from "react";
import SalesPage from "./SalesPageClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="empty">Loading sales…</div>}>
      <SalesPage />
    </Suspense>
  );
}
