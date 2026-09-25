"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatEatClock } from "@maraki/shared";
import { useAuth } from "@/modules/identity/AuthProvider";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Live" },
  { href: "/sports/soccer", label: "Games" },
  { href: "/bets", label: "My Bets" },
  { label: "Casino" },
  { label: "Aviator" },
  { label: "Fantasy" },
  { label: "Virtual Games" },
  { label: "Promotion" },
  { label: "Jackpots" },
  { label: "Apps" },
];

export function Header() {
  const path = usePathname();
  const { session, openAuth } = useAuth();
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () => setNow(formatEatClock(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="site-header">
      <div className="header-top">
        <Link href="/" className="logo" aria-label="MarakiBET.com">
          <Logo />
        </Link>
        <div className="header-end">
          <div className="site-clock">{now}</div>
          {session ? (
            <AccountMenu />
          ) : (
            <div className="auth-actions">
              <button type="button" onClick={() => openAuth("login")}>
                Login
              </button>
              <button type="button" className="primary" onClick={() => openAuth("register")}>
                Register
              </button>
            </div>
          )}
        </div>
      </div>
      <nav className="site-nav">
        {NAV.map((item) =>
          item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className={path === item.href || (item.href !== "/" && path.startsWith(item.href)) ? "on" : undefined}
            >
              {item.label}
            </Link>
          ) : (
            <span key={item.label}>{item.label}</span>
          ),
        )}
      </nav>
    </header>
  );
}
