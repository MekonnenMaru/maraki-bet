import Link from "next/link";

const WINDOWS = [
  { id: "1h", label: "1H" },
  { id: "3h", label: "3H" },
  { id: "12h", label: "12H" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
];

export function WindowChips({
  current,
  hrefFor,
}: {
  current: string;
  hrefFor: (window: string) => string;
}) {
  return (
    <div className="windows">
      {WINDOWS.map((item) => (
        <Link key={item.id} href={hrefFor(item.id)} className={`chip${current === item.id ? " active" : ""}`}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}
