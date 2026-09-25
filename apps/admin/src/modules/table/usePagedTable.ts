"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminPageDto } from "@maraki/shared";

export type TableFilters = Record<string, string>;

const EMPTY_PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
};

export function usePagedTable<T>(
  enabled: boolean,
  fetchPage: (query: { page: number; pageSize: number } & TableFilters) => Promise<AdminPageDto<T>>,
  initialFilters: TableFilters = {},
) {
  const [draft, setDraft] = useState<TableFilters>(initialFilters);
  const [applied, setApplied] = useState<TableFilters>(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<AdminPageDto<T>>(EMPTY_PAGE as AdminPageDto<T>);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => Boolean(enabled));
  const hasLoaded = useRef(false);
  const filtersKey = useMemo(() => JSON.stringify(initialFilters), [initialFilters]);

  // Keep table filters in sync when landing via related-link query params.
  useEffect(() => {
    const parsed = JSON.parse(filtersKey) as TableFilters;
    setDraft(parsed);
    setApplied(parsed);
    setPage(1);
  }, [filtersKey]);

  const queryKey = useMemo(
    () => JSON.stringify({ page, pageSize, applied }),
    [page, pageSize, applied],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchPage({ page, pageSize, ...applied }));
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load rows");
      if (!hasLoaded.current) setData(EMPTY_PAGE as AdminPageDto<T>);
    } finally {
      setLoading(false);
    }
  }, [applied, fetchPage, page, pageSize]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, queryKey, reload]);

  function setFilter(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event?: React.FormEvent) {
    event?.preventDefault();
    setApplied({ ...draft });
    setPage(1);
  }

  function resetFilters() {
    const blank = Object.fromEntries(Object.keys(initialFilters).map((key) => [key, ""])) as TableFilters;
    setDraft(blank);
    setApplied(blank);
    setPage(1);
  }

  function changePageSize(next: number) {
    setPageSize(next);
    setPage(1);
  }

  return {
    draft,
    applied,
    page,
    pageSize,
    data,
    error,
    loading,
    setError,
    setFilter,
    applyFilters,
    resetFilters,
    setPage,
    changePageSize,
    reload,
  };
}
