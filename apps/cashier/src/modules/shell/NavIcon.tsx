import type { NavIconId } from "./nav";

export function NavIcon({ name }: { name: NavIconId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "place":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h10M4 18h16M4 21h10" />
        </svg>
      );
    case "tickets":
      return (
        <svg {...common}>
          <path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 00-2 2 2 2 0 002 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 002-2 2 2 0 00-2-2V8z" />
          <path d="M12 8v12" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
  }
}
