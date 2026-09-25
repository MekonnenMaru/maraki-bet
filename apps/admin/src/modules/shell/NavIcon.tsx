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
    case "overview":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "players":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
        </svg>
      );
    case "agents":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3.5 19c1.4-2.6 3.4-3.9 5.5-3.9 1.2 0 2.3.4 3.3 1.1" />
          <path d="M14 19c.8-1.6 2.1-2.5 3.7-2.5 1.3 0 2.4.5 3.3 1.5" />
        </svg>
      );
    case "shops":
      return (
        <svg {...common}>
          <path d="M4 10l2-5h12l2 5" />
          <path d="M4 10h16v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "sales":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      );
    case "staff":
      return (
        <svg {...common}>
          <path d="M12 3l8 4v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7l8-4z" />
          <path d="M9.5 12l1.8 1.8L15 10" />
        </svg>
      );
    case "fixtures":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17M3.5 12h17M6.2 6.2c2.4 2 4.8 2 7.6 0M6.2 17.8c2.4-2 4.8-2 7.6 0" />
        </svg>
      );
    case "sports":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      );
    case "tournaments":
      return (
        <svg {...common}>
          <path d="M8 4h8v3a4 4 0 01-4 4 4 4 0 01-4-4V4z" />
          <path d="M12 11v4M9 20h6M12 15a3 3 0 003 3H8a3 3 0 003-3" />
        </svg>
      );
    case "seasons":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "markets":
      return (
        <svg {...common}>
          <path d="M4 18V8l4 3 4-5 4 4 4-2v10H4z" />
        </svg>
      );
    case "sync":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 01-14.2 5" />
          <path d="M4 12a8 8 0 0114.2-5" />
          <path d="M20 5v5h-5M4 19v-5h5" />
        </svg>
      );
    case "oddspapi":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      );
    case "odds":
      return (
        <svg {...common}>
          <path d="M4 17l5-5 3.5 3.5L20 7" />
          <path d="M14 7h6v6" />
        </svg>
      );
    case "bets":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case "limits":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <circle cx="9" cy="12" r="2.5" />
          <path d="M5 7h14M5 17h14" />
        </svg>
      );
    case "wallets":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
          <circle cx="16.5" cy="14.5" r="1.4" />
        </svg>
      );
    case "deposits":
      return (
        <svg {...common}>
          <path d="M12 4v12" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "withdrawals":
      return (
        <svg {...common}>
          <path d="M12 20V8" />
          <path d="M7 13l5-5 5 5" />
          <path d="M5 4h14" />
        </svg>
      );
    case "ledger":
      return (
        <svg {...common}>
          <path d="M8 4h10a2 2 0 012 2v14H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
          <path d="M10 9h7M10 13h7M10 17h4" />
        </svg>
      );
    case "promotions":
      return (
        <svg {...common}>
          <path d="M12 3l2.2 4.6L19 8.4l-3.5 3.4.8 4.8L12 14.3 7.7 16.6l.8-4.8L5 8.4l4.8-.8L12 3z" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M5 19V9M10 19V5M15 19v-7M20 19V11" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 16l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8l1.6-1.6" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      );
    case "announcements":
      return (
        <svg {...common}>
          <path d="M4 10v4h3l5 4V6L7 10H4z" />
          <path d="M16 9.5a3.5 3.5 0 010 5M18.5 7a6.5 6.5 0 010 10" />
        </svg>
      );
    case "support":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.2 9.2a2.8 2.8 0 015.1 1.5c0 1.8-2.8 2.2-2.8 3.8M12 17.2h.01" />
        </svg>
      );
    default:
      return null;
  }
}
