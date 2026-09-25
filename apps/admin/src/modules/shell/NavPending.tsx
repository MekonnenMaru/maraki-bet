"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useTransition,
  type ComponentProps,
} from "react";

type NavPendingValue = {
  pending: boolean;
};

const NavPendingContext = createContext<NavPendingValue>({ pending: false });

export function NavPendingProvider({ children }: { children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();

  return (
    <NavPendingContext.Provider value={{ pending }}>
      <StartTransitionContext.Provider value={startTransition}>
        <div className={`route-progress${pending ? " on" : ""}`} aria-hidden={!pending} />
        {children}
      </StartTransitionContext.Provider>
    </NavPendingContext.Provider>
  );
}

const StartTransitionContext = createContext<(cb: () => void) => void>((cb) => cb());

export function useNavPending() {
  return useContext(NavPendingContext);
}

export function SoftLink({ href, onClick, replace, scroll, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const router = useRouter();
  const startTransition = useContext(StartTransitionContext);
  const hrefString = typeof href === "string" ? href : href.pathname ?? "";

  return (
    <Link
      href={href}
      prefetch
      replace={replace}
      scroll={scroll}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        if (!hrefString) return;
        const next = new URL(hrefString, "http://local");
        const samePath = next.pathname === pathname;
        const sameQuery =
          typeof window !== "undefined" && next.search === window.location.search;
        if (samePath && sameQuery) return;
        event.preventDefault();
        startTransition(() => {
          if (replace) router.replace(hrefString, { scroll: scroll ?? true });
          else router.push(hrefString, { scroll: scroll ?? true });
        });
      }}
      {...props}
    />
  );
}
