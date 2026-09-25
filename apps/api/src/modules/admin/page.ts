export function parsePage(raw?: string, fallback = 1) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

export function parsePageSize(raw?: string, fallback = 20) {
  const value = Number(raw);
  if (![10, 20, 50, 100].includes(value)) return fallback;
  return value;
}

export function pageMeta(total: number, page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    total,
    page: safePage,
    pageSize,
    pageCount,
    skip: (safePage - 1) * pageSize,
  };
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number) {
  const meta = pageMeta(total, page, pageSize);
  return {
    items,
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
    pageCount: meta.pageCount,
  };
}
