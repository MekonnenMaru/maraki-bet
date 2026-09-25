export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="panel">
        <p className="empty">{note}</p>
      </div>
    </>
  );
}
