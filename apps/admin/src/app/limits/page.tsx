"use client";

import { SettingsCards } from "@/modules/ui/SettingsCards";

export default function LimitsPage() {
  return <SettingsCards title="Betting limits" keys={["minStake", "maxStake", "oddsTolerance", "vatInclusive", "bonusMinLegs", "bonusRate"]} />;
}
