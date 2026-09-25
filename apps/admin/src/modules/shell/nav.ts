export type NavIconId =
  | "overview"
  | "players"
  | "agents"
  | "shops"
  | "sales"
  | "staff"
  | "sports"
  | "tournaments"
  | "seasons"
  | "fixtures"
  | "markets"
  | "odds"
  | "sync"
  | "bets"
  | "limits"
  | "wallets"
  | "deposits"
  | "withdrawals"
  | "ledger"
  | "promotions"
  | "reports"
  | "settings"
  | "oddspapi"
  | "audit"
  | "announcements"
  | "support";

export const OFFICE_NAV: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: NavIconId }>;
}> = [
  {
    label: "Dashboard",
    items: [{ href: "/", label: "Overview", icon: "overview" }],
  },
  {
    label: "Sports",
    items: [
      { href: "/sports", label: "Sports", icon: "sports" },
      { href: "/tournaments", label: "Tournaments", icon: "tournaments" },
      { href: "/seasons", label: "Seasons", icon: "seasons" },
      { href: "/fixtures", label: "Fixtures", icon: "fixtures" },
      { href: "/markets", label: "Markets", icon: "markets" },
      { href: "/odds", label: "Odds", icon: "odds" },
      { href: "/sync", label: "Sync", icon: "sync" },
    ],
  },
  {
    label: "Betting",
    items: [
      { href: "/bets", label: "Bets", icon: "bets" },
      { href: "/limits", label: "Risk & Limits", icon: "limits" },
    ],
  },
  {
    label: "Users",
    items: [
      { href: "/players", label: "Players", icon: "players" },
      { href: "/agents", label: "Agents", icon: "agents" },
      { href: "/shops", label: "Shops", icon: "shops" },
      { href: "/sales", label: "Sales", icon: "sales" },
      { href: "/staff", label: "Admins", icon: "staff" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/wallets", label: "Wallets", icon: "wallets" },
      { href: "/deposits", label: "Deposits", icon: "deposits" },
      { href: "/withdrawals", label: "Withdrawals", icon: "withdrawals" },
      { href: "/ledger", label: "Transactions", icon: "ledger" },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/promotions", label: "Promotions", icon: "promotions" },
      { href: "/reports", label: "Reports", icon: "reports" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/oddspapi", label: "OddsPapi", icon: "oddspapi" },
      { href: "/settings", label: "General Settings", icon: "settings" },
      { href: "/audit", label: "Audit Logs", icon: "audit" },
      { href: "/announcements", label: "Notifications", icon: "announcements" },
      { href: "/support", label: "Support", icon: "support" },
    ],
  },
];

export function navIsOn(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}
