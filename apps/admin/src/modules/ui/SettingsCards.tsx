"use client";

import { useEffect, useState } from "react";
import type { AdminSettingsDto } from "@maraki/shared";
import { formatEatDateTime } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";

export function SettingsCards({
  title,
  keys,
}: {
  title: string;
  keys?: Array<keyof AdminSettingsDto>;
}) {
  const { session } = useAdminAuth();
  const [data, setData] = useState<AdminSettingsDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    adminApi
      .settings()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load settings"));
  }, [session]);

  if (!session) return null;

  const entries = data
    ? (keys ?? (Object.keys(data) as Array<keyof AdminSettingsDto>)).map((key) => [key, data[key]] as const)
    : [];

  return (
    <>
      <h1>{title}</h1>
      {error && <p className="error">{error}</p>}
      {data && (
        <section className="cards">
          {entries.map(([key, value]) => (
            <article key={key}>
              <small>{labelFor(key)}</small>
              <b>{formatValue(value)}</b>
            </article>
          ))}
        </section>
      )}
      <p className="hint">Read-only for now. Change these in `.env` and restart the API.</p>
    </>
  );
}

function labelFor(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: AdminSettingsDto[keyof AdminSettingsDto]) {
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") {
    if (value > 0 && value < 1) return `${(value * 100).toFixed(0)}%`;
    return String(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatEatDateTime(value);
  }
  return value ?? "—";
}
