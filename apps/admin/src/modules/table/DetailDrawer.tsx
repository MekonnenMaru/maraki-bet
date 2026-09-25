"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_WIDTH = { default: 440, wide: 720 } as const;
const MIN_WIDTH = 360;
const STORAGE_KEY = "maraki.admin.drawerWidth";

function clampWidth(width: number) {
  if (typeof window === "undefined") return width;
  const max = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.95));
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(width)));
}

function readStoredWidth(size: "default" | "wide") {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}.${size}`);
    if (!raw) return DEFAULT_WIDTH[size];
    const value = Number(raw);
    return Number.isFinite(value) ? clampWidth(value) : DEFAULT_WIDTH[size];
  } catch {
    return DEFAULT_WIDTH[size];
  }
}

export function DetailDrawer({
  open,
  title,
  onClose,
  children,
  footer,
  size = "default",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "default" | "wide";
}) {
  const [width, setWidth] = useState(() => DEFAULT_WIDTH[size]);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH[size]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (!open) return;
    const next = readStoredWidth(size);
    widthRef.current = next;
    setWidth(next);
  }, [open, size]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const persistWidth = useCallback(
    (next: number) => {
      try {
        sessionStorage.setItem(`${STORAGE_KEY}.${size}`, String(next));
      } catch {
        /* ignore */
      }
    },
    [size],
  );

  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    dragStartX.current = event.clientX;
    dragStartWidth.current = widthRef.current;
    setDragging(true);
    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const next = clampWidth(dragStartWidth.current + (dragStartX.current - moveEvent.clientX));
      widthRef.current = next;
      setWidth(next);
    };

    const onUp = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      setDragging(false);
      persistWidth(widthRef.current);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  if (!open) return null;

  return (
    <div
      className={`drawer-root${dragging ? " resizing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" className="drawer-backdrop" aria-label="Close detail" onClick={onClose} />
      <aside className={`drawer-panel${size === "wide" ? " wide" : ""}`} style={{ width }}>
        <button
          type="button"
          className="drawer-resize"
          aria-label="Drag to resize drawer"
          title="Drag to resize"
          onPointerDown={startDrag}
        />
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function DetailGrid({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="detail-grid">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
