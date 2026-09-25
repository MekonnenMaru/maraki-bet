export default function Loading() {
  return (
    <div className="page-loading" aria-busy="true" aria-live="polite">
      <div className="page-loading-bar" />
      <div className="page-loading-card">
        <span className="page-loading-pulse" />
        <p>Loading…</p>
      </div>
    </div>
  );
}
