/** Normalize board tournament filter query (`tournamentIds` and legacy `tournamentId`). */
export function resolveTournamentIdsParam(tournamentIds?: string, tournamentId?: string) {
  const fromList = (tournamentIds ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (tournamentId?.trim() && !fromList.includes(tournamentId.trim())) {
    fromList.push(tournamentId.trim());
  }
  const unique = [...new Set(fromList.filter((id) => /^\d+$/.test(id)))];
  return unique.length > 0 ? unique.join(",") : undefined;
}

export function parseTournamentIdSet(tournamentIds?: string, tournamentId?: string) {
  const resolved = resolveTournamentIdsParam(tournamentIds, tournamentId);
  if (!resolved) return new Set<number>();
  return new Set(resolved.split(",").map(Number).filter((id) => Number.isFinite(id) && id > 0));
}

export function serializeTournamentIds(ids: Iterable<number>) {
  const unique = [...new Set([...ids].filter((id) => Number.isFinite(id) && id > 0))].sort((a, b) => a - b);
  return unique.length > 0 ? unique.join(",") : undefined;
}
