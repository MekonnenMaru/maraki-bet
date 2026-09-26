export type NavIconId = "overview" | "place" | "tickets";

export const OFFICE_NAV: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: NavIconId }>;
}> = [
  {
    label: "Dashboard",
    items: [{ href: "/", label: "Overview", icon: "overview" }],
  },
  {
    label: "Cash desk",
    items: [
      { href: "/place", label: "Place ticket", icon: "place" },
      { href: "/tickets", label: "My tickets", icon: "tickets" },
    ],
  },
];

export function navIsOn(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}
