"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type NotifyKind = "success" | "error" | "info" | "warn";

export type NotifyOptions = {
  title?: string;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  kind: NotifyKind;
  message: string;
  title?: string;
  durationMs: number;
};

type NotifyApi = {
  push: (kind: NotifyKind, message: string, options?: NotifyOptions) => void;
  success: (message: string, options?: NotifyOptions) => void;
  error: (message: string, options?: NotifyOptions) => void;
  info: (message: string, options?: NotifyOptions) => void;
  warn: (message: string, options?: NotifyOptions) => void;
  dismiss: (id: string) => void;
};

const NotifyContext = createContext<NotifyApi | null>(null);

let externalApi: NotifyApi | null = null;

/** Imperative helper for non-React call sites (clipboard, etc.). */
export const notify: NotifyApi = {
  push(kind, message, options) {
    externalApi?.push(kind, message, options);
  },
  success(message, options) {
    externalApi?.success(message, options);
  },
  error(message, options) {
    externalApi?.error(message, options);
  },
  info(message, options) {
    externalApi?.info(message, options);
  },
  warn(message, options) {
    externalApi?.warn(message, options);
  },
  dismiss(id) {
    externalApi?.dismiss(id);
  },
};

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (kind: NotifyKind, message: string, options?: NotifyOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const durationMs = options?.durationMs ?? (kind === "error" ? 5200 : 3200);
      setItems((current) => [
        ...current.slice(-4),
        { id, kind, message, title: options?.title, durationMs },
      ]);
    },
    [],
  );

  const api = useMemo<NotifyApi>(
    () => ({
      push,
      success: (message, options) => push("success", message, options),
      error: (message, options) => push("error", message, options),
      info: (message, options) => push("info", message, options),
      warn: (message, options) => push("warn", message, options),
      dismiss,
    }),
    [push, dismiss],
  );

  useEffect(() => {
    externalApi = api;
    return () => {
      if (externalApi === api) externalApi = null;
    };
  }, [api]);

  return (
    <NotifyContext.Provider value={api}>
      {children}
      <div className="maraki-toasts" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <Toast key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const value = useContext(NotifyContext);
  if (!value) throw new Error("useNotify must be used inside NotifyProvider");
  return value;
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => window.clearTimeout(timer);
  }, [item.id, item.durationMs, onDismiss]);

  return (
    <div className={`maraki-toast maraki-toast-${item.kind}`} role="status">
      <div className="maraki-toast-body">
        {item.title ? <strong>{item.title}</strong> : null}
        <span>{item.message}</span>
      </div>
      <button
        type="button"
        className="maraki-toast-close"
        aria-label="Dismiss"
        onClick={() => onDismiss(item.id)}
      >
        ×
      </button>
    </div>
  );
}
