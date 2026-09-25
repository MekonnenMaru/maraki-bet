export function boardHref(
  pathname: string,
  search: URLSearchParams,
  next: Record<string, string | undefined>,
) {
  const params = new URLSearchParams(search.toString());
  for (const [key, value] of Object.entries(next)) {
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
