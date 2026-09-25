"use client";

import type { AdminPageDto } from "@maraki/shared";

export function TablePagination<T>({
  data,
  onPage,
  onPageSize,
}: {
  data: AdminPageDto<T>;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);

  return (
    <div className="table-pagination">
      <span className="muted">
        {data.total === 0 ? "0 results" : `${from}–${to} of ${data.total}`}
      </span>
      <label>
        Rows
        <select value={data.pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          {[10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="pager-buttons">
        <button type="button" disabled={data.page <= 1} onClick={() => onPage(1)}>
          First
        </button>
        <button type="button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          Prev
        </button>
        <span>
          Page {data.page} / {data.pageCount}
        </span>
        <button type="button" disabled={data.page >= data.pageCount} onClick={() => onPage(data.page + 1)}>
          Next
        </button>
        <button type="button" disabled={data.page >= data.pageCount} onClick={() => onPage(data.pageCount)}>
          Last
        </button>
      </div>
    </div>
  );
}
