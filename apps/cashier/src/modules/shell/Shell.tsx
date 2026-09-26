"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { NavIcon } from "./NavIcon";
import { NavPendingProvider, SoftLink, useNavPending } from "./NavPending";
import { OFFICE_NAV, navIsOn } from "./nav";

const COLLAPSE_KEY = "maraki_cashier_nav_collapsed";
const GROUP_COLLAPSE_KEY = "maraki_cashier_nav_groups";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <NavPendingProvider>
      <ShellInner>{children}</ShellInner>
    </NavPendingProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session, ready, error, login, logout } = useAuth();
  const { pending } = useNavPending();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [groupsReady, setGroupsReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      const raw = localStorage.getItem(GROUP_COLLAPSE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") setClosedGroups(parsed);
      }
    } catch {
      /* ignore */
    } finally {
      setGroupsReady(true);
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  useEffect(() => {
    if (!groupsReady) return;
    const active = OFFICE_NAV.find((group) => group.items.some((item) => navIsOn(path, item.href)));
    if (!active) return;
    setClosedGroups((current) => {
      if (!current[active.label]) return current;
      const next = { ...current, [active.label]: false };
      try {
        localStorage.setItem(GROUP_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [path, groupsReady]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleGroup(label: string) {
    setClosedGroups((current) => {
      const next = { ...current, [label]: !current[label] };
      try {
        localStorage.setItem(GROUP_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function isGroupOpen(label: string) {
    return !closedGroups[label];
  }

  if (!ready) return <div className="boot">Starting…</div>;

  if (!session) {
    return (
      <main className="login-screen">
        <form
          className="login-card"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await login(username, password);
            } catch {
              /* shown via error */
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="login-mark">
            <span className="brand-badge">M</span>
            <div>
              <p className="login-kicker">cashier.marakibet.com</p>
              <h1>Maraki Cashier</h1>
            </div>
          </div>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className={`office${collapsed ? " nav-collapsed" : ""}${mobileOpen ? " nav-open" : ""}`}>
      <button type="button" className="nav-backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
      <aside className="office-nav" aria-label="Cashier navigation">
        <div className="nav-top">
          <div className="brand">
            <span className="brand-badge">M</span>
            <div className="brand-copy">
              <strong>Maraki</strong>
              <span>Cash Desk</span>
            </div>
          </div>
          <button type="button" className="nav-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
            ×
          </button>
        </div>
        <nav className="nav-scroll">
          {OFFICE_NAV.map((group) => {
            const open = isGroupOpen(group.label);
            const hasActive = group.items.some((item) => navIsOn(path, item.href));
            return (
              <div
                key={group.label}
                className={`nav-group${open ? " is-open" : " is-closed"}${hasActive ? " has-active" : ""}`}
              >
                <button
                  type="button"
                  className="nav-group-toggle"
                  aria-expanded={open}
                  title={open ? `Collapse ${group.label}` : `Expand ${group.label}`}
                  onClick={() => toggleGroup(group.label)}
                >
                  <span className="nav-group-label">{group.label}</span>
                  <span className="nav-group-chevron" aria-hidden>
                    ▾
                  </span>
                </button>
                <div className="nav-group-items">
                  {group.items.map((item) => (
                    <SoftLink
                      key={item.href}
                      href={item.href}
                      className={`nav-link${navIsOn(path, item.href) ? " on" : ""}`}
                      title={item.label}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className="nav-ico">
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="nav-text">{item.label}</span>
                    </SoftLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="nav-foot">
          <div className="nav-user-chip" title={session.user.username}>
            <span className="nav-avatar">{session.user.username.slice(0, 1).toUpperCase()}</span>
            <div className="nav-user-copy">
              <strong>{session.user.username}</strong>
              <span>{session.desk.shopName}</span>
            </div>
          </div>
          <button type="button" className="nav-logout" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      </aside>
      <div className="office-main">
        <header className="office-head">
          <div className="office-head-left">
            <button
              type="button"
              className="nav-toggle"
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              aria-expanded={!collapsed || mobileOpen}
              onClick={() => {
                if (window.matchMedia("(max-width: 900px)").matches) {
                  setMobileOpen((open) => !open);
                } else {
                  toggleCollapsed();
                }
              }}
            >
              <span />
              <span />
              <span />
            </button>
            <div className="office-title-wrap">
              <strong className="office-title">Maraki Cashier</strong>
              <span className="office-sub">
                {session.desk.label}
                {session.desk.agentName ? ` · ${session.desk.agentName}` : ""}
              </span>
            </div>
          </div>
        </header>
        <div className={`office-body${pending ? " is-route-loading" : ""}`} aria-busy={pending}>
          {children}
        </div>
      </div>
    </div>
  );
}
