"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { parseTournamentIdSet, serializeTournamentIds } from "./tournament-filter";

const STORAGE_KEY = "maraki.board.tournamentIds";

type BoardFiltersContextValue = {
  selectedIds: Set<number>;
  selectedParam: string | undefined;
  setSelectedIds: (ids: Set<number>) => void;
  toggleTournament: (id: number) => void;
  toggleTournaments: (ids: number[], mode?: "add" | "remove" | "toggle-all") => void;
  clearSelection: () => void;
};

const BoardFiltersContext = createContext<BoardFiltersContextValue | null>(null);

function readStoredIds() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set<number>();
    return parseTournamentIdSet(raw);
  } catch {
    return new Set<number>();
  }
}

function writeStoredIds(ids: Set<number>) {
  try {
    const value = serializeTournamentIds(ids);
    if (!value) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function BoardFiltersProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIdsState] = useState<Set<number>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Prefer session selection; one-time migrate legacy URL tournamentIds then strip them.
    const fromUrl = parseTournamentIdSet(
      new URLSearchParams(globalThis.location.search).get("tournamentIds") ?? undefined,
      new URLSearchParams(globalThis.location.search).get("tournamentId") ?? undefined,
    );
    const fromStore = readStoredIds();
    const initial = fromUrl.size > 0 ? fromUrl : fromStore;
    setSelectedIdsState(initial);
    writeStoredIds(initial);
    setReady(true);

    if (fromUrl.size > 0) {
      const url = new URL(globalThis.location.href);
      url.searchParams.delete("tournamentIds");
      url.searchParams.delete("tournamentId");
      const next = `${url.pathname}${url.search}${url.hash}`;
      globalThis.history.replaceState(globalThis.history.state, "", next);
    }
  }, []);

  const setSelectedIds = useCallback((ids: Set<number>) => {
    const next = new Set([...ids].filter((id) => Number.isFinite(id) && id > 0));
    setSelectedIdsState(next);
    writeStoredIds(next);
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [setSelectedIds]);

  const toggleTournament = useCallback(
    (id: number) => {
      setSelectedIdsState((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeStoredIds(next);
        return next;
      });
    },
    [],
  );

  const toggleTournaments = useCallback((ids: number[], mode: "add" | "remove" | "toggle-all" = "toggle-all") => {
    setSelectedIdsState((current) => {
      const next = new Set(current);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (mode === "add" || (mode === "toggle-all" && !allSelected)) {
        for (const id of ids) next.add(id);
      } else {
        for (const id of ids) next.delete(id);
      }
      writeStoredIds(next);
      return next;
    });
  }, []);

  const value = useMemo<BoardFiltersContextValue>(
    () => ({
      selectedIds: ready ? selectedIds : new Set(),
      selectedParam: serializeTournamentIds(ready ? selectedIds : []),
      setSelectedIds,
      toggleTournament,
      toggleTournaments,
      clearSelection,
    }),
    [ready, selectedIds, setSelectedIds, toggleTournament, toggleTournaments, clearSelection],
  );

  return <BoardFiltersContext.Provider value={value}>{children}</BoardFiltersContext.Provider>;
}

export function useBoardFilters() {
  const value = useContext(BoardFiltersContext);
  if (!value) throw new Error("useBoardFilters must be used within BoardFiltersProvider");
  return value;
}
