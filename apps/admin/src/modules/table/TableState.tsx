"use client";

/** Shared empty / loading state for admin tables — keeps shell + toolbar visible. */
export function TableState({
  loading,
  empty,
  hasRows,
  children,
}: {
  loading: boolean;
  empty: string;
  hasRows: boolean;
  children: React.ReactNode;
}) {
  if (!hasRows) {
    return (
      <div className={`empty${loading ? " table-loading" : ""}`} aria-busy={loading}>
        {loading ? (
          <>
            <span className="page-loading-pulse" />
            Loading…
          </>
        ) : (
          empty
        )}
      </div>
    );
  }

  return <div className={loading ? "table-data is-loading" : undefined}>{children}</div>;
}
