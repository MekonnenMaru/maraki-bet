"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

/** Merge current URL query into table filter defaults (updates when the URL changes). */
export function useUrlFilters(defaults: Record<string, string>) {
  const search = useSearchParams();
  const defaultsKey = JSON.stringify(defaults);
  return useMemo(() => {
    const base = JSON.parse(defaultsKey) as Record<string, string>;
    const next = { ...base };
    for (const key of Object.keys(base)) {
      const value = search.get(key);
      next[key] = value != null && value !== "" ? value : (base[key] ?? "");
    }
    return next;
  }, [search, defaultsKey]);
}
