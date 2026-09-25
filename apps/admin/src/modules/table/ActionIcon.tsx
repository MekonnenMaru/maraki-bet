import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ActionIconName =
  | "view"
  | "edit"
  | "delete"
  | "deleteAll"
  | "sync"
  | "enable"
  | "disable"
  | "show"
  | "hide"
  | "betOn"
  | "betOff"
  | "shops"
  | "sales"
  | "close";

const svgProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ActionIcon({ name }: { name: ActionIconName }) {
  switch (name) {
    case "view":
      return (
        <svg {...svgProps}>
          <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "edit":
      return (
        <svg {...svgProps}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
        </svg>
      );
    case "delete":
      return (
        <svg {...svgProps}>
          <path d="M4 7h16" />
          <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
          <path d="M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case "deleteAll":
      return (
        <svg {...svgProps}>
          <path d="M3 7h18" />
          <path d="M8 7V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V7" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M10 11v5M14 11v5" />
          <path d="M19 3v4M17 5h4" />
        </svg>
      );
    case "sync":
      return (
        <svg {...svgProps}>
          <path d="M20 12a8 8 0 01-14.2 5" />
          <path d="M4 12a8 8 0 0114.2-5" />
          <path d="M20 5v5h-5M4 19v-5h5" />
        </svg>
      );
    case "enable":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 12.5l2 2 3.5-4" />
        </svg>
      );
    case "disable":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case "show":
      return (
        <svg {...svgProps}>
          <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "hide":
      return (
        <svg {...svgProps}>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-4.8" />
          <path d="M6.1 6.3C3.8 8 2.5 12 2.5 12s3.5 7 9.5 7c2 0 3.7-.6 5.1-1.5M17.7 14.2C20 12.5 21.5 12 21.5 12s-3.5-7-9.5-7c-1.1 0-2.1.2-3 .5" />
        </svg>
      );
    case "betOn":
      return (
        <svg {...svgProps}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case "betOff":
      return (
        <svg {...svgProps}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 13h5" />
          <path d="M4 4l16 16" />
        </svg>
      );
    case "shops":
      return (
        <svg {...svgProps}>
          <path d="M4 10l2-5h12l2 5" />
          <path d="M4 10h16v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "sales":
      return (
        <svg {...svgProps}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      );
    case "close":
      return (
        <svg {...svgProps}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    default:
      return null;
  }
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ActionIconName;
  label: string;
  tone?: "ghost" | "danger" | "primary";
  children?: ReactNode;
};

export function IconButton({
  icon,
  label,
  tone = "ghost",
  className = "",
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={`icon-btn ${tone}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      <ActionIcon name={icon} />
      {children ? <span className="icon-btn-label">{children}</span> : null}
    </button>
  );
}
