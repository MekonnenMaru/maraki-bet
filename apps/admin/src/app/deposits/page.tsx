"use client";

import { LedgerDirectory } from "@/modules/finance/LedgerDirectory";

export default function DepositsPage() {
  return <LedgerDirectory title="Deposits" type="DEPOSIT" />;
}
